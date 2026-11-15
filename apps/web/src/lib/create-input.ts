import { z } from "zod";

export const CreateInput = z.object({
  title: z.string().min(1).max(200),
  expertise: z.string().min(1),
  priority: z.enum(["low", "normal", "high"]),
});
export type CreateInput = z.infer<typeof CreateInput>;

/** Pure + unit-tested: form data → API payload. */
export function parseCreateInput(data: Record<string, unknown>): CreateInput {
  return CreateInput.parse({
    title: typeof data.title === "string" ? data.title.trim() : "",
    expertise: data.expertise,
    priority: data.priority ?? "normal",
  });
}
