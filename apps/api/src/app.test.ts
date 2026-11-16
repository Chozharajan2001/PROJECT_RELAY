import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { migrate, openDb } from "./db/index.js";
import { assignManual, reconcileOnBoot } from "./transitions.js";

function testApp() {
  const dir = mkdtempSync(join(tmpdir(), "relay-api-test-"));
  const db = openDb(join(dir, "test.db"));
  migrate(db);
  return { app: createApp(db), db };
}

describe("tasks API", () => {
  it("creates a task and lists it with state created and age", async () => {
    const { app, db } = testApp();
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Audit Q3 books", expertise: "finance", priority: "high" })
      .expect(201);
    expect(created.body.state).toBe("created");
    expect(created.body.activeAssigneeId).toBeNull();

    const list = await request(app).get("/tasks").expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
    expect(list.body[0].state).toBe("created");
    expect(list.body[0].ageSeconds).toBeGreaterThanOrEqual(0);
    db.close();
  });

  it("rejects empty title, unknown expertise, and bad priority with 400", async () => {
    const { app, db } = testApp();
    await request(app).post("/tasks").send({ title: "", expertise: "finance" }).expect(400);
    await request(app)
      .post("/tasks")
      .send({ title: "X", expertise: "astrophysics" })
      .expect(400);
    await request(app)
      .post("/tasks")
      .send({ title: "X", expertise: "finance", priority: "urgent" })
      .expect(400);
    db.close();
  });

  it("serves the contributor directory (empty before seeding)", async () => {
    const { app, db } = testApp();
    const res = await request(app).get("/contributors").expect(200);
    expect(res.body).toEqual([]);
    db.close();
  });

  it("starts a routing attempt: task enters routing, attempt persisted pending", async () => {
    const { app, db } = testApp();
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Hire nurse", expertise: "healthcare" })
      .expect(201);
    const routed = await request(app).post(`/tasks/${created.body.id}/route`).send({}).expect(202);
    expect(typeof routed.body.requestId).toBe("string");
    expect(routed.body.status).toBe("pending");

    const attempt = db
      .prepare("SELECT * FROM routing_attempts WHERE request_id = ?")
      .get(routed.body.requestId) as { status: string; scenario: null };
    expect(attempt.status).toBe("pending");
    expect(attempt.scenario).toBeNull();

    const list = await request(app).get("/tasks").expect(200);
    expect(list.body[0].state).toBe("routing");
    db.close();
  });

  it("persists engine overrides and exposes them on the jobs feed", async () => {
    const { app, db } = testApp();
    db.prepare("INSERT INTO contributors (id, name, expertise) VALUES (?, ?, ?)").run(
      "c1",
      "Asha",
      JSON.stringify(["finance"]),
    );
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Audit", expertise: "finance" })
      .expect(201);
    await request(app)
      .post(`/tasks/${created.body.id}/route`)
      .send({ engine: { drop: true } })
      .expect(202);
    const jobs = await request(app).get("/internal/routing-jobs").expect(200);
    expect(jobs.body).toHaveLength(1);
    expect(jobs.body[0].scenario).toEqual({ drop: true });
    expect(jobs.body[0].eligibleContributors).toEqual([{ id: "c1", name: "Asha" }]);
    db.close();
  });

  it("rejects duplicate route with 409 and unknown task with 404", async () => {
    const { app, db } = testApp();
    const created = await request(app)
      .post("/tasks")
      .send({ title: "X", expertise: "finance" })
      .expect(201);
    await request(app).post(`/tasks/${created.body.id}/route`).send({}).expect(202);
    await request(app).post(`/tasks/${created.body.id}/route`).send({}).expect(409);
    await request(app).post("/tasks/does-not-exist/route").send({}).expect(404);
    db.close();
  });

  it("applies a matched callback: task becomes assigned", async () => {
    const { app, db } = testApp();
    db.prepare("INSERT INTO contributors (id, name, expertise) VALUES (?, ?, ?)").run(
      "c1",
      "Asha",
      JSON.stringify(["finance"]),
    );
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Audit", expertise: "finance" })
      .expect(201);
    const routed = await request(app).post(`/tasks/${created.body.id}/route`).send({}).expect(202);
    const cb = await request(app)
      .post("/internal/routing-callback")
      .send({ routingRequestId: routed.body.requestId, outcome: "matched", contributorId: "c1" })
      .expect(200);
    expect(cb.body).toEqual({ applied: true, reason: null });
    const list = await request(app).get("/tasks").expect(200);
    expect(list.body[0].state).toBe("assigned");
    db.close();
  });

  it("ignores a late callback for a superseded request: nothing changes, history logs it", async () => {
    const { app, db } = testApp();
    db.prepare("INSERT INTO contributors (id, name, expertise) VALUES (?, ?, ?)").run(
      "c1",
      "Asha",
      JSON.stringify(["finance"]),
    );
    db.prepare("INSERT INTO contributors (id, name, expertise) VALUES (?, ?, ?)").run(
      "c2",
      "Ben",
      JSON.stringify(["finance"]),
    );
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Audit", expertise: "finance" })
      .expect(201);
    const routed = await request(app).post(`/tasks/${created.body.id}/route`).send({}).expect(202);
    // Operator intervenes while routing is pending (override endpoint lands in T-2.2.4;
    // same transition function it will call).
    assignManual(db, created.body.id, "c1");
    // Outstanding engine answer arrives late.
    const cb = await request(app)
      .post("/internal/routing-callback")
      .send({ routingRequestId: routed.body.requestId, outcome: "matched", contributorId: "c2" })
      .expect(200);
    expect(cb.body.applied).toBe(false);
    const list = await request(app).get("/tasks").expect(200);
    expect(list.body[0].state).toBe("assigned");
    // History endpoint lands in T-2.2.4; verify the audit row directly.
    const kinds = (
      db
        .prepare("SELECT kind FROM history_events WHERE task_id = ? ORDER BY seq ASC")
        .all(created.body.id) as Array<{ kind: string }>
    ).map((h) => h.kind);
    expect(kinds).toContain("superseded-callback-ignored");
    db.close();
  });

  it("rejects unknown request IDs (404) and malformed callbacks (400)", async () => {
    const { app, db } = testApp();
    await request(app)
      .post("/internal/routing-callback")
      .send({ routingRequestId: "nope", outcome: "no-match" })
      .expect(404);
    await request(app)
      .post("/internal/routing-callback")
      .send({ routingRequestId: "x", outcome: "matched" })
      .expect(400);
    db.close();
  });

  it("override mid-routing supersedes the pending attempt (full HTTP)", async () => {
    const { app, db } = testApp();
    db.prepare("INSERT INTO contributors (id, name, expertise) VALUES (?, ?, ?)").run(
      "c1",
      "Asha",
      JSON.stringify(["finance"]),
    );
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Audit", expertise: "finance" })
      .expect(201);
    await request(app).post(`/tasks/${created.body.id}/route`).send({}).expect(202);
    const ov = await request(app)
      .post(`/tasks/${created.body.id}/override`)
      .send({ contributorId: "c1" })
      .expect(200);
    expect(ov.body.state).toBe("assigned");
    const jobs = await request(app).get("/internal/routing-jobs").expect(200);
    expect(jobs.body).toEqual([]);
    const history = await request(app).get(`/tasks/${created.body.id}/history`).expect(200);
    expect(history.body.map((h: { kind: string }) => h.kind)).toEqual([
      "created",
      "routing-started",
      "overridden",
    ]);
    // Override on accepted task is rejected.
    await request(app).post(`/tasks/${created.body.id}/decision`).send({ decision: "accept" }).expect(200);
    await request(app)
      .post(`/tasks/${created.body.id}/override`)
      .send({ contributorId: "c1" })
      .expect(409);
    db.close();
  });

  it("recover re-routes a declined task; history stays ordered", async () => {
    const { app, db } = testApp();
    db.prepare("INSERT INTO contributors (id, name, expertise) VALUES (?, ?, ?)").run(
      "c1",
      "Asha",
      JSON.stringify(["finance"]),
    );
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Audit", expertise: "finance" })
      .expect(201);
    const routed = await request(app).post(`/tasks/${created.body.id}/route`).send({}).expect(202);
    await request(app)
      .post("/internal/routing-callback")
      .send({ routingRequestId: routed.body.requestId, outcome: "matched", contributorId: "c1" })
      .expect(200);
    await request(app)
      .post(`/tasks/${created.body.id}/decision`)
      .send({ decision: "decline" })
      .expect(200);
    const rec = await request(app).post(`/tasks/${created.body.id}/recover`).send({}).expect(202);
    expect(rec.body.state).toBe("routing");
    const history = await request(app).get(`/tasks/${created.body.id}/history`).expect(200);
    const kinds = history.body.map((h: { kind: string }) => h.kind);
    expect(kinds).toEqual(["created", "routing-started", "assigned", "declined", "routing-started"]);
    expect(history.body.map((h: { seq: number }) => h.seq)).toEqual([0, 1, 2, 3, 4]);
    db.close();
  });

  it("exposes suspect tasks on the board feed", async () => {
    const { app, db } = testApp();
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Stuck", expertise: "finance" })
      .expect(201);
    const routed = await request(app).post(`/tasks/${created.body.id}/route`).send({}).expect(202);
    db.prepare("UPDATE routing_attempts SET dispatched_at = ? WHERE request_id = ?").run(
      new Date(Date.now() - 60_000).toISOString(),
      routed.body.requestId,
    );
    expect(reconcileOnBoot(db)).toBe(1);
    const list = await request(app).get("/tasks").expect(200);
    expect(list.body[0].state).toBe("routing");
    expect(list.body[0].suspect).toBe(true);
    db.close();
  });

  it("flags a live overdue pending as suspect with no restart (Q1)", async () => {
    const { app, db } = testApp();
    const created = await request(app)
      .post("/tasks")
      .send({ title: "Live stuck", expertise: "finance" })
      .expect(201);
    const routed = await request(app).post(`/tasks/${created.body.id}/route`).send({}).expect(202);
    // Backdate only: no reconcile, no restart — the read path must flag it.
    db.prepare("UPDATE routing_attempts SET dispatched_at = ? WHERE request_id = ?").run(
      new Date(Date.now() - 60_000).toISOString(),
      routed.body.requestId,
    );
    const list = await request(app).get("/tasks").expect(200);
    expect(list.body[0].state).toBe("routing");
    expect(list.body[0].suspect).toBe(true);
    db.close();
  });

  it("gates /internal/* behind the shared secret when configured (Q4)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-api-test-"));
    const gatedDb = openDb(join(dir, "test.db"));
    migrate(gatedDb);
    const gated = createApp(gatedDb, { internalSecret: "s3cret" });
    await request(gated).get("/internal/routing-jobs").expect(403);
    await request(gated)
      .post("/internal/routing-callback")
      .send({ routingRequestId: "x", outcome: "no-match" })
      .expect(403);
    await request(gated)
      .get("/internal/routing-jobs")
      .set("x-relay-internal-secret", "s3cret")
      .expect(200);
    // Public surface unaffected.
    await request(gated).get("/tasks").expect(200);
    gatedDb.close();
  });

  it("rejects bad override/decision bodies and unknown-task history", async () => {
    const { app, db } = testApp();
    const created = await request(app)
      .post("/tasks")
      .send({ title: "X", expertise: "finance" })
      .expect(201);
    await request(app).post(`/tasks/${created.body.id}/override`).send({}).expect(400);
    await request(app).post(`/tasks/${created.body.id}/decision`).send({ decision: "maybe" }).expect(400);
    await request(app).post(`/tasks/${created.body.id}/decision`).send({ decision: "accept" }).expect(409);
    await request(app).get("/tasks/does-not-exist/history").expect(404);
    db.close();
  });
});
