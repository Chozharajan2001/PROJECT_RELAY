import { describe, expect, it, vi } from "vitest";
import type { EngineJob, Rng } from "./engine.js";
import { mulberry32 } from "./engine.js";
import { handleJob } from "./worker.js";

function job(overrides: Partial<EngineJob> = {}): EngineJob {
  return {
    requestId: "r1",
    taskId: "t1",
    taskTitle: "T",
    expertise: "finance",
    priority: "normal",
    scenario: null,
    eligibleContributors: [{ id: "c1", name: "Asha" }],
    dispatchedAt: new Date().toISOString(),
    ...overrides,
  };
}

function deps(
  overrides: {
    rng?: Rng;
    postCallback?: (body: unknown) => Promise<{ status: number }>;
  } = {},
) {
  const sleepMs = vi.fn(async (_ms: number) => {});
  const postCallback = vi.fn(
    overrides.postCallback ?? (async (_body: unknown) => ({ status: 200 })),
  );
  return {
    rng: overrides.rng ?? mulberry32(9),
    sleepMs,
    postCallback,
    callbackRetry: { attempts: 3, delayMs: 1000 },
  };
}

describe("handleJob", () => {
  it("drop:true never sleeps and never calls back", async () => {
    const d = deps();
    const result = await handleJob(job({ scenario: { drop: true } }), d);
    expect(result).toBe("dropped");
    expect(d.sleepMs).not.toHaveBeenCalled();
    expect(d.postCallback).not.toHaveBeenCalled();
  });

  it("forceNoMatch posts no-match in bounded (zero-sleep) time", async () => {
    const d = deps();
    const result = await handleJob(job({ scenario: { forceNoMatch: true } }), d);
    expect(result).toBe("answered");
    expect(d.postCallback).toHaveBeenCalledTimes(1);
    expect(d.postCallback.mock.calls[0][0]).toEqual({
      routingRequestId: "r1",
      outcome: "no-match",
    });
  });

  it("delayMs controls the sleep exactly", async () => {
    const d = deps();
    await handleJob(job({ scenario: { delayMs: 8000 } }), d);
    expect(d.sleepMs).toHaveBeenCalledTimes(1);
    expect(d.sleepMs).toHaveBeenCalledWith(8000);
  });

  it("default path posts a matched callback for the eligible contributor", async () => {
    const d = deps({ rng: () => 0.99 }); // never drops; single candidate chosen regardless
    const result = await handleJob(job(), d);
    expect(result).toBe("answered");
    expect(d.postCallback.mock.calls[0][0]).toEqual({
      routingRequestId: "r1",
      outcome: "matched",
      contributorId: "c1",
    });
  });

  it("a failing callback is retried, then reported when exhausted", async () => {
    let calls = 0;
    const flaky = vi.fn(async (_body: unknown) => {
      calls++;
      if (calls < 3) throw new Error("down");
      return { status: 200 };
    });
    const d = deps({ rng: () => 0.99, postCallback: flaky });
    const result = await handleJob(job({ scenario: { delayMs: 0 } }), d);
    expect(result).toBe("answered");
    expect(flaky).toHaveBeenCalledTimes(3);
    // 1 initial sleep (delayMs 0) + 2 retry backoffs
    expect(d.sleepMs).toHaveBeenCalledTimes(3);

    const dead = vi.fn(async (_body: unknown) => { throw new Error("down"); });
    const d2 = deps({ rng: () => 0.99, postCallback: dead });
    expect(await handleJob(job({ scenario: { delayMs: 0 } }), d2)).toBe("callback-failed");
    expect(dead).toHaveBeenCalledTimes(3);
  });

  it("retries transient 5xx but accepts fencing statuses immediately", async () => {
    let n = 0;
    const flaky5xx = vi.fn(async (_body: unknown) => (++n < 3 ? { status: 503 } : { status: 200 }));
    const d = deps({ rng: () => 0.99, postCallback: flaky5xx });
    expect(await handleJob(job({ scenario: { delayMs: 0 } }), d)).toBe("answered");
    expect(flaky5xx).toHaveBeenCalledTimes(3);

    const fenced = vi.fn(async (_body: unknown) => ({ status: 409 }));
    const d2 = deps({ rng: () => 0.99, postCallback: fenced });
    expect(await handleJob(job({ scenario: { delayMs: 0 } }), d2)).toBe("answered");
    expect(fenced).toHaveBeenCalledTimes(1);
  });
});
