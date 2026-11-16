import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate, openDb } from "./db/index.js";
import { createTask } from "./store.js";
import {
  applyCallback,
  applyDecision,
  assignManual,
  cancelRouting,
  reconcileOnBoot,
  startRouting,
  StateError,
} from "./transitions.js";

function setup() {
  const dir = mkdtempSync(join(tmpdir(), "relay-tx-test-"));
  const db = openDb(join(dir, "test.db"));
  migrate(db);
  db.prepare("INSERT INTO contributors (id, name, expertise) VALUES (?, ?, ?)").run(
    "c1",
    "Asha",
    JSON.stringify(["finance"]),
  );
  db.prepare("INSERT INTO contributors (id, name, expertise) VALUES (?, ?, ?)").run(
    "c2",
    "Ben",
    JSON.stringify(["finance", "operations"]),
  );
  return db;
}

function mkTask(db: DatabaseSync, expertise = "finance") {
  return createTask(db, { title: "T", expertise, priority: "normal" });
}

function history(db: DatabaseSync, taskId: string) {
  return db
    .prepare("SELECT kind, seq FROM history_events WHERE task_id = ? ORDER BY seq ASC")
    .all(taskId) as Array<{ kind: string; seq: number }>;
}

function stateOf(db: DatabaseSync, id: string) {
  return (db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as { state: string }).state;
}

describe("state machine guard", () => {
  it("rejects stale request IDs and logs them without state change", () => {
    const db = setup();
    const t = mkTask(db);
    startRouting(db, t.id, "R1");
    assignManual(db, t.id, "c1"); // operator intervenes; R1 superseded
    const res = applyCallback(db, { routingRequestId: "R1", outcome: "matched", contributorId: "c2" });
    expect(res).toEqual({ applied: false, reason: "stale-request-id" });
    const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(t.id) as {
      state: string;
      active_assignee_id: string;
    };
    expect(row.state).toBe("assigned");
    expect(row.active_assignee_id).toBe("c1"); // operator's choice stands
    expect(history(db, t.id).map((h) => h.kind)).toContain("superseded-callback-ignored");
    db.close();
  });

  it("rejects double-assign: a second engine answer is ignored, never applied", () => {
    const db = setup();
    const t = mkTask(db);
    startRouting(db, t.id, "R1");
    expect(
      applyCallback(db, { routingRequestId: "R1", outcome: "matched", contributorId: "c1" }),
    ).toEqual({ applied: true });
    // Simulate a racing second attempt answered late.
    db.prepare(
      "INSERT INTO routing_attempts (request_id, task_id, status, dispatched_at) VALUES (?, ?, 'pending', ?)",
    ).run("R2", t.id, new Date().toISOString());
    db.prepare("UPDATE tasks SET active_routing_request_id = ? WHERE id = ?").run("R2", t.id);
    expect(
      applyCallback(db, { routingRequestId: "R2", outcome: "matched", contributorId: "c2" }),
    ).toEqual({ applied: false, reason: "stale-request-id" });
    const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(t.id) as {
      active_assignee_id: string;
    };
    expect(row.active_assignee_id).toBe("c1");
    expect(history(db, t.id).map((h) => h.kind)).toContain("superseded-callback-ignored");
    db.close();
  });

  it("accept is terminal: every further transition is rejected", () => {
    const db = setup();
    const t = mkTask(db);
    startRouting(db, t.id, "R1");
    applyCallback(db, { routingRequestId: "R1", outcome: "matched", contributorId: "c1" });
    applyDecision(db, t.id, "accept");
    expect(stateOf(db, t.id)).toBe("accepted");
    expect(() => startRouting(db, t.id, "R2")).toThrowError(/accepted/);
    expect(() => assignManual(db, t.id, "c2")).toThrowError(/accepted/);
    expect(() => applyDecision(db, t.id, "decline")).toThrowError(/terminal/);
    expect(() => cancelRouting(db, t.id)).toThrowError(StateError);
    db.close();
  });

  it("no-match returns the task to created so it can be re-routed", () => {
    const db = setup();
    const t = mkTask(db);
    startRouting(db, t.id, "R1");
    expect(applyCallback(db, { routingRequestId: "R1", outcome: "no-match" })).toEqual({
      applied: true,
    });
    expect(stateOf(db, t.id)).toBe("created");
    startRouting(db, t.id, "R2"); // recovery path works
    expect(stateOf(db, t.id)).toBe("routing");
    db.close();
  });

  it("decline/fail clear the assignee and allow recovery; history stays append-only", () => {
    const db = setup();
    const t = mkTask(db);
    startRouting(db, t.id, "R1");
    applyCallback(db, { routingRequestId: "R1", outcome: "matched", contributorId: "c1" });
    applyDecision(db, t.id, "decline");
    expect(stateOf(db, t.id)).toBe("declined");
    startRouting(db, t.id, "R2");
    const kinds = history(db, t.id).map((h) => h.kind);
    expect(kinds).toEqual(["created", "routing-started", "assigned", "declined", "routing-started"]);
    const seqs = history(db, t.id).map((h) => h.seq);
    expect(seqs).toEqual([0, 1, 2, 3, 4]);
    db.close();
  });

  it("duplicate route while pending is rejected", () => {
    const db = setup();
    const t = mkTask(db);
    startRouting(db, t.id, "R1");
    expect(() => startRouting(db, t.id, "R2")).toThrowError(StateError);
    db.close();
  });

  it("boot reconcile flags old pendings suspect, leaves fresh ones, stays applicable", () => {
    const db = setup();
    db.prepare("INSERT INTO contributors (id, name, expertise) VALUES (?, ?, ?)").run(
      "c9",
      "Zed",
      JSON.stringify(["finance"]),
    );
    const old = mkTask(db);
    const fresh = mkTask(db);
    const now = Date.now();
    startRouting(db, old.id, "R-OLD", new Date(now - 60_000).toISOString());
    // Backdate the dispatch to simulate a pre-restart pending attempt.
    db.prepare("UPDATE routing_attempts SET dispatched_at = ? WHERE request_id = ?").run(
      new Date(now - 60_000).toISOString(),
      "R-OLD",
    );
    startRouting(db, fresh.id, "R-FRESH", new Date(now).toISOString());

    expect(reconcileOnBoot(db, now)).toBe(1);
    const statuses = db
      .prepare("SELECT request_id, status FROM routing_attempts ORDER BY request_id")
      .all() as Array<{ request_id: string; status: string }>;
    expect(statuses).toEqual([
      { request_id: "R-FRESH", status: "pending" },
      { request_id: "R-OLD", status: "suspect" },
    ]);
    expect(history(db, old.id).map((h) => h.kind)).toContain("marked-suspect");
    expect(stateOf(db, old.id)).toBe("routing"); // never auto-failed
    expect(reconcileOnBoot(db, now)).toBe(0); // idempotent

    // A merely-slow engine answer to the suspect attempt still applies.
    expect(
      applyCallback(db, { routingRequestId: "R-OLD", outcome: "matched", contributorId: "c9" }),
    ).toEqual({ applied: true });
    expect(stateOf(db, old.id)).toBe("assigned");
    db.close();
  });

  it("override on a suspect attempt supersedes it (Q3: leaves the poll feed)", () => {
    const db = setup();
    const t = mkTask(db);
    const now = Date.now();
    startRouting(db, t.id, "R1", new Date(now - 60_000).toISOString());
    db.prepare("UPDATE routing_attempts SET dispatched_at = ? WHERE request_id = ?").run(
      new Date(now - 60_000).toISOString(),
      "R1",
    );
    expect(reconcileOnBoot(db, now)).toBe(1);
    assignManual(db, t.id, "c1");
    const status = db
      .prepare("SELECT status FROM routing_attempts WHERE request_id = ?")
      .get("R1") as { status: string };
    expect(status.status).toBe("superseded");
    // Poll feed no longer carries it: superseded + task not routing.
    const feed = db
      .prepare(
        `SELECT a.request_id FROM routing_attempts a JOIN tasks t ON t.id = a.task_id
         WHERE a.status IN ('pending', 'suspect') AND t.state = 'routing'`,
      )
      .all();
    expect(feed).toEqual([]);
    db.close();
  });
});
