import { RoutingCallback } from "@relay/contracts";
import {
  decideOutcome,
  type EngineJob,
  mulberry32,
  resolveDelayMs,
  shouldDrop,
} from "./engine.js";

const API_BASE = process.env.API_BASE ?? "http://localhost:3001";
const POLL_MS = Number(process.env.ENGINE_POLL_MS ?? 1000);
const SEED = process.env.ENGINE_SEED !== undefined ? Number(process.env.ENGINE_SEED) : undefined;

/** Jobs already claimed by this worker (prevents double-processing across polls). */
const claimed = new Set<string>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function pollOnce(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/internal/routing-jobs`);
  } catch (e) {
    console.error(`[engine] poll failed: ${(e as Error).message}`);
    return;
  }
  if (!res.ok) {
    console.error(`[engine] poll HTTP ${res.status}`);
    return;
  }
  const jobs = (await res.json()) as EngineJob[];
  for (const job of jobs) {
    if (claimed.has(job.requestId)) continue;
    claimed.add(job.requestId);
    void handleJob(job); // runs concurrently; never blocks the poll loop
  }
}

/** One routing request lifecycle. Retries on callback failure land in T-3.1.3. */
async function handleJob(job: EngineJob): Promise<void> {
  const rng = SEED !== undefined ? mulberry32(SEED + hash(job.requestId)) : Math.random;
  if (shouldDrop(job.scenario, rng)) {
    console.log(`[engine] ${job.requestId} commanded/randomly dropped (silent)`);
    return;
  }
  await sleep(resolveDelayMs(job.scenario, rng));
  const outcome = decideOutcome(job, rng);
  const callback = RoutingCallback.parse({ routingRequestId: job.requestId, ...outcome });
  try {
    const res = await fetch(`${API_BASE}/internal/routing-callback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(callback),
    });
    console.log(`[engine] ${job.requestId} -> ${outcome.outcome} (callback HTTP ${res.status})`);
  } catch (e) {
    console.error(`[engine] ${job.requestId} callback failed: ${(e as Error).message}`);
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

// eslint-disable-next-line no-console
console.log(`[engine] polling ${API_BASE} every ${POLL_MS}ms${SEED !== undefined ? ` (seed=${SEED})` : ""}`);
setInterval(() => void pollOnce(), POLL_MS);
void pollOnce();
