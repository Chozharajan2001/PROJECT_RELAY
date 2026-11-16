"use server";

import { revalidatePath } from "next/cache";
import { type CreateInput, parseCreateInput } from "./create-input";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

/** Server actions can't surface errors on React 18 (no useActionState): log loudly,
 * then revalidate — the board's 4s ticker converges to the true state (Q8). */
async function post(path: string, body: unknown, action: string): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`[board] ${action} failed: API ${res.status}`);
  } catch (e) {
    console.error(`[board] ${action} failed: ${(e as Error).message}`);
  }
  revalidatePath("/");
}

export async function createTask(formData: FormData): Promise<void> {
  let input: CreateInput;
  try {
    input = parseCreateInput({
      title: formData.get("title"),
      expertise: formData.get("expertise"),
      priority: formData.get("priority") ?? undefined,
    });
  } catch {
    return; // Required attributes + fixed selects make this unreachable in practice.
  }
  await post("/tasks", input, "createTask");
}

export async function routeTask(
  id: string,
  preset?: "slow" | "drop" | "no-match",
  _formData?: FormData,
): Promise<void> {
  const scenarios = {
    slow: { delayMs: 15_000 },
    drop: { drop: true },
    "no-match": { forceNoMatch: true },
  } as const;
  await post(`/tasks/${id}/route`, preset === undefined ? {} : { engine: scenarios[preset] }, `routeTask:${preset ?? "normal"}`);
}

export async function overrideAssign(id: string, formData: FormData): Promise<void> {
  const contributorId = formData.get("contributorId");
  if (typeof contributorId !== "string" || contributorId === "") return;
  await post(`/tasks/${id}/override`, { contributorId }, "overrideAssign");
}

export async function cancelRoute(id: string): Promise<void> {
  await post(`/tasks/${id}/override`, { cancel: true }, "cancelRoute");
}

export async function decideTask(id: string, decision: "accept" | "decline" | "fail"): Promise<void> {
  await post(`/tasks/${id}/decision`, { decision }, `decideTask:${decision}`);
}

export async function recoverTask(id: string): Promise<void> {
  await post(`/tasks/${id}/recover`, {}, "recoverTask");
}
