/**
 * Blitzortung Lightning WebSocket Proxy
 *
 * Connects to Blitzortung's WebSocket server (wss://ws1.blitzortung.org),
 * decodes the obfuscated data stream, and re-broadcasts to connected clients
 * via Server-Sent Events (SSE) at /api/lightning/stream.
 *
 * The Blitzortung data uses LZW-like compression. After decoding, each message
 * is a JSON object with { time, lat, lon, alt, ... }.
 */

import type { Request, Response } from "express";
import WebSocket from "ws";
import { lightningStore } from "./routers";
import { nanoid } from "nanoid";

// ─── SSE Client Registry ──────────────────────────────────────────────────────

const sseClients = new Map<string, Response>();

export function addSSEClient(id: string, res: Response) {
  sseClients.set(id, res);
}

export function removeSSEClient(id: string) {
  sseClients.delete(id);
}

function broadcastLightning(strike: { lat: number; lon: number; time: number; id: string }) {
  const data = `data: ${JSON.stringify(strike)}\n\n`;
  const toDelete: string[] = [];
  sseClients.forEach((res, id) => {
    try {
      res.write(data);
    } catch {
      toDelete.push(id);
    }
  });
  toDelete.forEach((id) => sseClients.delete(id));
}

// ─── Blitzortung Decoder ──────────────────────────────────────────────────────

/**
 * Blitzortung sends JSON with obfuscation:
 * - U+0106 (Ć) replaces ":" (colon)
 * - U+0119 (ę) replaces "," (comma)
 * - Other Unicode chars (U+0100-U+03FF) are noise inserted into numeric/string values
 * - Some letters in key names are also replaced by Unicode chars
 *
 * Strategy: replace the two structural chars, strip remaining non-ASCII noise,
 * then use robust regex to extract time/lat/lon directly.
 */
function decodeBlitzortung(b: Buffer): { lat: number; lon: number; time: number } | null {
  const str = b.toString("utf8");

  // Step 1: replace structural unicode substitutions
  let decoded = str
    .replace(/\u0106/g, ":")
    .replace(/\u0119/g, ",");

  // Step 2: strip remaining non-ASCII noise
  decoded = decoded.replace(/[^\x00-\x7F]/g, "");

  // Step 3: extract fields via regex (JSON may still be malformed due to missing quotes)
  // Pattern handles both "lat":VALUE and lat:VALUE (with or without surrounding quotes)
  const timeMatch = decoded.match(/"?time"?:(\d+)/);
  const latMatch  = decoded.match(/"?lat"?:([-\d.]+)/);
  const lonMatch  = decoded.match(/"?lon"?:([-\d.]+)/);

  if (!timeMatch || !latMatch || !lonMatch) return null;

  const rawTime = parseInt(timeMatch[1]!, 10);
  const lat = parseFloat(latMatch[1]!);
  const lon = parseFloat(lonMatch[1]!);

  // Validate coordinate ranges
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  // Blitzortung time is in nanoseconds; convert to milliseconds
  // If the value is > 1e15 it's nanoseconds, otherwise already ms
  const timeMs = rawTime > 1e15 ? Math.floor(rawTime / 1e6) : rawTime;

  return { lat, lon, time: timeMs };
}

// ─── Blitzortung WebSocket Connection ────────────────────────────────────────

const BLITZORTUNG_SERVERS = [
  "wss://ws1.blitzortung.org",
  "wss://ws7.blitzortung.org",
  "wss://ws8.blitzortung.org",
];

let currentServerIndex = 0;
let blitzortungWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;

export function connectBlitzortung() {
  if (isConnecting || (blitzortungWs && blitzortungWs.readyState === WebSocket.OPEN)) {
    return;
  }

  isConnecting = true;
  const serverUrl = BLITZORTUNG_SERVERS[currentServerIndex % BLITZORTUNG_SERVERS.length]!;
  currentServerIndex++;

  console.log(`[Blitzortung] Connecting to ${serverUrl}...`);

  try {
    blitzortungWs = new WebSocket(serverUrl, {
      headers: {
        "Origin": "https://www.blitzortung.org",
        "User-Agent": "Mozilla/5.0 (compatible; RealTimeGlobeDashboard/1.0)",
      },
    });
  } catch (err) {
    console.error("[Blitzortung] Failed to create WebSocket:", err);
    isConnecting = false;
    scheduleReconnect(5000);
    return;
  }

  blitzortungWs.on("open", () => {
    isConnecting = false;
    console.log(`[Blitzortung] Connected to ${serverUrl}`);
    // Send subscription message to start receiving lightning data
    blitzortungWs!.send(JSON.stringify({ a: 111 }));
  });

  blitzortungWs.on("message", (rawData: Buffer | string) => {
    try {
      const buf = Buffer.isBuffer(rawData) ? rawData : Buffer.from(rawData as string);
      const decoded = decodeBlitzortung(buf);
      if (!decoded) return;

      const strike = {
        lat: decoded.lat,
        lon: decoded.lon,
        time: decoded.time,
        id: nanoid(8),
      };

      lightningStore.add(strike);
      broadcastLightning(strike);
    } catch {
      // Silently ignore parse errors
    }
  });

  blitzortungWs.on("error", (err) => {
    isConnecting = false;
    console.error("[Blitzortung] WebSocket error:", err.message);
  });

  blitzortungWs.on("close", (code, reason) => {
    isConnecting = false;
    console.log(`[Blitzortung] Connection closed (${code}): ${reason?.toString() || "no reason"}`);
    blitzortungWs = null;
    scheduleReconnect(5000);
  });
}

function scheduleReconnect(delay: number) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBlitzortung();
  }, delay);
}

export function getBlitzortungStatus() {
  if (!blitzortungWs) return "disconnected";
  switch (blitzortungWs.readyState) {
    case WebSocket.CONNECTING: return "connecting";
    case WebSocket.OPEN: return "connected";
    case WebSocket.CLOSING: return "closing";
    case WebSocket.CLOSED: return "disconnected";
    default: return "unknown";
  }
}

// ─── SSE Handler ──────────────────────────────────────────────────────────────

export function handleLightningSSE(req: Request, res: Response) {
  const clientId = nanoid();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

  // Send recent strikes on connect
  const recent = lightningStore.getRecent(50);
  if (recent.length > 0) {
    res.write(`data: ${JSON.stringify({ type: "history", strikes: recent })}\n\n`);
  }

  addSSEClient(clientId, res);

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    try {
      res.write(`:heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      removeSSEClient(clientId);
    }
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSSEClient(clientId);
  });
}
