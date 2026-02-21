import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

// ─── N2YO Satellite Data ──────────────────────────────────────────────────────

// A few important satellites to always include via /positions for accuracy
const PINNED_SATELLITES = [
  { id: 25544, name: "ISS" },
  { id: 48274, name: "CSS (Tianhe)" },
  { id: 20580, name: "Hubble" },
];

interface SatelliteRecord {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
  category?: string;
}

// Server-side cache: refresh every 30 seconds
let satCache: { data: SatelliteRecord[]; ts: number } | null = null;
const SAT_CACHE_TTL_MS = 30_000;

async function fetchAboveCategory(
  categoryId: number,
  label: string,
  apiKey: string
): Promise<SatelliteRecord[]> {
  // Use equator/prime meridian as observer with 90-degree search radius (whole sky)
  const url = `https://api.n2yo.com/rest/v1/satellite/above/0/0/0/90/${categoryId}/&apiKey=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`N2YO /above error cat=${categoryId}: ${res.status}`);
  const data = await res.json() as {
    info: { category: string; transactionscount: number; satcount: number };
    above: Array<{
      satid: number; satname: string;
      intDesignator: string; launchDate: string;
      satlat: number; satlng: number; satalt: number;
    }>;
  };
  return (data.above ?? []).map((s) => ({
    id: s.satid,
    name: s.satname,
    latitude: s.satlat,
    longitude: s.satlng,
    altitude: s.satalt,
    category: label,
  }));
}

async function fetchPinnedPosition(satId: number, name: string, apiKey: string): Promise<SatelliteRecord> {
  const url = `https://api.n2yo.com/rest/v1/satellite/positions/${satId}/0/0/0/1/&apiKey=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`N2YO /positions error sat=${satId}: ${res.status}`);
  const data = await res.json() as {
    info: { satname: string; satid: number };
    positions: Array<{ satlatitude: number; satlongitude: number; sataltitude: number }>;
  };
  return {
    id: data.info.satid,
    name: data.info.satname || name,
    latitude: data.positions[0]?.satlatitude ?? 0,
    longitude: data.positions[0]?.satlongitude ?? 0,
    altitude: data.positions[0]?.sataltitude ?? 0,
    category: "Pinned",
  };
}

async function fetchAllSatellites(apiKey: string): Promise<SatelliteRecord[]> {
  // Return cached data if still fresh
  if (satCache && Date.now() - satCache.ts < SAT_CACHE_TTL_MS) {
    return satCache.data;
  }

  // Fetch all satellites globally (category 0, 90° radius = whole sky)
  // and pinned satellites with precise /positions data in parallel
  const [categoryResult, pinnedResult] = await Promise.allSettled([
    fetchAboveCategory(0, "All", apiKey),
    Promise.allSettled(
      PINNED_SATELLITES.map((s) => fetchPinnedPosition(s.id, s.name, apiKey))
    ),
  ]);

  const merged = new Map<number, SatelliteRecord>();

  if (categoryResult.status === "fulfilled") {
    console.log(`[N2YO] /above returned ${categoryResult.value.length} satellites`);
    for (const sat of categoryResult.value) {
      if (isFinite(sat.latitude) && isFinite(sat.longitude)) {
        merged.set(sat.id, sat);
      }
    }
  } else {
    console.error("[N2YO] /above failed:", categoryResult.reason);
  }

  // Override with more accurate pinned positions
  if (pinnedResult.status === "fulfilled") {
    for (const r of pinnedResult.value) {
      if (r.status === "fulfilled") {
        const sat = r.value;
        if (isFinite(sat.latitude) && isFinite(sat.longitude)) {
          merged.set(sat.id, { ...sat, category: "Featured" });
        }
      }
    }
  }

  const data = Array.from(merged.values());
  // Only cache if we got a meaningful result (more than just pinned)
  if (data.length > PINNED_SATELLITES.length) {
    satCache = { data, ts: Date.now() };
  }
  return data;
}

// ─── In-memory Lightning Store ────────────────────────────────────────────────

export interface LightningStrike {
  lat: number; lon: number; time: number; id: string;
}

class LightningStore {
  private strikes: LightningStrike[] = [];
  private total = 0;
  private readonly maxSize = 500;

  add(strike: LightningStrike) {
    this.strikes.push(strike);
    this.total++;
    if (this.strikes.length > this.maxSize) {
      this.strikes = this.strikes.slice(-this.maxSize);
    }
  }

  getRecent(n: number): LightningStrike[] { return this.strikes.slice(-n); }
  getTotal(): number { return this.total; }
  getLastMinute(): number {
    const oneMinuteAgo = Date.now() - 60000;
    return this.strikes.filter((s) => s.time > oneMinuteAgo).length;
  }
}

export const lightningStore = new LightningStore();

// ─── Gemini Helper ────────────────────────────────────────────────────────────

function getGeminiAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  return new GoogleGenAI({ apiKey });
}

// ─── Gemini Travel Mood ───────────────────────────────────────────────────────

async function generateTravelMood(lat: number, lon: number, destination: string): Promise<{
  mood: string; sources: Array<{ title: string; uri: string }>;
}> {
  const ai = getGeminiAI();
  const prompt = `You are a cheerful astronaut explorer floating above Earth at coordinates ${lat.toFixed(4)}°, ${lon.toFixed(4)}°, currently heading towards ${destination}. 

Write a short, enthusiastic travel diary entry (2-3 sentences) sharing your mood and observations about this location from space. Mention what you can see below, the local culture, landmarks, or interesting facts about this place. Be poetic, curious, and full of wonder. Write in first person as the astronaut. Use English.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: { retrievalConfig: { latLng: { latitude: lat, longitude: lon } } },
      },
    });
    const text = response.text ?? "The view from up here is breathtaking!";
    const sources: Array<{ title: string; uri: string }> = [];
    const grounding = response.candidates?.[0]?.groundingMetadata;
    if (grounding?.groundingChunks) {
      for (const chunk of grounding.groundingChunks) {
        const c = chunk as { maps?: { title?: string; uri?: string } };
        if (c.maps?.title && c.maps?.uri) sources.push({ title: c.maps.title, uri: c.maps.uri });
      }
    }
    return { mood: text, sources };
  } catch {
    const response = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    return { mood: response.text ?? "The view from up here is breathtaking!", sources: [] };
  }
}

// ─── Quiz Generation ──────────────────────────────────────────────────────────

const DIFFICULTY_SCHEMA = z.enum(["easy", "medium", "hard"]);
type Difficulty = z.infer<typeof DIFFICULTY_SCHEMA>;

async function generateQuiz(difficulty: Difficulty): Promise<{
  question: string;
  hint: string;
  type: "text" | "code";
  leetcodeId?: number;
  language?: string;
}> {
  const ai = getGeminiAI();

  if (difficulty === "easy") {
    const prompt = `Generate a fun, short geography or space trivia question for an astronaut game. 
The question should be answerable in 1-2 sentences. 
Return ONLY valid JSON with this exact structure: {"question": "...", "hint": "..."}
No markdown, no code blocks, just raw JSON.`;
    const resp = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    try {
      const raw = (resp.text ?? "{}").replace(/```json\n?|```/g, "").trim();
      const parsed = JSON.parse(raw) as { question: string; hint: string };
      return { question: parsed.question, hint: parsed.hint, type: "text" };
    } catch {
      return {
        question: "What is the name of the largest ocean on Earth?",
        hint: "It covers more than 30% of Earth's surface.",
        type: "text",
      };
    }
  }

  if (difficulty === "medium") {
    const prompt = `Generate a programming concept question (no coding required, just explanation) for an intermediate developer.
The question should test understanding of algorithms, data structures, or software design.
Return ONLY valid JSON: {"question": "...", "hint": "..."}
No markdown, no code blocks, just raw JSON.`;
    const resp = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    try {
      const raw = (resp.text ?? "{}").replace(/```json\n?|```/g, "").trim();
      const parsed = JSON.parse(raw) as { question: string; hint: string };
      return { question: parsed.question, hint: parsed.hint, type: "text" };
    } catch {
      return {
        question: "Explain the difference between BFS and DFS graph traversal.",
        hint: "Think about which data structure each algorithm uses internally.",
        type: "text",
      };
    }
  }

  // Hard: random LeetCode problem via Gemini
  const leetcodeId = Math.floor(Math.random() * 100) + 1;
  const prompt = `LeetCode problem '${leetcodeId}'. Please just tell me the problem and a hint — no need to provide the solution. Return ONLY valid JSON with this structure: {"question": "...", "hint": "..."}. The question field should contain the full problem statement. No markdown, no code blocks, just raw JSON.`;
  const resp = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
  try {
    const raw = (resp.text ?? "{}").replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(raw) as { question: string; hint: string };
    return {
      question: parsed.question,
      hint: parsed.hint,
      type: "code",
      leetcodeId,
      language: "javascript",
    };
  } catch {
    return {
      question: `LeetCode #${leetcodeId}: Two Sum — Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.`,
      hint: "Consider using a hash map for O(n) time complexity.",
      type: "code",
      leetcodeId,
      language: "javascript",
    };
  }
}

// ─── Quiz Grading ─────────────────────────────────────────────────────────────

async function gradeAnswer(
  difficulty: Difficulty,
  question: string,
  answer: string,
  code?: string
): Promise<{ passed: boolean; score: number; feedback: string; fuelReward: number }> {
  const ai = getGeminiAI();

  const fuelRewards: Record<Difficulty, number> = { easy: 25, medium: 40, hard: 60 };

  let prompt: string;
  if (difficulty === "hard" && code) {
    prompt = `You are grading a LeetCode coding submission.

Problem: ${question}

Student's code:
\`\`\`
${code}
\`\`\`

Grade this submission. Consider: correctness of logic, edge cases, time/space complexity.
Return ONLY valid JSON: {"passed": true/false, "score": 0-100, "feedback": "2-3 sentence feedback"}
A score >= 60 means passed. No markdown, no code blocks, just raw JSON.`;
  } else {
    prompt = `You are grading a quiz answer.

Question: ${question}
Student's answer: ${answer}

Grade this answer for correctness and completeness.
Return ONLY valid JSON: {"passed": true/false, "score": 0-100, "feedback": "1-2 sentence feedback"}
A score >= 60 means passed. Be encouraging but honest. No markdown, no code blocks, just raw JSON.`;
  }

  try {
    const resp = await ai.models.generateContent({ model: "gemini-2.5-flash", contents: prompt });
    const raw = (resp.text ?? "{}").replace(/```json\n?|```/g, "").trim();
    const parsed = JSON.parse(raw) as { passed: boolean; score: number; feedback: string };
    return {
      passed: parsed.passed,
      score: parsed.score,
      feedback: parsed.feedback,
      fuelReward: parsed.passed ? fuelRewards[difficulty] : 5,
    };
  } catch {
    return {
      passed: false,
      score: 0,
      feedback: "Could not evaluate your answer. Please try again.",
      fuelReward: 0,
    };
  }
}

// ─── App Router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  satellites: router({
    tracked: publicProcedure.query(async () => {
      const apiKey = process.env.N2YO_API_KEY;
      if (!apiKey) return { available: false, message: "N2YO API key not configured", satellites: [] as SatelliteRecord[] };
      try {
        const satellites = await fetchAllSatellites(apiKey);
        return { available: true, count: satellites.length, satellites };
      } catch (err) {
        console.error("[N2YO] Error:", err);
        return { available: false, message: "Failed to fetch satellite data", satellites: [] as SatelliteRecord[] };
      }
    }),

    position: publicProcedure
      .input(z.object({ satId: z.number() }))
      .query(async ({ input }) => {
        const apiKey = process.env.N2YO_API_KEY;
        if (!apiKey) throw new Error("N2YO API key not configured");
        return await fetchPinnedPosition(input.satId, String(input.satId), apiKey);
      }),
  }),

  lightning: router({
    recent: publicProcedure.query(() => ({
      strikes: lightningStore.getRecent(100),
      total: lightningStore.getTotal(),
      lastMinute: lightningStore.getLastMinute(),
    })),
  }),

  astronaut: router({
    cosmicWindow: publicProcedure
      .mutation(async () => {
        // Fetch the top-100 Hubble images page and pick a random slug
        try {
          const listRes = await fetch("https://esahubble.org/images/archive/top100/", {
            signal: AbortSignal.timeout(10000),
            headers: { "User-Agent": "Mozilla/5.0 (compatible; RealTimeDashboard/1.0)" },
          });
          if (!listRes.ok) throw new Error(`ESA Hubble list fetch failed: ${listRes.status}`);
          const html = await listRes.text();

          // Extract all image slugs like /images/heic2017a/
          const slugPattern = /href="\/images\/([a-z0-9_-]+)\/"/g;
          const excluded = new Set(['potw','potm','viewall','search','archive','top100']);
          const matches: string[] = [];
          let m: RegExpExecArray | null;
          while ((m = slugPattern.exec(html)) !== null) {
            const slug = m[1];
            if (slug && !excluded.has(slug)) matches.push(slug);
          }

          if (matches.length === 0) throw new Error("No image slugs found");

          // Pick a random slug
          const slug = matches[Math.floor(Math.random() * matches.length)];

          // Fetch the image detail page to get title
          const detailRes = await fetch(`https://esahubble.org/images/${slug}/`, {
            signal: AbortSignal.timeout(10000),
            headers: { "User-Agent": "Mozilla/5.0 (compatible; RealTimeDashboard/1.0)" },
          });
          let title = slug;
          let description = "";
          if (detailRes.ok) {
            const detailHtml = await detailRes.text();
            const titleMatch = detailHtml.match(/<title>([^<]+)<\/title>/);
            if (titleMatch) title = titleMatch[1].replace(" | ESA/Hubble", "").replace(/&#39;/g, "'").trim();
            const descMatch = detailHtml.match(/<meta name="description" content="([^"]+)"/);
            if (descMatch) description = descMatch[1].trim();
            if (!description) {
              // Try og:description
              const ogMatch = detailHtml.match(/<meta property="og:description" content="([^"]+)"/);
              if (ogMatch) description = ogMatch[1].trim();
            }
          }

          // Build CDN image URL — use 'screen' size (good quality, not too large)
          const imageUrl = `https://cdn.esahubble.org/archives/images/screen/${slug}.jpg`;
          const pageUrl = `https://esahubble.org/images/${slug}/`;

          return { available: true, slug, imageUrl, pageUrl, title, description };
        } catch (err) {
          console.error("[CosmicWindow] Error fetching Hubble image:", err);
          // Fallback to a known good image
          return {
            available: true,
            slug: "heic2017a",
            imageUrl: "https://cdn.esahubble.org/archives/images/screen/heic2017a.jpg",
            pageUrl: "https://esahubble.org/images/heic2017a/",
            title: "Hubble's View of Jupiter and Europa",
            description: "A stunning view of Jupiter and its moon Europa captured by the Hubble Space Telescope.",
          };
        }
      }),

    travelMood: publicProcedure
      .input(z.object({ lat: z.number(), lon: z.number(), destination: z.string() }))
      .mutation(async ({ input }) => {
        if (!process.env.GEMINI_API_KEY) {
          return { available: false, mood: "GEMINI_API_KEY not configured.", sources: [] };
        }
        try {
          const result = await generateTravelMood(input.lat, input.lon, input.destination);
          return { available: true, ...result };
        } catch (err) {
          console.error("[Gemini] Travel mood error:", err);
          return { available: false, mood: "Unable to generate travel mood at this time.", sources: [] };
        }
      }),
  }),

  quiz: router({
    generate: publicProcedure
      .input(z.object({ difficulty: DIFFICULTY_SCHEMA }))
      .mutation(async ({ input }) => {
        if (!process.env.GEMINI_API_KEY) {
          return {
            question: "What is the speed of light in km/s?",
            hint: "It's approximately 300,000 km/s.",
            type: "text" as const,
            leetcodeId: undefined,
            language: undefined,
          };
        }
        try {
          return await generateQuiz(input.difficulty);
        } catch (err) {
          console.error("[Quiz] Generate error:", err);
          return {
            question: "What is the name of the galaxy we live in?",
            hint: "It has a spiral shape and contains over 100 billion stars.",
            type: "text" as const,
            leetcodeId: undefined,
            language: undefined,
          };
        }
      }),

    grade: publicProcedure
      .input(z.object({
        difficulty: DIFFICULTY_SCHEMA,
        question: z.string(),
        answer: z.string(),
        code: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        if (!process.env.GEMINI_API_KEY) {
          return { passed: true, score: 70, feedback: "API key not configured — auto-passing.", fuelReward: 20 };
        }
        try {
          return await gradeAnswer(input.difficulty, input.question, input.answer, input.code);
        } catch (err) {
          console.error("[Quiz] Grade error:", err);
          return { passed: false, score: 0, feedback: "Grading failed. Please try again.", fuelReward: 0 };
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
