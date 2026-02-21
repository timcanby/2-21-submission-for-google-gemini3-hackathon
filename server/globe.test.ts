import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter, lightningStore } from "./routers";
import type { TrpcContext } from "./_core/context";

function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Lightning Store Tests ────────────────────────────────────────────────────

describe("LightningStore", () => {
  it("returns recent strikes", () => {
    const store = lightningStore;
    const before = store.getTotal();
    store.add({ lat: 35.6, lon: 139.7, time: Date.now(), id: "test-1" });
    expect(store.getTotal()).toBe(before + 1);
    const recent = store.getRecent(10);
    expect(recent.length).toBeGreaterThan(0);
    const last = recent[recent.length - 1]!;
    expect(last.lat).toBe(35.6);
    expect(last.lon).toBe(139.7);
  });

  it("counts strikes in last minute", () => {
    const store = lightningStore;
    const nowMs = Date.now();
    store.add({ lat: 10, lon: 20, time: nowMs, id: "test-now" });
    store.add({ lat: 11, lon: 21, time: nowMs - 120000, id: "test-old" }); // 2 min ago
    const count = store.getLastMinute();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ─── Lightning Router Tests ───────────────────────────────────────────────────

describe("lightning.recent", () => {
  it("returns strikes, total, and lastMinute", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.lightning.recent();
    expect(result).toHaveProperty("strikes");
    expect(result).toHaveProperty("total");
    expect(result).toHaveProperty("lastMinute");
    expect(Array.isArray(result.strikes)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(typeof result.lastMinute).toBe("number");
  });
});

// ─── Satellites Router Tests ──────────────────────────────────────────────────

describe("satellites.tracked (no API key)", () => {
  it("returns available: false when N2YO_API_KEY is not set", async () => {
    const originalKey = process.env.N2YO_API_KEY;
    delete process.env.N2YO_API_KEY;

    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.satellites.tracked();

    expect(result.available).toBe(false);
    expect(result.satellites).toEqual([]);

    if (originalKey) process.env.N2YO_API_KEY = originalKey;
  });

  it("returns available: false and empty array when N2YO_API_KEY is not set (tracked)", async () => {
    const originalKey = process.env.N2YO_API_KEY;
    delete process.env.N2YO_API_KEY;

    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.satellites.tracked();

    expect(result.available).toBe(false);
    expect(Array.isArray(result.satellites)).toBe(true);
    expect(result.satellites.length).toBe(0);

    if (originalKey) process.env.N2YO_API_KEY = originalKey;
  });
});

// ─── Auth Tests ───────────────────────────────────────────────────────────────

describe("auth.me", () => {
  it("returns null for unauthenticated user", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});
