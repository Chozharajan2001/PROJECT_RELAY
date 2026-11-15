import type { TaskWithAge } from "@relay/contracts";

/** Operator-facing state: `suspect` overlays `routing` (display-only, ADR-001). */
export type DisplayState = TaskWithAge["state"] | "suspect";

export function displayState(task: Pick<TaskWithAge, "state" | "suspect">): DisplayState {
  return task.state === "routing" && task.suspect ? "suspect" : task.state;
}

/** Candidates for a task: contributors whose expertise includes the task's area. */
export function eligibleFor(
  task: { expertise: string },
  contributors: { id: string; name: string; expertise: readonly string[] }[],
): { id: string; name: string }[] {
  return contributors
    .filter((c) => (c.expertise as readonly string[]).includes(task.expertise))
    .map((c) => ({ id: c.id, name: c.name }));
}

export function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) return `${ageSeconds}s`;
  const m = Math.floor(ageSeconds / 60);
  if (m < 60) return `${m}m ${ageSeconds % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
