import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  Contributor,
  type Priority,
  Task,
  type TaskState,
  TaskWithAge,
} from "@relay/contracts";

function rowToTask(row: Record<string, unknown>): Task {
  return Task.parse({
    id: row.id,
    title: row.title,
    expertise: row.expertise,
    priority: row.priority,
    state: row.state,
    activeRoutingRequestId: row.active_routing_request_id,
    activeAssigneeId: row.active_assignee_id,
    assignedBy: row.assigned_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function withAge(task: Task, nowMs = Date.now()): TaskWithAge {
  return TaskWithAge.parse({
    ...task,
    ageSeconds: Math.max(0, Math.floor((nowMs - Date.parse(task.createdAt)) / 1000)),
  });
}

export interface CreateTaskInput {
  title: string;
  expertise: string;
  priority: Priority;
}

export function createTask(db: DatabaseSync, input: CreateTaskInput): Task {
  const now = new Date().toISOString();
  const task = {
    id: randomUUID(),
    title: input.title,
    expertise: input.expertise,
    priority: input.priority,
    state: "created" satisfies TaskState,
    activeRoutingRequestId: null,
    activeAssigneeId: null,
    assignedBy: null,
    createdAt: now,
    updatedAt: now,
  };
  const parsed = Task.parse(task);
  db.prepare(
    `INSERT INTO tasks (id, title, expertise, priority, state, active_routing_request_id,
      active_assignee_id, assigned_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    parsed.id,
    parsed.title,
    parsed.expertise,
    parsed.priority,
    parsed.state,
    parsed.activeRoutingRequestId,
    parsed.activeAssigneeId,
    parsed.assignedBy,
    parsed.createdAt,
    parsed.updatedAt,
  );
  insertHistory(db, parsed.id, "created", { title: parsed.title });
  return parsed;
}

export function listTasks(db: DatabaseSync, nowMs = Date.now()): TaskWithAge[] {
  const rows = db
    .prepare("SELECT * FROM tasks ORDER BY created_at ASC")
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => withAge(rowToTask(r), nowMs));
}

export function listContributors(db: DatabaseSync): Contributor[] {
  const rows = db.prepare("SELECT * FROM contributors ORDER BY name ASC").all() as Array<{
    id: string;
    name: string;
    expertise: string;
  }>;
  return rows.map((r) =>
    Contributor.parse({ id: r.id, name: r.name, expertise: JSON.parse(r.expertise) }),
  );
}

export function insertHistory(
  db: DatabaseSync,
  taskId: string,
  kind: string,
  payload: Record<string, unknown>,
): void {
  const row = db
    .prepare("SELECT COALESCE(MAX(seq), -1) AS m FROM history_events WHERE task_id = ?")
    .get(taskId) as { m: number };
  db.prepare(
    "INSERT INTO history_events (id, task_id, seq, kind, payload, at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), taskId, row.m + 1, kind, JSON.stringify(payload), new Date().toISOString());
}

export interface RoutingJob {
  requestId: string;
  taskId: string;
  taskTitle: string;
  expertise: string;
  priority: string;
  scenario: unknown;
  eligibleContributors: Array<{ id: string; name: string }>;
  dispatchedAt: string;
}

/**
 * Poll feed for the engine worker (EPIC-3). The engine claims jobs by acting on
 * them (callback); the API never pushes, so this endpoint is the only coupling.
 */
export function pendingJobs(db: DatabaseSync): RoutingJob[] {
  const attempts = db
    .prepare(
      `SELECT a.request_id, a.dispatched_at, a.scenario, t.id AS task_id, t.title, t.expertise, t.priority
       FROM routing_attempts a JOIN tasks t ON t.id = a.task_id
       WHERE a.status = 'pending' ORDER BY a.dispatched_at ASC`,
    )
    .all() as Array<{
    request_id: string;
    dispatched_at: string;
    scenario: string | null;
    task_id: string;
    title: string;
    expertise: string;
    priority: string;
  }>;
  const contributors = listContributors(db);
  return attempts.map((a) => ({
    requestId: a.request_id,
    taskId: a.task_id,
    taskTitle: a.title,
    expertise: a.expertise,
    priority: a.priority,
    scenario: a.scenario === null ? null : JSON.parse(a.scenario),
    eligibleContributors: contributors
      .filter((c) => c.expertise.includes(a.expertise as never))
      .map((c) => ({ id: c.id, name: c.name })),
    dispatchedAt: a.dispatched_at,
  }));
}
