import { DatabaseSync } from "node:sqlite";

export const SCHEMA_VERSION = 1;

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      expertise TEXT NOT NULL,
      priority TEXT NOT NULL,
      state TEXT NOT NULL,
      active_routing_request_id TEXT NULL,
      active_assignee_id TEXT NULL,
      assigned_by TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE contributors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      expertise TEXT NOT NULL
    );
    CREATE TABLE routing_attempts (
      request_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      status TEXT NOT NULL,
      dispatched_at TEXT NOT NULL,
      resolved_at TEXT NULL,
      outcome_contributor_id TEXT NULL
    );
    CREATE TABLE history_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      seq INTEGER NOT NULL,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      at TEXT NOT NULL,
      UNIQUE (task_id, seq)
    );
    CREATE INDEX idx_tasks_state ON tasks(state);
    CREATE INDEX idx_attempts_task_status ON routing_attempts(task_id, status);
    CREATE INDEX idx_history_task_seq ON history_events(task_id, seq);
    `,
  },
];

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(
    "CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);",
  );
  return db;
}

/** Applies pending migrations in order. Safe to re-run (idempotent). */
export function migrate(db: DatabaseSync): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS v FROM migrations")
    .get() as { v: number };
  let current = row.v;
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      db.exec(m.sql);
      db.prepare("INSERT INTO migrations (version, applied_at) VALUES (?, ?)").run(
        m.version,
        new Date().toISOString(),
      );
      current = m.version;
    }
  }
  return current;
}

export function schemaVersion(db: DatabaseSync): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(version), 0) AS v FROM migrations")
    .get() as { v: number };
  return row.v;
}
