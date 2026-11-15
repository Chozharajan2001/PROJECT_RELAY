import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { Expertise, RouteRequest, RoutingCallback } from "@relay/contracts";
import express from "express";
import { z } from "zod";
import { createTask, listContributors, listTasks, pendingJobs } from "./store.js";
import { applyCallback, startRouting, StateError } from "./transitions.js";

const CreateTaskBody = z.object({
  title: z.string().min(1).max(200),
  expertise: z.string().min(1),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

export function createApp(db: DatabaseSync) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "relay-api", version: "0.1.0" });
  });

  app.get("/tasks", (_req, res) => {
    res.json(listTasks(db));
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
      if (e instanceof StateError && e.code === "UNKNOWN_TASK") {
        res.status(404).json({ error: e.message });
        return;
      }
      if (e instanceof StateError && (e.code === "INVALID_STATE" || e.code === "TERMINAL_STATE")) {
        res.status(409).json({ error: e.message, code: e.code });
        return;
      }
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
      if (e instanceof StateError) {
        res.status(422).json({ error: e.message, code: e.code });
        return;
      }
      throw e;
    }
  });

  return app;
}
