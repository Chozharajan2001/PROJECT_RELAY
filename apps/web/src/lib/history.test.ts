import { describe, expect, it } from "vitest";
import { formatEventKind, formatTime } from "./history";

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
});
