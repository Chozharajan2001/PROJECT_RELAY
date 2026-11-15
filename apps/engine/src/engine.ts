import type { EngineOverride } from "@relay/contracts";

export interface EngineJob {
  requestId: string;
  taskId: string;
  taskTitle: string;
  expertise: string;
  priority: string;
  scenario: EngineOverride | null;
  eligibleContributors: Array<{ id: string; name: string }>;
  dispatchedAt: string;
}

export type Rng = () => number;

/** Deterministic RNG for tests/demos. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ENGINE_DELAY_MIN_MS = 5_000;
export const ENGINE_DELAY_MAX_MS = 20_000;
export const ENGINE_DROP_RATE = 0.2;
/**
 * Demo/test overrides answer promptly (unless delayMs says otherwise):
 * they exist for deterministic demos, not for simulating latency.
 */
export const OVERRIDE_DEFAULT_DELAY_MS = 2_000;

export function resolveDelayMs(scenario: EngineOverride | null, rng: Rng = Math.random): number {
  if (scenario !== null && "delayMs" in scenario) return scenario.delayMs;
  if (scenario !== null) return OVERRIDE_DEFAULT_DELAY_MS;
  return Math.floor(
    ENGINE_DELAY_MIN_MS + rng() * (ENGINE_DELAY_MAX_MS - ENGINE_DELAY_MIN_MS),
  );
}

/** True = this request never returns (silent). Overrides force the outcome. */
export function shouldDrop(scenario: EngineOverride | null, rng: Rng = Math.random): boolean {
  if (scenario !== null && "drop" in scenario) return true;
  if (scenario !== null) return false; // forced delay / no-match always answer
  return rng() < ENGINE_DROP_RATE;
}

export type EngineOutcome =
  | { outcome: "matched"; contributorId: string }
  | { outcome: "no-match" };

export function decideOutcome(
  job: EngineJob,
  rng: Rng = Math.random,
): EngineOutcome {
  if (job.scenario !== null && "forceNoMatch" in job.scenario) return { outcome: "no-match" };
  if (job.eligibleContributors.length === 0) return { outcome: "no-match" };
  const pick = job.eligibleContributors[Math.floor(rng() * job.eligibleContributors.length)];
  return { outcome: "matched", contributorId: pick.id };
}
