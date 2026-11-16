import type { Contributor, TaskWithAge } from "@relay/contracts";
import AgeCell from "../src/components/AgeCell";
import RefreshTicker from "../src/components/RefreshTicker";
import {
  CreateModal,
  DecisionButtons,
  InterveneModal,
  RecoverModal,
  ScenarioButtons,
} from "../src/components/TaskForms";
import { displayState, eligibleFor } from "../src/lib/board";
import {
  cancelRoute,
  createTask,
  decideTask,
  overrideAssign,
  recoverTask,
  routeTask,
} from "../src/lib/actions";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

async function getTasks(): Promise<TaskWithAge[]> {
  const res = await fetch(`${API_BASE}/tasks`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<TaskWithAge[]>;
}

async function getContributors(): Promise<Contributor[]> {
  const res = await fetch(`${API_BASE}/contributors`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<Contributor[]>;
}

const PRESETS = [
  { label: "Normal", preset: undefined },
  { label: "Slow 15s", preset: "slow" },
  { label: "Drop (silent)", preset: "drop" },
  { label: "No-match", preset: "no-match" },
] as const;

const DECISIONS = ["accept", "decline", "fail"] as const;

async function getHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams?: { q?: string; state?: string; expertise?: string; suspect?: string };
}) {
  let tasks: TaskWithAge[] = [];
  let contributors: Contributor[] = [];
  let error: string | null = null;
  try {
    [tasks, contributors] = await Promise.all([getTasks(), getContributors()]);
  } catch (e) {
    error = (e as Error).message;
  }
  const live = error === null && (await getHealth());
  const q = (searchParams?.q ?? "").toLowerCase();
  const stateFilter = searchParams?.state ?? "all";
  const expertiseFilter = searchParams?.expertise ?? "all";
  const suspectOnly = searchParams?.suspect === "1";
  const filtered = tasks.filter((t) => {
    if (q !== "" && !t.title.toLowerCase().includes(q)) return false;
    if (stateFilter !== "all" && displayState(t) !== stateFilter) return false;
    if (expertiseFilter !== "all" && t.expertise !== expertiseFilter) return false;
    if (suspectOnly && !t.suspect) return false;
    return true;
  });
  const routing = tasks.filter((t) => t.state === "routing" && !t.suspect).length;
  const suspect = tasks.filter((t) => t.suspect).length;
  const assigned = tasks.filter((t) => t.state === "assigned").length;

  return (
    <main style={{ padding: 24, maxWidth: "var(--content-width)" }} id="board">
      <h1>PROJECT_RELAY — operator board</h1>
      <RefreshTicker />
      <p>
        <span
          role="status"
          style={{ color: live ? "var(--state-assigned)" : "var(--state-declined)" }}
        >
          {live ? "● API live" : "○ API unreachable — retrying…"}
        </span>{" "}
        {!live && error === null ? <a href="/">Retry</a> : null}
      </p>
      <p aria-live="polite" className="sr-only">
        {suspect} suspect, {routing} routing, {assigned} assigned
      </p>
      <p>
        Routing {routing} · Assigned {assigned} · Suspect {suspect}
      </p>
      <CreateModal submit={createTask} />
      <form
        method="GET"
        style={{ display: "flex", gap: 8, margin: "0 0 16px", flexWrap: "wrap" }}
        aria-label="board filters"
      >
        <input name="q" placeholder="Search title…" defaultValue={searchParams?.q ?? ""} />
        <select name="state" defaultValue={stateFilter} aria-label="filter by state">
          {["all", "created", "routing", "suspect", "assigned", "accepted", "declined", "failed"].map(
            (s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ),
          )}
        </select>
        <select name="expertise" defaultValue={expertiseFilter} aria-label="filter by expertise">
          {["all", "finance", "healthcare", "data-analysis", "operations", "legal"].map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <label>
          <input type="checkbox" name="suspect" value="1" defaultChecked={suspectOnly} /> suspect
          only
        </label>
        <button type="submit">Filter</button>
        <a href="/">Clear</a>
      </form>
      {error !== null ? (
        <p role="alert">API unreachable ({error}). Start it with `npm run dev`.</p>
      ) : tasks.length === 0 ? (
        <div>
          <p>No tasks yet.</p>
          <CreateModal submit={createTask} />
        </div>
      ) : filtered.length === 0 ? (
        <p>
          No tasks match these filters. <a href="/">Clear filters</a>
        </p>
      ) : (
        <table cellPadding={8} className="board-table">
          <caption className="sr-only">Operator board tasks</caption>
          <thead>
            <tr>
              <th scope="col" align="left">Task</th>
              <th scope="col" align="left">Expertise</th>
              <th scope="col" align="left">Age</th>
              <th scope="col" align="left">State</th>
              <th scope="col" align="left">Candidates</th>
              <th scope="col" align="left">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const state = displayState(t);
              const candidates = eligibleFor(t, contributors);
              return (
                <tr key={t.id} className={t.suspect ? "row-suspect" : undefined}>
                  <td data-label="Task">
                    <Link href={`/tasks/${t.id}`}>{t.title}</Link>
                    <div style={{ fontSize: 12, color: "#737373" }}>#{t.id.slice(0, 6)}</div>
                  </td>
                  <td data-label="Expertise">
                    {t.expertise}{" "}
                    {t.priority === "high" ? <span className="chip-high">▲ HIGH</span> : t.priority}
                  </td>
                  <td data-label="Age">
                    <AgeCell initialAgeSeconds={t.ageSeconds} />
                  </td>
                  <td data-label="State">
                    <span className={`badge badge-${state}`}>
                      {state === "suspect" ? "⚠ " : ""}
                      {state}
                    </span>
                    {state === "suspect" ? " — may never return" : ""}
                    {t.state === "assigned"
                      ? ` →${t.activeAssigneeId === null ? "?" : contributors.find((c) => c.id === t.activeAssigneeId)?.name ?? "?"} (${t.assignedBy === "engine" ? "E" : "O"})`
                      : ""}
                  </td>
                  <td data-label="Candidates">{candidates.map((c) => c.name).join(", ") || "—"}</td>
                  <td data-label="Action">
                    {t.state === "created" ? (
                      <ScenarioButtons
                        routes={PRESETS.map((p) => ({
                          label: p.label,
                          invoke: routeTask.bind(null, t.id, p.preset, undefined),
                        }))}
                      />
                    ) : null}
                    {t.state === "routing" || t.state === "assigned" ? (
                      <InterveneModal
                        title={t.title}
                        attemptNote={`${state === "routing" ? "Routing" : "Assigned"} · age ${t.ageSeconds}s${t.suspect ? " · SUSPECT — may never return" : ""}`}
                        candidates={candidates.map((c) => {
                          const full = contributors.find((x) => x.id === c.id);
                          const areas = full?.expertise ?? [];
                          return {
                            ...c,
                            note: `${areas.join(", ")}${areas.includes(t.expertise as never) ? " ✓" : ""}`,
                          };
                        })}
                        assign={overrideAssign.bind(null, t.id)}
                        cancel={cancelRoute.bind(null, t.id)}
                      />
                    ) : null}
                    {t.state === "assigned" ? (
                      <DecisionButtons
                        decisions={DECISIONS.map((d) => ({
                          decision: d,
                          invoke: decideTask.bind(null, t.id, d),
                        }))}
                      />
                    ) : null}
                    {t.state === "declined" || t.state === "failed" ? (
                      <RecoverModal
                        title={t.title}
                        detail={`${t.state === "declined" ? "Declined" : "Failed"}${
                          t.activeAssigneeId === null
                            ? ""
                            : ` (was ${contributors.find((c) => c.id === t.activeAssigneeId)?.name ?? "assigned"})`
                        }.`}
                        recover={recoverTask.bind(null, t.id)}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
