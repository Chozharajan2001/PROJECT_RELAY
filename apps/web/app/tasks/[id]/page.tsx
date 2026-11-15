import type { TaskWithAge } from "@relay/contracts";
import Link from "next/link";
import { displayState } from "../../../src/lib/board";
import { formatEventKind, formatTime } from "../../../src/lib/history";

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

export default async function TaskDetail({ params }: { params: { id: string } }) {
  const [task, history] = await Promise.all([getTask(params.id), getHistory(params.id)]);
  if (task === null || history === null) {
    return (
      <main style={{ fontFamily: "system-ui", padding: 24 }}>
        <p>Task not found.</p>
        <Link href="/">Back to board</Link>
      </main>
    );
  }
  return (
    <main style={{ fontFamily: "system-ui", padding: 24, maxWidth: 720 }}>
      <Link href="/">← Back to board</Link>
      <h1>{task.title}</h1>
      <p>
        {task.expertise} · {task.priority} · <strong>{displayState(task)}</strong>
      </p>
      <h2>History</h2>
      <ol>
        {history.map((h) => (
          <li key={h.id} data-seq={h.seq}>
            <strong>{formatEventKind(h.kind)}</strong> — {formatTime(h.at)}
            <pre style={{ fontSize: 12 }}>{JSON.stringify(h.payload)}</pre>
          </li>
        ))}
      </ol>
    </main>
  );
}
