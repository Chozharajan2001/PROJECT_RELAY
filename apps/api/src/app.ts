import type { DatabaseSync } from "node:sqlite";
import { Expertise } from "@relay/contracts";
import express from "express";
import { z } from "zod";
import { createTask, listContributors, listTasks } from "./store.js";

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

  return app;
}
