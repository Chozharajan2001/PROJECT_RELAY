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
  /** Retry policy for callback delivery (API down mid-callback). */
  callbackRetry: { attempts: number; delayMs: number };
}

export type JobResult = "answered" | "dropped" | "callback-failed";

/**
 * One routing request lifecycle. Pure except for injected effects —
 * fully deterministic under test deps.
 *
 * Restart safety: the worker holds no state that matters. If it dies mid-sleep
 * or mid-callback, the restarted worker re-polls the same pending job and runs
 * it again; the API's request-ID fencing turns the duplicate into an audited
 * no-op (see transitions tests). Retries here cover the short case (API
 * briefly unreachable); a dead worker is covered by re-poll after restart.
 */
export async function handleJob(job: EngineJob, deps: JobDeps): Promise<JobResult> {
  if (shouldDrop(job.scenario, deps.rng)) return "dropped";
  await deps.sleepMs(resolveDelayMs(job.scenario, deps.rng));
  const outcome = decideOutcome(job, deps.rng);
  const callback = RoutingCallback.parse({ routingRequestId: job.requestId, ...outcome });
  for (let attempt = 1; attempt <= deps.callbackRetry.attempts; attempt++) {
    try {
      const res = await deps.postCallback(callback);
      // 5xx is transport-class: retry. Anything else (200, 409/404 fencing) is
      // the API's final word — never retry a decision already made (O-1).
      if (res.status >= 500) throw new Error(`callback HTTP ${res.status}`);
      return "answered";
    } catch {
      if (attempt < deps.callbackRetry.attempts) await deps.sleepMs(deps.callbackRetry.delayMs);
    }
  }
  return "callback-failed";
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
        callbackRetry: {
          attempts: Number(process.env.CALLBACK_ATTEMPTS ?? 3),
          delayMs: Number(process.env.CALLBACK_RETRY_MS ?? 1000),
        },
        postCallback: async (body) => {
          const r = await fetch(`${apiBase}/internal/routing-callback`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          return { status: r.status };
        },
      };
      // Fire-and-forget per job (concurrency), but never unhandled: a poisoned job
      // (e.g. contract drift in RoutingCallback.parse) must not crash-loop the
      // worker and starve siblings (O-2). The attempt stays pending; reconcile
      // flags it suspect and the operator acts.
      void handleJob(job, deps)
        .then((result) => {
          // eslint-disable-next-line no-console
          console.log(`[engine] ${job.requestId} -> ${result}`);
        })
        .catch((e) => {
          console.error(`[engine] ${job.requestId} crashed: ${(e as Error).message}`);
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
