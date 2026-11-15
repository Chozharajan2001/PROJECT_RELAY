import { z } from "zod";

/** Known expertise areas. `legal` is intentionally rare: no seeded contributor
 *  has it, so it deterministically exercises the engine's no-match path. */
export const EXPERTISE_AREAS = [
  "finance",
  "healthcare",
  "data-analysis",
  "operations",
  "legal",
] as const;
export const Expertise = z.enum(EXPERTISE_AREAS);
export type Expertise = z.infer<typeof Expertise>;

export const Priority = z.enum(["low", "normal", "high"]);
export type Priority = z.infer<typeof Priority>;

/** Task lifecycle. `routing` + age > suspect threshold is *displayed* as
 *  suspect; it is not a separate state (see ADR-001). */
export const TaskState = z.enum([
  "created",
  "routing",
  "assigned",
  "accepted",
  "declined",
  "failed",
]);
export type TaskState = z.infer<typeof TaskState>;

export const AssignedBy = z.enum(["engine", "operator"]);
export type AssignedBy = z.infer<typeof AssignedBy>;

export const Contributor = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  expertise: z.array(Expertise).min(1),
});
export type Contributor = z.infer<typeof Contributor>;

export const Task = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  expertise: Expertise,
  priority: Priority,
  state: TaskState,
  /** Request ID of the in-flight routing attempt, if any. Fencing key (ADR-001). */
  activeRoutingRequestId: z.string().nullable(),
  activeAssigneeId: z.string().nullable(),
  assignedBy: AssignedBy.nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Task = z.infer<typeof Task>;

export const RoutingAttemptStatus = z.enum([
  "pending",
  "matched",
  "no-match",
  "superseded",
  "suspect",
]);
export type RoutingAttemptStatus = z.infer<typeof RoutingAttemptStatus>;

export const RoutingAttempt = z.object({
  requestId: z.string().min(1),
  taskId: z.string().min(1),
  status: RoutingAttemptStatus,
  dispatchedAt: z.string().datetime({ offset: true }),
  resolvedAt: z.string().datetime({ offset: true }).nullable(),
  /** Contributor chosen by the engine; null for no-match / unresolved. */
  outcomeContributorId: z.string().nullable(),
});
export type RoutingAttempt = z.infer<typeof RoutingAttempt>;

export const HistoryEventKind = z.enum([
  "created",
  "routing-started",
  "matched",
  "no-match",
  "assigned",
  "accepted",
  "declined",
  "failed",
  "overridden",
  "recovered",
  "superseded-callback-ignored",
  "marked-suspect",
]);
export type HistoryEventKind = z.infer<typeof HistoryEventKind>;

export const HistoryEvent = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  kind: HistoryEventKind,
  payload: z.record(z.unknown()),
  at: z.string().datetime({ offset: true }),
});
export type HistoryEvent = z.infer<typeof HistoryEvent>;

/** Demo/test fault-injection for the engine (ADR-003). Absent = true random engine. */
export const EngineOverride = z.union([
  z.object({ delayMs: z.number().int().min(0).max(60_000) }).strict(),
  z.object({ drop: z.literal(true) }).strict(),
  z.object({ forceNoMatch: z.literal(true) }).strict(),
]);
export type EngineOverride = z.infer<typeof EngineOverride>;

export const RouteRequest = z.object({
  engine: EngineOverride.optional(),
});
export type RouteRequest = z.infer<typeof RouteRequest>;

/** Engine → API. Only the attempt matching the task's activeRoutingRequestId
 *  may transition the task; anything else is recorded + ignored (ADR-001). */
export const RoutingCallback = z
  .object({
    routingRequestId: z.string().min(1),
    outcome: z.enum(["matched", "no-match"]),
    contributorId: z.string().min(1).optional(),
  })
  .refine(
    (v) => (v.outcome === "matched" ? v.contributorId !== undefined : true),
    { message: "contributorId is required when outcome is matched" },
  );
export type RoutingCallback = z.infer<typeof RoutingCallback>;

export const OverrideRequest = z.object({
  contributorId: z.string().min(1).optional(),
  cancel: z.literal(true).optional(),
});
export type OverrideRequest = z.infer<typeof OverrideRequest>;

/** Task as served by GET /tasks: includes live age for the operator board. */
export const TaskWithAge = Task.extend({
  ageSeconds: z.number().nonnegative(),
  /** True when the active routing attempt was flagged suspect (ADR-001). Display-only. */
  suspect: z.boolean(),
});
export type TaskWithAge = z.infer<typeof TaskWithAge>;

export const CONTRACTS_VERSION = "0.1.0";
