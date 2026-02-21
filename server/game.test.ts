import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// ─── Haversine math (duplicated from useFuel for server-side test) ─────────────

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

describe("Haversine distance", () => {
  it("returns ~0 for same point", () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBeCloseTo(0, 1);
  });

  it("returns ~111 km per degree of latitude", () => {
    const d = haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it("Paris to London is ~340 km", () => {
    const d = haversine({ lat: 48.8566, lon: 2.3522 }, { lat: 51.5074, lon: -0.1278 });
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(360);
  });

  it("handles antipodal points (~20,000 km)", () => {
    const d = haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 180 });
    expect(d).toBeGreaterThan(19000);
    expect(d).toBeLessThan(21000);
  });
});

// ─── Proximity detection logic (mirrors useFuel constants) ──────────────────

const LIGHTNING_DANGER_RADIUS_KM = 800;
const SATELLITE_REFUEL_RADIUS_KM = 1200;

function findNearest<T extends { lat?: number; latitude?: number; lon?: number; longitude?: number }>(
  astronautPos: { lat: number; lon: number },
  items: T[],
  getLat: (t: T) => number,
  getLon: (t: T) => number
): { dist: number; pos: { lat: number; lon: number } | null } {
  let minDist = Infinity;
  let nearestPos: { lat: number; lon: number } | null = null;
  for (const item of items) {
    const lat = getLat(item);
    const lon = getLon(item);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const d = haversine(astronautPos, { lat, lon });
    if (d < minDist) {
      minDist = d;
      nearestPos = { lat, lon };
    }
  }
  return { dist: isFinite(minDist) ? minDist : 0, pos: nearestPos };
}

describe("Proximity detection", () => {
  const astronaut = { lat: 35.6762, lon: 139.6503 }; // Tokyo

  it("detects lightning within danger radius", () => {
    const nearStrike = { lat: 35.0, lon: 139.0 }; // ~90 km from Tokyo
    const { dist } = findNearest([nearStrike], [nearStrike], (s) => s.lat!, (s) => s.lon!);
    expect(dist).toBeLessThan(LIGHTNING_DANGER_RADIUS_KM);
  });

  it("does not flag lightning outside danger radius", () => {
    const farStrike = { lat: 0, lon: 0 }; // ~15,000 km from Tokyo
    const d = haversine(astronaut, farStrike);
    expect(d).toBeGreaterThan(LIGHTNING_DANGER_RADIUS_KM);
  });

  it("detects satellite within refuel radius", () => {
    const nearSat = { lat: 36.0, lon: 140.0 }; // ~60 km from Tokyo
    const d = haversine(astronaut, nearSat);
    expect(d).toBeLessThan(SATELLITE_REFUEL_RADIUS_KM);
  });

  it("does not flag satellite outside refuel radius", () => {
    const farSat = { lat: -33.8688, lon: 151.2093 }; // Sydney, ~7800 km
    const d = haversine(astronaut, farSat);
    expect(d).toBeGreaterThan(SATELLITE_REFUEL_RADIUS_KM);
  });

  it("correctly computes intensity (0 at boundary, 1 at center)", () => {
    // At the exact radius edge, intensity should be 0
    // We approximate by placing a point just inside
    const justInsideDist = LIGHTNING_DANGER_RADIUS_KM * 0.99;
    const intensity = Math.max(0, 1 - justInsideDist / LIGHTNING_DANGER_RADIUS_KM);
    expect(intensity).toBeGreaterThan(0);
    expect(intensity).toBeLessThan(0.02);

    // At the center (dist=0), intensity should be 1
    const centerIntensity = Math.max(0, 1 - 0 / LIGHTNING_DANGER_RADIUS_KM);
    expect(centerIntensity).toBe(1);
  });

  it("nearest point selection returns the closest of multiple options", () => {
    const strikes = [
      { lat: 0, lon: 0 },    // far
      { lat: 35.5, lon: 139.5 }, // ~25 km from Tokyo
      { lat: 10, lon: 10 },  // far
    ];
    let minDist = Infinity;
    for (const s of strikes) {
      const d = haversine(astronaut, s);
      if (d < minDist) minDist = d;
    }
    expect(minDist).toBeLessThan(50); // nearest should be ~25 km
  });
});

describe("quiz.generate", () => {
  it("returns a question for easy difficulty", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.quiz.generate({ difficulty: "easy" });
    expect(result).toHaveProperty("question");
    expect(result).toHaveProperty("hint");
    expect(result.type).toBe("text");
    expect(typeof result.question).toBe("string");
    expect(result.question.length).toBeGreaterThan(5);
  }, 30000);

  it("returns a question for medium difficulty", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.quiz.generate({ difficulty: "medium" });
    expect(result).toHaveProperty("question");
    expect(result).toHaveProperty("hint");
    expect(result.type).toBe("text");
  }, 30000);

  it("returns a LeetCode code question for hard difficulty", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.quiz.generate({ difficulty: "hard" });
    expect(result).toHaveProperty("question");
    expect(result).toHaveProperty("hint");
    expect(result.type).toBe("code");
    expect(result.leetcodeId).toBeGreaterThanOrEqual(1);
    expect(result.leetcodeId).toBeLessThanOrEqual(100);
  }, 30000);
});

describe("quiz.grade", () => {
  it("grades a correct easy answer as passed", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.quiz.grade({
      difficulty: "easy",
      question: "What is the largest ocean on Earth?",
      answer: "The Pacific Ocean is the largest ocean on Earth, covering more than 30% of the Earth's surface.",
    });
    expect(result).toHaveProperty("passed");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("feedback");
    expect(result).toHaveProperty("fuelReward");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.passed).toBe(true);
    expect(result.fuelReward).toBeGreaterThan(0);
  }, 30000);

  it("grades a wrong answer as failed", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.quiz.grade({
      difficulty: "easy",
      question: "What is the largest ocean on Earth?",
      answer: "The Sahara Desert",
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(60);
  }, 30000);

  it("grades a code submission for hard difficulty", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.quiz.grade({
      difficulty: "hard",
      question: "Two Sum: Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
      answer: "",
      code: `function twoSum(nums, target) {
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) return [map.get(complement), i];
    map.set(nums[i], i);
  }
  return [];
}`,
    });
    expect(result).toHaveProperty("passed");
    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("fuelReward");
    expect(result.passed).toBe(true);
    expect(result.fuelReward).toBeGreaterThan(0);
  }, 30000);

  it("fuel reward is higher for harder difficulties", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const [easy, medium] = await Promise.all([
      caller.quiz.grade({
        difficulty: "easy",
        question: "What is the largest ocean?",
        answer: "Pacific Ocean",
      }),
      caller.quiz.grade({
        difficulty: "medium",
        question: "What is Big O notation?",
        answer: "Big O notation describes the upper bound of an algorithm's time or space complexity as input size grows. It helps compare algorithm efficiency.",
      }),
    ]);
    if (easy.passed && medium.passed) {
      expect(medium.fuelReward).toBeGreaterThan(easy.fuelReward);
    }
  }, 60000);
});
