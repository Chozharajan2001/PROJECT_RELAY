import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate, openDb, schemaVersion, SCHEMA_VERSION } from "./index.js";

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), "relay-test-"));
  return openDb(join(dir, "test.db"));
}

describe("migrations", () => {
  it("migrates a fresh database to the current schema version", () => {
    const db = tempDb();
    const version = migrate(db);
    expect(version).toBe(SCHEMA_VERSION);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "tasks",
        "contributors",
        "routing_attempts",
        "history_events",
        "migrations",
      ]),
    );
    db.close();
  });

  it("is idempotent: re-running changes nothing", () => {
    const db = tempDb();
    migrate(db);
    const before = db
      .prepare("SELECT COUNT(*) AS n FROM migrations")
      .get() as { n: number };
    migrate(db);
    const after = db
      .prepare("SELECT COUNT(*) AS n FROM migrations")
      .get() as { n: number };
    expect(after.n).toBe(before.n);
    expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
    db.close();
  });

  it("enforces one active assignee history ordering key (task_id, seq)", () => {
    const db = tempDb();
    migrate(db);
    db.prepare(
      "INSERT INTO tasks (id, title, expertise, priority, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("t1", "Books", "finance", "normal", "created", "2026-11-15T10:00:00.000Z", "2026-11-15T10:00:00.000Z");
    db.prepare(
      "INSERT INTO history_events (id, task_id, seq, kind, payload, at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("h1", "t1", 0, "created", "{}", "2026-11-15T10:00:00.000Z");
    expect(() =>
      db
        .prepare(
          "INSERT INTO history_events (id, task_id, seq, kind, payload, at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("h2", "t1", 0, "created", "{}", "2026-11-15T10:00:01.000Z"),
    ).toThrow();
    db.close();
  });
});
