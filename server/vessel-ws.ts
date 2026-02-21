/**
 * AISStream Vessel Tracking WebSocket Proxy
 *
 * Connects to wss://stream.aisstream.io/v0/stream with the AISSTREAM_API_KEY,
 * subscribes to PositionReport messages globally, stores recent vessel positions,
 * and re-broadcasts to connected SSE clients at /api/vessels/stream.
 *
 * Data format from aisstream.io:
 * {
 *   MessageType: "PositionReport",
 *   Metadata: { Latitude, Longitude, MMSI, ShipName, ... },
 *   Message: { PositionReport: { Cog, Sog, TrueHeading, ... } }
 * }
 */

import type { Request, Response } from "express";
import WebSocket from "ws";
import { nanoid } from "nanoid";

// ─── Vessel Store ─────────────────────────────────────────────────────────────

export interface VesselPoint {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  cog: number;      // Course over ground (degrees)
  sog: number;      // Speed over ground (knots)
  heading: number;
  time: number;     // ms timestamp
  shipType?: number;
}

class VesselStore {
  private vessels = new Map<string, VesselPoint>();
  private maxSize = 500;

  update(vessel: VesselPoint) {
    this.vessels.set(vessel.mmsi, vessel);
    // Trim to max size (remove oldest by insertion order)
    if (this.vessels.size > this.maxSize) {
      const firstKey = this.vessels.keys().next().value;
      if (firstKey) this.vessels.delete(firstKey);
    }
  }

  getAll(): VesselPoint[] {
    return Array.from(this.vessels.values());
  }

  getCount(): number {
    return this.vessels.size;
  }

  isAvailable(): boolean {
    return !!process.env.AISSTREAM_API_KEY;
  }
}

export const vesselStore = new VesselStore();

// ─── SSE Client Registry ──────────────────────────────────────────────────────

const sseClients = new Map<string, Response>();

function broadcastVessel(vessel: VesselPoint) {
  const data = `data: ${JSON.stringify(vessel)}\n\n`;
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

// ─── AISStream WebSocket Connection ──────────────────────────────────────────

let aisWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;

export function connectAISStream() {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    console.log("[AISStream] No API key configured, vessel tracking disabled");
    return;
  }

  if (isConnecting || (aisWs && aisWs.readyState === WebSocket.OPEN)) {
    return;
  }

  isConnecting = true;
  console.log("[AISStream] Connecting to wss://stream.aisstream.io/v0/stream...");

  try {
    aisWs = new WebSocket("wss://stream.aisstream.io/v0/stream");
  } catch (err) {
    console.error("[AISStream] Failed to create WebSocket:", err);
    isConnecting = false;
    scheduleReconnect(10000);
    return;
  }

  aisWs.on("open", () => {
    isConnecting = false;
    console.log("[AISStream] Connected, subscribing to global PositionReport...");

    // Subscribe to position reports globally
    const subscription = {
      APIKey: apiKey,
      BoundingBoxes: [[[-90, -180], [90, 180]]],
      FilterMessageTypes: ["PositionReport"],
    };
    aisWs!.send(JSON.stringify(subscription));
  });

  aisWs.on("message", (rawData: Buffer | string) => {
    try {
      const str = Buffer.isBuffer(rawData) ? rawData.toString("utf8") : (rawData as string);
      const msg = JSON.parse(str) as {
        MessageType?: string;
        Metadata?: {
          MMSI?: number | string;
          ShipName?: string;
          TimeReceived?: string;
          latitude?: number;
          longitude?: number;
        };
        Message?: {
          PositionReport?: {
            Cog?: number;
            Sog?: number;
            TrueHeading?: number;
            ShipType?: number;
            Latitude?: number;
            Longitude?: number;
            UserID?: number;
          };
        };
      };

      if (msg.MessageType !== "PositionReport") return;

      const meta = msg.Metadata;
      const pos = msg.Message?.PositionReport;

      // lat/lon live in Message.PositionReport (not Metadata)
      const lat = pos?.Latitude ?? (meta as any)?.Latitude;
      const lon = pos?.Longitude ?? (meta as any)?.Longitude;
      const mmsi = String(meta?.MMSI ?? pos?.UserID ?? "");

      if (!lat || !lon || !mmsi) return;

      // Validate coordinates
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;
      // Filter out 0,0 (null island) which is a common AIS error
      if (Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01) return;

      const vessel: VesselPoint = {
        mmsi,
        name: meta?.ShipName?.trim() || mmsi,
        lat,
        lon,
        cog: pos?.Cog ?? 0,
        sog: pos?.Sog ?? 0,
        heading: pos?.TrueHeading ?? pos?.Cog ?? 0,
        time: Date.now(),
        shipType: pos?.ShipType,
      };

      vesselStore.update(vessel);
      broadcastVessel(vessel);
    } catch {
      // Ignore parse errors
    }
  });

  aisWs.on("error", (err) => {
    isConnecting = false;
    console.error("[AISStream] WebSocket error:", err.message);
  });

  aisWs.on("close", (code, reason) => {
    isConnecting = false;
    console.log(`[AISStream] Connection closed (${code}): ${reason?.toString() || "no reason"}`);
    aisWs = null;
    scheduleReconnect(10000);
  });
}

function scheduleReconnect(delay: number) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectAISStream();
  }, delay);
}

export function getAISStreamStatus(): "connected" | "disconnected" | "disabled" {
  if (!process.env.AISSTREAM_API_KEY) return "disabled";
  if (!aisWs) return "disconnected";
  return aisWs.readyState === WebSocket.OPEN ? "connected" : "disconnected";
}

// ─── SSE Handler ──────────────────────────────────────────────────────────────

export function handleVesselSSE(req: Request, res: Response) {
  const clientId = nanoid();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: "connected", clientId })}\n\n`);

  // Send current vessel snapshot
  const vessels = vesselStore.getAll();
  if (vessels.length > 0) {
    res.write(`data: ${JSON.stringify({ type: "snapshot", vessels })}\n\n`);
  }

  sseClients.set(clientId, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(`:heartbeat\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(clientId);
    }
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(clientId);
  });
}
