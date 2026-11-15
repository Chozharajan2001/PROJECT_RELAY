// @relay/engine — routing simulator worker (EPIC-3). Stateless: polls jobs,
// sleeps, reports back via POST /internal/routing-callback. Never touches the DB.
import { startWorker } from "./worker.js";

const API_BASE = process.env.API_BASE ?? "http://localhost:3001";
const POLL_MS = Number(process.env.ENGINE_POLL_MS ?? 1000);
const SEED = process.env.ENGINE_SEED !== undefined ? Number(process.env.ENGINE_SEED) : undefined;

startWorker(API_BASE, POLL_MS, SEED);
