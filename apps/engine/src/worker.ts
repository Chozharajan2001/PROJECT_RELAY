import { RoutingCallback } from "@relay/contracts";
import {
  decideOutcome,
  type EngineJob,
  mulberry32,
  resolveDelayMs,
  type Rng,
  shouldDrop,
} from "./engine.js";

export interface JobDeps {
  rng: Rng;
  sleepMs: (ms: number) => Promise<void>;
  postCallback: (body: unknown) => Promise<{ status: number }>;
}

export type JobResult = "answered" | "dropped" | "callback-failed";

/**
 * One routing request lifecycle. Pure except for injected effects —
 * fully deterministic under test deps. Retry policy lands in T-3.1.3;
 * for now a failed callback is logged by the caller via the return value.
 */
export async function handleJob(job: EngineJob, deps: JobDeps): Promise<JobResult> {
  if (shouldDrop(job.scenario, deps.rng)) return "dropped";
  await deps.sleepMs(resolveDelayMs(job.scenario, deps.rng));
  const outcome = decideOutcome(job, deps.rng);
  const callback = RoutingCallback.parse({ routingRequestId: job.requestId, ...outcome });
  try {
    await deps.postCallback(callback);
    return "answered";
  } catch {
    return "callback-failed";
  }
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Production loop: poll the jobs feed, claim new jobs, handle concurrently. */
export function startWorker(apiBase: string, pollMs: number, seed: number | undefined): void {
  const claimed = new Set<string>();
  const rngFor = (requestId: string): Rng => {
    if (seed === undefined) return Math.random;
    return mulberry32((seed + hash(requestId)) >>> 0);
  };

  async function pollOnce(): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${apiBase}/internal/routing-jobs`);
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
      const deps: JobDeps = {
        rng: rngFor(job.requestId),
        sleepMs: realSleep,
        postCallback: async (body) => {
          const r = await fetch(`${apiBase}/internal/routing-callback`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          return { status: r.status };
        },
      };
      void handleJob(job, deps).then((result) => {
        // eslint-disable-next-line no-console
        console.log(`[engine] ${job.requestId} -> ${result}`);
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[engine] polling ${apiBase} every ${pollMs}ms${seed !== undefined ? ` (seed=${seed})` : ""}`);
  setInterval(() => void pollOnce(), pollMs);
  void pollOnce();
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
