import { describe, expect, it } from "vitest";
import { displayState, eligibleFor, formatAge } from "./board";

describe("board shaping", () => {
  it("overlays suspect on routing, passes other states through", () => {
    expect(displayState({ state: "routing", suspect: true })).toBe("suspect");
    expect(displayState({ state: "routing", suspect: false })).toBe("routing");
    expect(displayState({ state: "assigned", suspect: false })).toBe("assigned");
    expect(displayState({ state: "accepted", suspect: false })).toBe("accepted");
  });

  it("matches contributors by expertise", () => {
    const contributors = [
      { id: "c1", name: "Asha", expertise: ["finance"] as const },
      { id: "c2", name: "Ben", expertise: ["finance", "operations"] as const },
    ];
    expect(eligibleFor({ expertise: "finance" }, [...contributors])).toEqual([
      { id: "c1", name: "Asha" },
      { id: "c2", name: "Ben" },
    ]);
    expect(eligibleFor({ expertise: "legal" }, [...contributors])).toEqual([]);
  });

  it("formats ages compactly", () => {
    expect(formatAge(5)).toBe("5s");
    expect(formatAge(65)).toBe("1m 5s");
    expect(formatAge(3700)).toBe("1h 1m");
  });
});
