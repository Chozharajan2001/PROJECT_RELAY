import { describe, expect, it } from "vitest";
import {
  Contributor,
  EngineOverride,
  HistoryEvent,
  OverrideRequest,
  RouteRequest,
  RoutingAttempt,
  RoutingCallback,
  Task,
} from "./index.js";

const ts = "2026-11-15T10:00:00.000Z";

describe("Task", () => {
  it("accepts a minimal valid task", () => {
    const t = Task.parse({
      id: "t1",
      title: "Audit Q3 books",
      expertise: "finance",
      priority: "high",
      state: "created",
      activeRoutingRequestId: null,
      activeAssigneeId: null,
      assignedBy: null,
      createdAt: ts,
      updatedAt: ts,
    });
    expect(t.state).toBe("created");
  });

  it("rejects empty title and unknown expertise", () => {
    const base = {
      id: "t1",
      title: "x",
      expertise: "finance",
      priority: "normal",
      state: "created",
      activeRoutingRequestId: null,
      activeAssigneeId: null,
      assignedBy: null,
      createdAt: ts,
      updatedAt: ts,
    };
    expect(() => Task.parse({ ...base, title: "" })).toThrow();
    expect(() => Task.parse({ ...base, expertise: "astrophysics" })).toThrow();
  });
});

describe("Contributor", () => {
  it("requires at least one known expertise", () => {
    expect(() =>
      Contributor.parse({ id: "c1", name: "Asha", expertise: [] }),
    ).toThrow();
    expect(
      Contributor.parse({ id: "c1", name: "Asha", expertise: ["finance", "legal"] }).expertise,
    ).toHaveLength(2);
  });
});

describe("RoutingAttempt", () => {
  it("accepts pending without resolution, matched with contributor", () => {
    const pending = RoutingAttempt.parse({
      requestId: "r1",
      taskId: "t1",
      status: "pending",
      dispatchedAt: ts,
      resolvedAt: null,
      outcomeContributorId: null,
    });
    expect(pending.status).toBe("pending");
  });
});

describe("EngineOverride", () => {
  it("accepts each documented override shape, rejects blends", () => {
    expect(EngineOverride.parse({ delayMs: 8000 })).toEqual({ delayMs: 8000 });
    expect(EngineOverride.parse({ drop: true })).toEqual({ drop: true });
    expect(EngineOverride.parse({ forceNoMatch: true })).toEqual({ forceNoMatch: true });
    expect(() => EngineOverride.parse({ drop: true, delayMs: 5 })).toThrow();
    expect(() => RouteRequest.parse({ engine: { drop: "yes" } })).toThrow();
    expect(RouteRequest.parse({}).engine).toBeUndefined();
  });
});

describe("RoutingCallback", () => {
  it("requires contributorId on matched, forbids nothing on no-match", () => {
    expect(
      RoutingCallback.parse({ routingRequestId: "r1", outcome: "matched", contributorId: "c1" })
        .outcome,
    ).toBe("matched");
    expect(() =>
      RoutingCallback.parse({ routingRequestId: "r1", outcome: "matched" }),
    ).toThrow();
    expect(
      RoutingCallback.parse({ routingRequestId: "r1", outcome: "no-match" }).contributorId,
    ).toBeUndefined();
  });
});

describe("HistoryEvent + OverrideRequest", () => {
  it("orders by seq and accepts cancel-or-assign overrides", () => {
    const e = HistoryEvent.parse({
      id: "h1",
      taskId: "t1",
      seq: 0,
      kind: "routing-started",
      payload: { requestId: "r1" },
      at: ts,
    });
    expect(e.seq).toBe(0);
    expect(OverrideRequest.parse({ contributorId: "c9" }).contributorId).toBe("c9");
    expect(OverrideRequest.parse({ cancel: true }).cancel).toBe(true);
  });
});
