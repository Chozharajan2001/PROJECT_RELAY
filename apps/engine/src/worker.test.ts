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
  return { rng: overrides.rng ?? mulberry32(9), sleepMs, postCallback };
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

  it("a failing callback is reported, not thrown", async () => {
    const d = deps({ postCallback: vi.fn(async () => { throw new Error("down"); }) });
    const result = await handleJob(job({ scenario: { delayMs: 0 } }), d);
    expect(result).toBe("callback-failed");
  });
});
