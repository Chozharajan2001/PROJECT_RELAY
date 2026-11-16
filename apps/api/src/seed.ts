// Seed script (T-5.1.1): 10 contributors + 20 tasks. Idempotent — fixed IDs
// with INSERT OR IGNORE, safe to rerun. No contributor holds the `legal`
// expertise, so the engine's explicit no-match path stays reachable.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrate, openDb } from "./db/index.js";

const DB_PATH = process.env.DB_PATH ?? "data/relay.db";

const CONTRIBUTORS: Array<{ id: string; name: string; expertise: string[] }> = [
  { id: "seed-c01", name: "Asha Rao", expertise: ["finance"] },
  { id: "seed-c02", name: "Ben Okafor", expertise: ["finance", "operations"] },
  { id: "seed-c03", name: "Meera Iyer", expertise: ["finance", "data-analysis"] },
  { id: "seed-c04", name: "Sara Lindqvist", expertise: ["healthcare"] },
  { id: "seed-c05", name: "David Chen", expertise: ["healthcare", "operations"] },
  { id: "seed-c06", name: "Priya Nair", expertise: ["data-analysis"] },
  { id: "seed-c07", name: "Tom Becker", expertise: ["data-analysis", "finance"] },
  { id: "seed-c08", name: "Nadia Hassan", expertise: ["operations"] },
  { id: "seed-c09", name: "Leo Martins", expertise: ["operations", "healthcare"] },
  { id: "seed-c10", name: "Grace Kim", expertise: ["healthcare", "data-analysis"] },
];

const TASKS: Array<{
  id: string;
  title: string;
  expertise: (typeof CONTRIBUTORS)[number]["expertise"][number] | "legal";
  priority: "low" | "normal" | "high";
}> = [
  { id: "seed-t01", title: "Audit Q3 books", expertise: "finance", priority: "high" },
  { id: "seed-t02", title: "Reconcile vendor payouts", expertise: "finance", priority: "normal" },
  { id: "seed-t03", title: "Tax filing review", expertise: "finance", priority: "normal" },
  { id: "seed-t04", title: "Budget forecast model", expertise: "finance", priority: "low" },
  { id: "seed-t05", title: "Fraud alert triage", expertise: "finance", priority: "high" },
  { id: "seed-t06", title: "Hire ICU nurse", expertise: "healthcare", priority: "high" },
  { id: "seed-t07", title: "Patient intake audit", expertise: "healthcare", priority: "normal" },
  { id: "seed-t08", title: "Vaccine drive staffing", expertise: "healthcare", priority: "normal" },
  { id: "seed-t09", title: "Lab result backlog", expertise: "healthcare", priority: "low" },
  { id: "seed-t10", title: "Churn dashboard", expertise: "data-analysis", priority: "high" },
  { id: "seed-t11", title: "Sales pipeline cleanup", expertise: "data-analysis", priority: "normal" },
  { id: "seed-t12", title: "A/B test readout", expertise: "data-analysis", priority: "normal" },
  { id: "seed-t13", title: "Warehouse shift plan", expertise: "operations", priority: "high" },
  { id: "seed-t14", title: "Supplier onboarding", expertise: "operations", priority: "normal" },
  { id: "seed-t15", title: "Fleet maintenance rota", expertise: "operations", priority: "normal" },
  { id: "seed-t16", title: "Office relocation checklist", expertise: "operations", priority: "low" },
  { id: "seed-t17", title: "Claims dispute review", expertise: "finance", priority: "normal" },
  { id: "seed-t18", title: "Trial data validation", expertise: "healthcare", priority: "high" },
  { id: "seed-t19", title: "Demand forecast refresh", expertise: "data-analysis", priority: "low" },
  { id: "seed-t20", title: "Counsel opinion needed", expertise: "legal", priority: "high" },
];

export function runSeed(dbPath: string = DB_PATH): { contributors: number; tasks: number } {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = openDb(dbPath);
  migrate(db);
  const insertContributor = db.prepare(
    "INSERT OR IGNORE INTO contributors (id, name, expertise) VALUES (?, ?, ?)",
  );
  for (const c of CONTRIBUTORS) insertContributor.run(c.id, c.name, JSON.stringify(c.expertise));
  const now = new Date().toISOString();
  const insertTask = db.prepare(
    `INSERT OR IGNORE INTO tasks (id, title, expertise, priority, state,
      active_routing_request_id, active_assignee_id, assigned_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'created', NULL, NULL, NULL, ?, ?)`,
  );
  for (const t of TASKS) insertTask.run(t.id, t.title, t.expertise, t.priority, now, now);
  insertHistoryIgnore(db);
  const contributors = (db.prepare("SELECT COUNT(*) AS n FROM contributors").get() as { n: number }).n;
  const tasks = (db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE id LIKE 'seed-%'").get() as { n: number }).n;
  db.close();
  return { contributors, tasks };
}

function insertHistoryIgnore(db: ReturnType<typeof openDb>): void {
  const existing = new Set(
    (db.prepare("SELECT id FROM history_events WHERE id LIKE 'seed-h%'").all() as Array<{ id: string }>).map(
      (r) => r.id,
    ),
  );
  const insert = db.prepare(
    "INSERT OR IGNORE INTO history_events (id, task_id, seq, kind, payload, at) VALUES (?, ?, 0, 'created', ?, ?)",
  );
  for (const t of TASKS) {
    const hid = `seed-h-${t.id}`;
    if (existing.has(hid)) continue;
    insert.run(hid, t.id, JSON.stringify({ title: t.title, seed: true }), new Date().toISOString());
  }
}

const isMain =
  process.argv[1] !== undefined && /seed\.(ts|js|cjs|mjs)$/.test(process.argv[1]);
if (isMain) {
  const ran = runSeed();
  // eslint-disable-next-line no-console
  console.log(`seeded: ${ran.contributors} contributors, ${ran.tasks} tasks (db=${DB_PATH})`);
}
