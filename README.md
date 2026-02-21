# LeetCode Space Odyssey

> **Fuel your journey — one problem at a time.**

LeetCode Space Odyssey is a real-time interactive space dashboard where you travel the cosmos alongside an astronaut. Your spacecraft orbits the globe autonomously, collecting fuel by docking near satellites and losing fuel when lightning storms pass beneath. When the tank runs critically low, a LeetCode-style coding challenge appears — solve it to refuel and keep flying.


---
🎬 Demo video: [Watch on YouTube](https://youtu.be/C7XZ36psWGc)

## Features

| Feature | Description |
|---|---|
| Real-time globe | Interactive D3.js orthographic globe with drag-to-rotate and configurable spin speed |
| Satellite tracking | 2,500+ live satellites fetched from N2YO, with Starlink toggle and per-category filtering |
| Lightning feed | Live global lightning strikes streamed from the Blitzortung WebSocket network |
| Astronaut fuel system | Fuel drains near lightning (danger zone ≤ 800 km) and recharges near satellites (charge zone ≤ 1,200 km) |
| Proximity visualization | Animated distance bars, pulsing rings on the globe, and dashed connection lines to nearest threat/source |
| LeetCode refuel quiz | AI-generated coding challenges (Easy/Medium/Hard) graded by Gemini; correct answers restore fuel |
| Starlink toggle | Show or hide all STARLINK-* satellites with a single button |
| Globe spin control | Slider to set rotation speed from 0× (stopped) to 3× |
| Welcome screen | Full-screen GIF intro with fade-out transition |
| Explore Universe | One-click link to an external interactive star/planet viewer |

---

## External APIs and Data Sources

### N2YO Satellite Tracking API

**Endpoint used:** `GET /rest/v1/satellite/above/{lat}/{lng}/{alt}/{searchRadius}/{categoryId}/&apiKey={key}`

The `/above` endpoint returns all satellites currently above a given geographic position within a specified search radius. The application calls this endpoint with a 90-degree radius and category `0` (all satellites), returning 2,500–2,700 satellites per request. Three high-interest satellites — the International Space Station (NORAD ID 25544), the Chinese Space Station (CSS, NORAD ID 48274), and the Hubble Space Telescope (NORAD ID 20580) — are additionally fetched via the `/positions` endpoint for higher positional accuracy.

Results are cached server-side for 30 seconds to stay within the N2YO free-tier rate limit of 1,000 transactions per hour.

**Sign up:** [https://www.n2yo.com/api/](https://www.n2yo.com/api/)  
**Environment variable:** `N2YO_API_KEY`

---

### Blitzortung Lightning Network (WebSocket)

Blitzortung is a community-driven, real-time global lightning detection network operated by volunteers. The application connects to one of the public WebSocket endpoints (`wss://ws1.blitzortung.org` through `wss://ws8.blitzortung.org`) and receives a continuous stream of lightning strike events, each containing latitude, longitude, and a Unix timestamp in nanoseconds.

The server maintains a persistent WebSocket connection with automatic reconnection on drop, and fans out decoded strike events to all connected browser clients via Server-Sent Events (SSE).

**Network homepage:** [https://www.blitzortung.org](https://www.blitzortung.org)  
**No API key required.** The WebSocket endpoints are publicly accessible.

---

### Gemini AI (LeetCode Quiz Generation and Grading)

When the astronaut's fuel level drops to a critical threshold (≤ 20%), a coding quiz modal appears. The quiz system uses Google Gemini to:

1. **Generate** a LeetCode-style problem appropriate to the selected difficulty (Easy, Medium, or Hard), including a problem statement, example inputs/outputs, and constraints.
2. **Grade** the user's code submission by evaluating correctness, edge-case handling, and time/space complexity against the problem specification.

Both generation and grading are performed server-side via the `invokeLLM` helper, which routes through the Manus built-in Forge API (a Gemini-compatible endpoint). Fuel reward scales with difficulty: Easy (+10%), Medium (+20%), Hard (+35%).

**Environment variable:** `GEMINI_API_KEY` (injected automatically on Manus; configure manually for self-hosting)

---

### World TopoJSON (Natural Earth)

The globe land masses are rendered from a pre-processed TopoJSON file derived from [Natural Earth](https://www.naturalearthdata.com/) 110m resolution data, served as a static asset at `/world-110m.json`. No API key or network request is required at runtime — the file is bundled with the application.

**Source:** [https://github.com/topojson/world-atlas](https://github.com/topojson/world-atlas)  
**License:** Public Domain

---

### StarsAndPlanets (External Viewer)

The **Explore Universe** button in the header opens [https://raydekk.github.io/StarsAndPlanets/](https://raydekk.github.io/StarsAndPlanets/) in a new tab. This is an independent third-party interactive 3D star and planet viewer; the application does not embed or integrate it programmatically.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19 + TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Globe rendering | D3.js (geoOrthographic projection) |
| API layer | tRPC 11 (end-to-end typed procedures) |
| Backend runtime | Node.js + Express 4 |
| Database ORM | Drizzle ORM (MySQL/TiDB) |
| Real-time data | Server-Sent Events (SSE) for lightning; polling for satellites |
| Build tool | Vite 6 |
| Testing | Vitest (37 tests across 5 test files) |

---

## Project Structure

```
client/
  src/
    components/
      Globe.tsx           D3 globe with satellite, lightning, astronaut, and proximity rendering
      FuelBar.tsx         Fuel level display with proximity distance bars
      WelcomeScreen.tsx   Full-screen intro with animated GIF background
      QuizModal.tsx       LeetCode-style quiz modal for fuel refill
      AstronautPanel.tsx  Astronaut position and destination details
    hooks/
      useAstronaut.ts     Astronaut position interpolation and waypoint logic
      useFuel.ts          Fuel drain/charge engine with proximity detection
    pages/
      Home.tsx            Main dashboard layout and state orchestration
server/
  routers.ts              tRPC procedures: satellites, lightning SSE, quiz generation/grading
  lightning-ws.ts         Blitzortung WebSocket client with reconnection logic
  db.ts                   Database query helpers
drizzle/
  schema.ts               Database schema (users, sessions)
shared/
  types.ts                Shared TypeScript types between client and server
```

---

## Getting Started (Self-Hosting)

```bash
# 1. Install dependencies
pnpm install

# 2. Copy and fill in environment variables
cp .env.example .env

# 3. Push the database schema
pnpm db:push

# 4. Start the development server
pnpm dev
```

The application runs on `http://localhost:3000` by default. The Vite dev server and Express backend are served from the same port via the tRPC bridge.

---

## Running Tests

```bash
pnpm test
```

---

## Fuel Mechanics Reference

The fuel system runs on a 1-second tick loop. The base drain rate is **−0.5% per minute** while the astronaut is in flight. Proximity modifiers are applied on top of the base rate:

| Condition | Effect |
|---|---|
| Within 800 km of a lightning strike | Additional drain proportional to proximity (up to −3%/min at closest approach) |
| Within 1,200 km of a satellite | Charge proportional to proximity (up to +2%/min at closest approach) |
| Fuel ≤ 20% | Quiz modal triggered; correct answer restores 10–35% depending on difficulty |
| Fuel = 0% | Astronaut is grounded until refueled |

---

## License

This project is provided for educational and demonstration purposes. The N2YO API, Blitzortung network, and Gemini API are subject to their respective terms of service. The Natural Earth TopoJSON data is in the public domain.
  