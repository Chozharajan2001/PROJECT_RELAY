import type { DatabaseSync } from "node:sqlite";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import { Expertise, OverrideRequest, RouteRequest, RoutingCallback } from "@relay/contracts";
import express from "express";
import { z } from "zod";
import {
  createTask,
  getTask,
  listContributors,
  listTasks,
  pendingJobs,
  SUSPECT_AFTER_MS,
  taskHistory,
} from "./store.js";
import {
  applyCallback,
  applyDecision,
  assignManual,
  cancelRouting,
  startRouting,
  StateError,
  type Decision,
} from "./transitions.js";

const CreateTaskBody = z.object({
  title: z.string().min(1).max(200),
  expertise: z.string().min(1),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

/** Single mapping for StateError → HTTP (Q9): unknown → 404, every other
 *  StateError → 409. Returns true when handled; anything else propagates as a 500. */
function mapStateError(e: unknown, res: Response): boolean {
  if (e instanceof StateError && e.code === "UNKNOWN_TASK") {
    res.status(404).json({ error: e.message });
    return true;
  }
  if (e instanceof StateError) {
    res.status(409).json({ error: e.message, code: e.code });
    return true;
  }
  return false;
}

export function createApp(
  db: DatabaseSync,
  opts: { internalSecret?: string; suspectAfterMs?: number } = {},
) {
  const app = express();
  app.use(express.json());
  const suspectAfterMs = opts.suspectAfterMs ?? SUSPECT_AFTER_MS;

  // Internal engine surface: only meaningful with the shared secret (DESIGN §7).
  // Unset secret = local-dev convenience; production must set INTERNAL_SECRET.
  app.use("/internal", (req, res, next) => {
    if (
      opts.internalSecret !== undefined &&
      req.header("x-relay-internal-secret") !== opts.internalSecret
    ) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "relay-api", version: "0.1.0" });
  });

  app.get("/tasks", (_req, res) => {
    res.json(listTasks(db, Date.now(), suspectAfterMs));
  });

  app.post("/tasks", (req, res) => {
    const parsed = CreateTaskBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid task", details: parsed.error.flatten() });
      return;
    }
    // Expertise validated against known areas at the contract layer for tasks.
    if (!Expertise.safeParse(parsed.data.expertise).success) {
      res.status(400).json({ error: `unknown expertise: ${parsed.data.expertise}` });
      return;
    }
    res.status(201).json(createTask(db, parsed.data));
  });

  app.get("/contributors", (_req, res) => {
    res.json(listContributors(db));
  });

  app.post("/tasks/:id/route", (req, res) => {
    const parsed = RouteRequest.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid route request", details: parsed.error.flatten() });
      return;
    }
    const requestId = randomUUID();
    try {
      startRouting(db, req.params.id, requestId);
    } catch (e) {
      if (mapStateError(e, res)) return;
      throw e;
    }
    if (parsed.data.engine !== undefined) {
      db.prepare("UPDATE routing_attempts SET scenario = ? WHERE request_id = ?").run(
        JSON.stringify(parsed.data.engine),
        requestId,
      );
    }
    res.status(202).json({ requestId, taskId: req.params.id, status: "pending" });
  });

  app.get("/internal/routing-jobs", (_req, res) => {
    res.json(pendingJobs(db));
  });

  app.post("/internal/routing-callback", (req, res) => {
    const parsed = RoutingCallback.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid callback", details: parsed.error.flatten() });
      return;
    }
    try {
      const result = applyCallback(db, parsed.data);
      if (!result.applied && result.reason === "unknown-request") {
        res.status(404).json({ error: "unknown routing request", applied: false });
        return;
      }
      res.json({ applied: result.applied, reason: result.reason ?? null });
    } catch (e) {
      if (mapStateError(e, res)) return;
      throw e;
    }
  });

  app.post("/tasks/:id/override", (req, res) => {
    const parsed = OverrideRequest.safeParse(req.body ?? {});
    if (!parsed.success || (parsed.data.contributorId === undefined && parsed.data.cancel !== true)) {
      res.status(400).json({ error: "override needs contributorId or {cancel:true}" });
      return;
    }
    try {
      if (parsed.data.cancel === true) cancelRouting(db, req.params.id);
      else assignManual(db, req.params.id, parsed.data.contributorId as string);
    } catch (e) {
      if (mapStateError(e, res)) return;
      throw e;
    }
    res.json(getTask(db, req.params.id, Date.now(), suspectAfterMs));
  });

  app.post("/tasks/:id/recover", (req, res) => {
    const parsed = z.object({ contributorId: z.string().min(1).optional() }).safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid recover request" });
      return;
    }
    try {
      if (parsed.data.contributorId !== undefined) {
        assignManual(db, req.params.id, parsed.data.contributorId);
        res.json(getTask(db, req.params.id, Date.now(), suspectAfterMs));
        return;
      }
      startRouting(db, req.params.id, randomUUID());
    } catch (e) {
      if (mapStateError(e, res)) return;
      throw e;
    }
    res.status(202).json(getTask(db, req.params.id, Date.now(), suspectAfterMs));
  });

  const DecisionBody = z.object({ decision: z.enum(["accept", "decline", "fail"]) });

  app.post("/tasks/:id/decision", (req, res) => {
    const parsed = DecisionBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "decision must be accept, decline, or fail" });
      return;
    }
    try {
      applyDecision(db, req.params.id, parsed.data.decision as Decision);
    } catch (e) {
      if (mapStateError(e, res)) return;
      throw e;
    }
    res.json(getTask(db, req.params.id, Date.now(), suspectAfterMs));
  });

  app.get("/tasks/:id/history", (req, res) => {
    if (getTask(db, req.params.id, Date.now(), suspectAfterMs) === undefined) {
      res.status(404).json({ error: "unknown task" });
      return;
    }
    res.json(taskHistory(db, req.params.id));
  });

  return app;
}
