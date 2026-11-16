import { describe, expect, it } from "vitest";
import { describePayload, formatEventKind, formatTime } from "./history";

describe("history shaping", () => {
  it("labels known kinds, passes unknown through", () => {
    expect(formatEventKind("routing-started")).toBe("Routing started");
    expect(formatEventKind("superseded-callback-ignored")).toBe("Late engine answer ignored");
    expect(formatEventKind("something-new")).toBe("something-new");
  });

  it("formats timestamps, passes garbage through", () => {
    expect(formatTime("2026-11-15T10:00:00.000Z")).not.toBe("2026-11-15T10:00:00.000Z");
    expect(formatTime("not-a-date")).toBe("not-a-date");
  });

  it("humanizes payloads per kind", () => {
    expect(describePayload("routing-started", { requestId: "abcdef123456" })).toContain("#abcdef12");
    expect(describePayload("assigned", { contributorId: "c1", by: "engine", requestId: "r1" })).toContain(
      "→ c1 (by engine)",
    );
    expect(describePayload("marked-suspect", { pendingLongerThanMs: 25000 })).toContain("pending > 25s");
    expect(describePayload("no-match", {})).toContain("no eligible contributor");
  });
});
