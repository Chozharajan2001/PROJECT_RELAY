"use server";

import { revalidatePath } from "next/cache";
import { type CreateInput, parseCreateInput } from "./create-input";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

/** Server actions report results; a client wrapper renders toast + pending + reset (C-2). */
export interface ActionResult {
  ok: boolean;
  message: string;
}

async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => ({}));
  return { status: res.status, body: data };
}

async function post(path: string, body: unknown, okMessage: string): Promise<ActionResult> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[board] ${path} failed: API ${res.status}`);
      return { ok: false, message: `Failed (API ${res.status})` };
    }
    return { ok: true, message: okMessage };
  } catch (e) {
    console.error(`[board] ${path} failed: ${(e as Error).message}`);
    return { ok: false, message: "API unreachable" };
  } finally {
    // Converge to the truth regardless: the board ticker re-fetches within 4s (Q8).
    revalidatePath("/");
  }
}

export async function createTask(formData: FormData): Promise<ActionResult> {
  let input: CreateInput;
  try {
    input = parseCreateInput({
      title: formData.get("title"),
      expertise: formData.get("expertise"),
      priority: formData.get("priority") ?? undefined,
    });
  } catch {
    return { ok: false, message: "Title (1–200 chars) and expertise are required." };
  }
  const created = await postJson("/tasks", input);
  if (created.status >= 400) {
    console.error(`[board] /tasks failed: API ${created.status}`);
    return { ok: false, message: `Failed (API ${created.status})` };
  }
  revalidatePath("/");
  const createdId = (created.body as { id?: unknown }).id;
  if (formData.get("route") === "1" && typeof createdId === "string") {
    return post(`/tasks/${createdId}/route`, {}, "Task created and routing");
  }
  return { ok: true, message: "Task created" };
}

export async function routeTask(
  id: string,
  preset?: "slow" | "drop" | "no-match",
  _formData?: FormData,
): Promise<ActionResult> {
  const scenarios = {
    slow: { delayMs: 15_000 },
    drop: { drop: true },
    "no-match": { forceNoMatch: true },
  } as const;
  return post(
    `/tasks/${id}/route`,
    preset === undefined ? {} : { engine: scenarios[preset] },
    preset === undefined ? "Routing started" : `Routing started (${preset})`,
  );
}

export async function overrideAssign(id: string, formData: FormData): Promise<ActionResult> {
  const contributorId = formData.get("contributorId");
  if (typeof contributorId !== "string" || contributorId === "") {
    return { ok: false, message: "Pick a contributor first." };
  }
  return post(`/tasks/${id}/override`, { contributorId }, "Override recorded");
}

export async function cancelRoute(id: string): Promise<ActionResult> {
  return post(`/tasks/${id}/override`, { cancel: true }, "Routing cancelled");
}

export async function decideTask(
  id: string,
  decision: "accept" | "decline" | "fail",
): Promise<ActionResult> {
  const past = decision === "accept" ? "Accepted" : decision === "decline" ? "Declined" : "Failed";
  return post(`/tasks/${id}/decision`, { decision }, past);
}

export async function recoverTask(id: string): Promise<ActionResult> {
  return post(`/tasks/${id}/recover`, {}, "Recovery started");
}
