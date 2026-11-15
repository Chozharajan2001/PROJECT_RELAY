import { describe, expect, it } from "vitest";
import {
  decideOutcome,
  ENGINE_DELAY_MAX_MS,
  ENGINE_DELAY_MIN_MS,
  type EngineJob,
  mulberry32,
  resolveDelayMs,
  shouldDrop,
} from "./engine.js";

function job(overrides: Partial<EngineJob> = {}): EngineJob {
  return {
    requestId: "r1",
    taskId: "t1",
    taskTitle: "T",
    expertise: "finance",
    priority: "normal",
    scenario: null,
    eligibleContributors: [
      { id: "c1", name: "Asha" },
      { id: "c2", name: "Ben" },
    ],
    dispatchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("engine decisions", () => {
  it("returns no-match when nobody is eligible, or when forced", () => {
    expect(decideOutcome(job({ eligibleContributors: [] }))).toEqual({ outcome: "no-match" });
    expect(decideOutcome(job({ scenario: { forceNoMatch: true } }))).toEqual({
      outcome: "no-match",
    });
  });

  it("matches a contributor from the eligible set", () => {
    const out = decideOutcome(job(), mulberry32(7));
    expect(out.outcome).toBe("matched");
    if (out.outcome === "matched") expect(["c1", "c2"]).toContain(out.contributorId);
  });

  it("honors delayMs exactly; other overrides answer promptly; default stays within 5–20s", () => {
    expect(resolveDelayMs({ delayMs: 8000 }, mulberry32(1))).toBe(8000);
    expect(resolveDelayMs({ drop: true }, mulberry32(1))).toBe(2000);
    expect(resolveDelayMs({ forceNoMatch: true }, mulberry32(1))).toBe(2000);
    const rng = mulberry32(42);
    for (let i = 0; i < 50; i++) {
      const d = resolveDelayMs(null, rng);
      expect(d).toBeGreaterThanOrEqual(ENGINE_DELAY_MIN_MS);
      expect(d).toBeLessThanOrEqual(ENGINE_DELAY_MAX_MS);
    }
  });

  it("drop:true is always silent; other overrides always answer", () => {
    expect(shouldDrop({ drop: true }, mulberry32(1))).toBe(true);
    expect(shouldDrop({ delayMs: 100 }, mulberry32(1))).toBe(false);
    expect(shouldDrop({ forceNoMatch: true }, mulberry32(1))).toBe(false);
  });

  it("default drop rate is sane (~20% over 200 seeded runs)", () => {
    const rng = mulberry32(1234);
    let drops = 0;
    for (let i = 0; i < 200; i++) if (shouldDrop(null, rng)) drops++;
    expect(drops).toBeGreaterThan(0);
    expect(drops).toBeLessThan(200);
    expect(drops / 200).toBeGreaterThan(0.05);
    expect(drops / 200).toBeLessThan(0.4);
  });
});
