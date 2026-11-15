import { describe, expect, it } from "vitest";
import { parseCreateInput } from "./create-input";

describe("parseCreateInput", () => {
  it("accepts a full valid payload, trimming the title", () => {
    expect(
      parseCreateInput({ title: "  Audit  ", expertise: "finance", priority: "high" }),
    ).toEqual({ title: "Audit", expertise: "finance", priority: "high" });
  });

  it("defaults priority to normal", () => {
    expect(parseCreateInput({ title: "T", expertise: "legal" }).priority).toBe("normal");
  });

  it("rejects empty titles, missing expertise, and bad priorities", () => {
    expect(() => parseCreateInput({ title: "", expertise: "finance" })).toThrow();
    expect(() => parseCreateInput({ title: "T" })).toThrow();
    expect(() => parseCreateInput({ title: "T", expertise: "finance", priority: "urgent" })).toThrow();
    expect(() => parseCreateInput({ title: "x".repeat(201), expertise: "finance" })).toThrow();
  });
});
