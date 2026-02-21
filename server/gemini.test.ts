import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("astronaut.travelMood", () => {
  it("returns available: false when GEMINI_API_KEY is not set", async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.astronaut.travelMood({
      lat: 35.6762,
      lon: 139.6503,
      destination: "Tokyo",
    });

    expect(result.available).toBe(false);
    expect(typeof result.mood).toBe("string");
    expect(Array.isArray(result.sources)).toBe(true);

    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  });

  it("procedure exists and accepts lat/lon/destination input", async () => {
    const ctx = createCtx();
    const caller = appRouter.createCaller(ctx);
    // Just verify the procedure is callable (may fail due to API key in test env)
    const result = await caller.astronaut.travelMood({
      lat: 48.8566,
      lon: 2.3522,
      destination: "Paris",
    });
    // Should return an object with mood and sources regardless of key availability
    expect(result).toHaveProperty("mood");
    expect(result).toHaveProperty("sources");
    expect(result).toHaveProperty("available");
  });
});
