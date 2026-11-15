"use server";

import { revalidatePath } from "next/cache";
import { type CreateInput, parseCreateInput } from "./create-input";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

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
  await fetch(`${API_BASE}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  revalidatePath("/");
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
  await fetch(`${API_BASE}/tasks/${id}/route`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(preset === undefined ? {} : { engine: scenarios[preset] }),
  });
  revalidatePath("/");
}

export async function overrideAssign(id: string, formData: FormData): Promise<void> {
  const contributorId = formData.get("contributorId");
  if (typeof contributorId !== "string" || contributorId === "") return;
  await fetch(`${API_BASE}/tasks/${id}/override`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contributorId }),
  });
  revalidatePath("/");
}

export async function cancelRoute(id: string): Promise<void> {
  await fetch(`${API_BASE}/tasks/${id}/override`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cancel: true }),
  });
  revalidatePath("/");
}

export async function decideTask(id: string, decision: "accept" | "decline" | "fail"): Promise<void> {
  await fetch(`${API_BASE}/tasks/${id}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  revalidatePath("/");
}

export async function recoverTask(id: string): Promise<void> {
  await fetch(`${API_BASE}/tasks/${id}/recover`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  revalidatePath("/");
}
