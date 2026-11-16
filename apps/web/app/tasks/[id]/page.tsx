import type { Contributor, TaskWithAge } from "@relay/contracts";
import Link from "next/link";
import RefreshTicker from "../../../src/components/RefreshTicker";
import { displayState, eligibleFor } from "../../../src/lib/board";
import { describePayload, formatEventKind, formatTime } from "../../../src/lib/history";
import {
  cancelRoute,
  decideTask,
  overrideAssign,
  recoverTask,
  routeTask,
} from "../../../src/lib/actions";
import {
  DecisionButtons,
  InterveneModal,
  RecoverModal,
  ScenarioButtons,
} from "../../../src/components/TaskForms";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

interface HistoryItem {
  id: string;
  seq: number;
  kind: string;
  payload: unknown;
  at: string;
}

async function getTask(id: string): Promise<TaskWithAge | null> {
  const res = await fetch(`${API_BASE}/tasks`, { cache: "no-store" });
  if (!res.ok) return null;
  const tasks = (await res.json()) as TaskWithAge[];
  return tasks.find((t) => t.id === id) ?? null;
}

async function getHistory(id: string): Promise<HistoryItem[] | null> {
  const res = await fetch(`${API_BASE}/tasks/${id}/history`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as HistoryItem[];
}

async function getContributors(): Promise<Contributor[]> {
  const res = await fetch(`${API_BASE}/contributors`, { cache: "no-store" });
  if (!res.ok) return [];
  return (await res.json()) as Contributor[];
}

export default async function TaskDetail({ params }: { params: { id: string } }) {
  const [task, history, contributors] = await Promise.all([
    getTask(params.id),
    getHistory(params.id),
    getContributors(),
  ]);
  if (task === null || history === null) {
    return (
      <main style={{ padding: 24 }}>
        <p>Task not found.</p>
        <Link href="/">Back to board</Link>
      </main>
    );
  }
  const state = displayState(task);
  const candidates = eligibleFor(task, contributors);
  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <RefreshTicker />
      <Link href="/">← Back to board</Link>
      <h1 style={{ marginTop: 8 }}>{task.title}</h1>
      <p>
        <span className={`badge badge-${state}`}>
          {state === "suspect" ? "⚠ " : ""}
          {state}
        </span>{" "}
        {task.expertise} · {task.priority} · age {task.ageSeconds}s
        {task.state === "assigned" ? ` → ${task.activeAssigneeId ?? "?"}` : ""}
      </p>
      {task.suspect ? (
        <p role="alert" className="badge badge-suspect">
          ⚠ This routing may never return — intervene or wait.
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        {task.state === "created" ? (
          <ScenarioButtons
            routes={[
              { label: "Normal", invoke: routeTask.bind(null, task.id, undefined, undefined) },
              { label: "Slow 15s", invoke: routeTask.bind(null, task.id, "slow", undefined) },
              { label: "Drop", invoke: routeTask.bind(null, task.id, "drop", undefined) },
              { label: "No-match", invoke: routeTask.bind(null, task.id, "no-match", undefined) },
            ]}
          />
        ) : null}
        {task.state === "routing" || task.state === "assigned" ? (
          <InterveneModal
            title={task.title}
            attemptNote={`${task.state === "routing" ? "Routing" : "Assigned"} · age ${task.ageSeconds}s${task.suspect ? " · SUSPECT" : ""}`}
            candidates={candidates.map((c) => {
              const full = contributors.find((x) => x.id === c.id);
              const areas = full?.expertise ?? [];
              return { ...c, note: areas.join(", ") };
            })}
            assign={overrideAssign.bind(null, task.id)}
            cancel={cancelRoute.bind(null, task.id)}
          />
        ) : null}
        {task.state === "assigned" ? (
          <DecisionButtons
            decisions={(["accept", "decline", "fail"] as const).map((d) => ({
              decision: d,
              invoke: decideTask.bind(null, task.id, d),
            }))}
          />
        ) : null}
        {task.state === "declined" || task.state === "failed" ? (
          <RecoverModal
            title={task.title}
            detail={`${task.state === "declined" ? "Declined" : "Failed"}. History is kept; recovery opens a fresh attempt.`}
            recover={recoverTask.bind(null, task.id)}
          />
        ) : null}
      </div>
      <h2>History</h2>
      <ol>
        {history.map((h) => (
          <li key={h.id} data-seq={h.seq}>
            <strong>{formatEventKind(h.kind)}</strong> — {formatTime(h.at)}
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {describePayload(h.kind, h.payload)}
            </div>
            <details>
              <summary>raw</summary>
              <pre style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{JSON.stringify(h.payload)}</pre>
            </details>
          </li>
        ))}
      </ol>
    </main>
  );
}
