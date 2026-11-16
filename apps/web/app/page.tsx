import type { Contributor, TaskWithAge } from "@relay/contracts";
import AgeCell from "../src/components/AgeCell";
import RefreshTicker from "../src/components/RefreshTicker";
import {
  CreateForm,
  DecisionButtons,
  InterveneControls,
  RecoverButton,
  ScenarioButtons,
} from "../src/components/TaskForms";
import { displayState, eligibleFor } from "../src/lib/board";
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

export default async function Home() {
  let tasks: TaskWithAge[] = [];
  let contributors: Contributor[] = [];
  let error: string | null = null;
  try {
    [tasks, contributors] = await Promise.all([getTasks(), getContributors()]);
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 960 }}>
      <h1>PROJECT_RELAY — operator board</h1>
      <RefreshTicker />
      <CreateForm />
      {error !== null ? (
        <p role="alert">API unreachable ({error}). Start it with `npm run dev`.</p>
      ) : tasks.length === 0 ? (
        <p>No tasks yet. Create one to start routing.</p>
      ) : (
        <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th align="left">Task</th>
              <th align="left">Expertise</th>
              <th align="left">Age</th>
              <th align="left">State</th>
              <th align="left">Candidates</th>
              <th align="left">Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => {
              const state = displayState(t);
              const candidates = eligibleFor(t, contributors);
              return (
                <tr key={t.id} style={{ borderTop: "1px solid #ccc" }}>
                  <td>
                    <Link href={`/tasks/${t.id}`}>{t.title}</Link>
                  </td>
                  <td>{t.expertise}</td>
                  <td>
                    <AgeCell initialAgeSeconds={t.ageSeconds} />
                  </td>
                  <td>
                    <strong data-state={state}>{state}</strong>
                    {state === "suspect" ? " — may never return" : ""}
                  </td>
                  <td>{candidates.map((c) => c.name).join(", ") || "—"}</td>
                  <td>
                    {t.state === "created" ? <ScenarioButtons id={t.id} /> : null}
                    {t.state === "routing" || t.state === "assigned" ? (
                      <InterveneControls id={t.id} candidates={candidates} />
                    ) : null}
                    {t.state === "assigned" ? <DecisionButtons id={t.id} /> : null}
                    {t.state === "declined" || t.state === "failed" ? (
                      <RecoverButton id={t.id} />
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
