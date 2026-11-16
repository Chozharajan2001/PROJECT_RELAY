import type { DatabaseSync } from "node:sqlite";
import { insertHistory, SUSPECT_AFTER_MS } from "./store.js";

/**
 * State machine guard (DESIGN §4, ADR-001).
 * - Only the attempt matching the task's activeRoutingRequestId may transition it.
 * - At most one active assignee; engine callbacks never add a second (rejected as superseded).
 * - Operator override may replace the assignee (intervention) but never touches `accepted`.
 * - Every outcome appends a history event; history is append-only.
 */
export class StateError extends Error {
  readonly code:
    | "UNKNOWN_TASK"
    | "UNKNOWN_CONTRIBUTOR"
    | "INVALID_STATE"
    | "STALE_REQUEST"
    | "TERMINAL_STATE";
  constructor(
    code: StateError["code"],
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

interface TaskRow {
  id: string;
  state: string;
  active_routing_request_id: string | null;
  active_assignee_id: string | null;
}

function getTask(db: DatabaseSync, taskId: string): TaskRow {
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as
    | TaskRow
    | undefined;
  if (!row) throw new StateError("UNKNOWN_TASK", `unknown task: ${taskId}`);
  return row;
}

function touch(db: DatabaseSync, taskId: string): void {
  db.prepare("UPDATE tasks SET updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    taskId,
  );
}

const ROUTABLE_FROM = ["created", "declined", "failed"];

/** Operator/engine request to start a routing attempt. */
export function startRouting(
  db: DatabaseSync,
  taskId: string,
  requestId: string,
  nowIso = new Date().toISOString(),
): void {
  const task = getTask(db, taskId);
  if (task.state === "accepted")
    throw new StateError("TERMINAL_STATE", "accepted tasks cannot be re-routed");
  if (!ROUTABLE_FROM.includes(task.state))
    throw new StateError(
      "INVALID_STATE",
      `cannot route from state ${task.state} (override or resolve first)`,
    );
  if (task.active_routing_request_id !== null)
    throw new StateError("INVALID_STATE", "a routing attempt is already pending");
  db.prepare(
    "INSERT INTO routing_attempts (request_id, task_id, status, dispatched_at, resolved_at, outcome_contributor_id) VALUES (?, ?, 'pending', ?, NULL, NULL)",
  ).run(requestId, taskId, nowIso);
  db.prepare(
    "UPDATE tasks SET state = 'routing', active_routing_request_id = ? WHERE id = ?",
  ).run(requestId, taskId);
  touch(db, taskId);
  insertHistory(db, taskId, "routing-started", { requestId });
}

/** Engine callback. Returns true when applied, false when ignored as stale. */
export function applyCallback(
  db: DatabaseSync,
  input: { routingRequestId: string; outcome: "matched" | "no-match"; contributorId?: string },
  nowIso = new Date().toISOString(),
): { applied: boolean; reason?: string } {
  const attempt = db
    .prepare("SELECT * FROM routing_attempts WHERE request_id = ?")
    .get(input.routingRequestId) as
    | { request_id: string; task_id: string; status: string }
    | undefined;
  if (!attempt) return { applied: false, reason: "unknown-request" };
  if (attempt.status !== "pending" && attempt.status !== "suspect") {
    // Late duplicate or already-superseded answer: audit-log it, change nothing.
    insertHistory(db, attempt.task_id, "superseded-callback-ignored", {
      requestId: input.routingRequestId,
      outcome: input.outcome,
      priorStatus: attempt.status,
    });
    return { applied: false, reason: "stale-request-id" };
  }

  const task = getTask(db, attempt.task_id);
  if (task.state !== "routing" || task.active_routing_request_id !== input.routingRequestId) {
    db.prepare("UPDATE routing_attempts SET status = 'superseded', resolved_at = ? WHERE request_id = ?").run(
      nowIso,
      input.routingRequestId,
    );
    insertHistory(db, task.id, "superseded-callback-ignored", {
      requestId: input.routingRequestId,
      outcome: input.outcome,
    });
    return { applied: false, reason: "stale-request-id" };
  }

  if (input.outcome === "no-match") {
    db.prepare("UPDATE routing_attempts SET status = 'no-match', resolved_at = ? WHERE request_id = ?").run(
      nowIso,
      input.routingRequestId,
    );
    db.prepare(
      "UPDATE tasks SET state = 'created', active_routing_request_id = NULL WHERE id = ?",
    ).run(task.id);
    touch(db, task.id);
    insertHistory(db, task.id, "no-match", { requestId: input.routingRequestId });
    return { applied: true };
  }

  // matched
  if (!input.contributorId)
    throw new StateError("INVALID_STATE", "matched outcome requires contributorId");
  const contributor = db
    .prepare("SELECT id FROM contributors WHERE id = ?")
    .get(input.contributorId) as { id: string } | undefined;
  if (!contributor)
    throw new StateError("UNKNOWN_CONTRIBUTOR", `unknown contributor: ${input.contributorId}`);
  // Note: task.active_assignee_id is always null here — any assigned task fails the
  // state==='routing' check above and is ignored as stale. No second assignee is possible.
  db.prepare("UPDATE routing_attempts SET status = 'matched', resolved_at = ?, outcome_contributor_id = ? WHERE request_id = ?").run(
    nowIso,
    input.contributorId,
    input.routingRequestId,
  );
  db.prepare(
    "UPDATE tasks SET state = 'assigned', active_assignee_id = ?, assigned_by = 'engine' WHERE id = ?",
  ).run(input.contributorId, task.id);
  touch(db, task.id);
  insertHistory(db, task.id, "assigned", {
    requestId: input.routingRequestId,
    contributorId: input.contributorId,
    by: "engine",
  });
  return { applied: true };
}

/** Operator manual assign/replace. Supersedes any pending attempt. */
export function assignManual(
  db: DatabaseSync,
  taskId: string,
  contributorId: string,
): void {
  const task = getTask(db, taskId);
  if (task.state === "accepted")
    throw new StateError("TERMINAL_STATE", "accepted tasks cannot be reassigned");
  const contributor = db
    .prepare("SELECT id FROM contributors WHERE id = ?")
    .get(contributorId) as { id: string } | undefined;
  if (!contributor)
    throw new StateError("UNKNOWN_CONTRIBUTOR", `unknown contributor: ${contributorId}`);
  supersedePending(db, task.active_routing_request_id);
  db.prepare(
    "UPDATE tasks SET state = 'assigned', active_assignee_id = ?, assigned_by = 'operator', active_routing_request_id = NULL WHERE id = ?",
  ).run(contributorId, taskId);
  touch(db, taskId);
  insertHistory(db, taskId, "overridden", { contributorId, by: "operator" });
}

/** Operator cancels a pending routing attempt, back to created. */
export function cancelRouting(db: DatabaseSync, taskId: string): void {
  const task = getTask(db, taskId);
  if (task.state !== "routing" || task.active_routing_request_id === null)
    throw new StateError("INVALID_STATE", "no pending routing to cancel");
  supersedePending(db, task.active_routing_request_id);
  db.prepare(
    "UPDATE tasks SET state = 'created', active_routing_request_id = NULL WHERE id = ?",
  ).run(taskId);
  touch(db, taskId);
  insertHistory(db, taskId, "overridden", { action: "cancel-routing" });
}

function supersedePending(db: DatabaseSync, requestId: string | null): void {
  if (requestId === null) return;
  // Flip both pending and already-flagged suspect attempts: a superseded attempt
  // must leave the poll feed, or the worker re-claims it after every restart (Q3).
  db.prepare(
    "UPDATE routing_attempts SET status = 'superseded', resolved_at = ? WHERE request_id = ? AND status IN ('pending', 'suspect')",
  ).run(new Date().toISOString(), requestId);
}

export type Decision = "accept" | "decline" | "fail";

/** Operator/contributor decision on an assigned task. Accept is terminal. */
export function applyDecision(db: DatabaseSync, taskId: string, decision: Decision): void {
  const task = getTask(db, taskId);
  if (task.state === "accepted")
    throw new StateError("TERMINAL_STATE", "accepted is terminal");
  if (task.state !== "assigned" || task.active_assignee_id === null)
    throw new StateError("INVALID_STATE", `cannot ${decision} from state ${task.state}`);
  if (decision === "accept") {
    db.prepare("UPDATE tasks SET state = 'accepted', active_routing_request_id = NULL WHERE id = ?").run(
      taskId,
    );
    touch(db, taskId);
    insertHistory(db, taskId, "accepted", { contributorId: task.active_assignee_id });
    return;
  }
  db.prepare(
    "UPDATE tasks SET state = ?, active_assignee_id = NULL, active_routing_request_id = NULL WHERE id = ?",
  ).run(decision === "decline" ? "declined" : "failed", taskId);
  touch(db, taskId);
  insertHistory(db, taskId, decision === "decline" ? "declined" : "failed", {
    contributorId: task.active_assignee_id,
  });
}

/** Default age after which a pending attempt is flagged `suspect` (ADR-001). */
export { SUSPECT_AFTER_MS };

/**
 * Boot reconcile: attempts still `pending` past the suspect threshold are marked
 * `suspect` (with history) — never auto-failed. Returns the number flagged.
 * Safe to run on every boot (idempotent: only `pending` rows are touched).
 */
export function reconcileOnBoot(
  db: DatabaseSync,
  nowMs = Date.now(),
  suspectAfterMs = SUSPECT_AFTER_MS,
): number {
  const cutoff = new Date(nowMs - suspectAfterMs).toISOString();
  const stale = db
    .prepare("SELECT request_id, task_id FROM routing_attempts WHERE status = 'pending' AND dispatched_at < ?")
    .all(cutoff) as Array<{ request_id: string; task_id: string }>;
  for (const s of stale) {
    db.prepare("UPDATE routing_attempts SET status = 'suspect' WHERE request_id = ?").run(
      s.request_id,
    );
    insertHistory(db, s.task_id, "marked-suspect", {
      requestId: s.request_id,
      pendingLongerThanMs: suspectAfterMs,
    });
  }
  return stale.length;
}
