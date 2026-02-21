import { useState, useEffect, useRef, useCallback } from "react";

export type FuelEvent = "lightning_drain" | "satellite_refuel" | "passive_drain" | "quiz_refuel";

export interface FuelState {
  fuel: number;           // 0–100
  maxFuel: number;        // always 100
  isLow: boolean;         // fuel < 20
  isCritical: boolean;    // fuel < 10
  nearLightning: boolean;
  nearSatellite: boolean;
  lightningDist: number | null;   // km to nearest strike
  satelliteDist: number | null;   // km to nearest satellite
  nearestLightningPos: { lat: number; lon: number } | null;
  nearestSatellitePos: { lat: number; lon: number } | null;
  lightningIntensity: number;     // 0–1, how close (1 = at center)
  satelliteIntensity: number;     // 0–1, how close (1 = at center)
  fuelDeltaPerSec: number;        // net fuel change per second (+ or -)
  lastEvent: FuelEvent | null;
}

interface LatLon { lat: number; lon: number }
interface LightningStrike { lat: number; lon: number }
interface Satellite { latitude: number; longitude: number; satname?: string }

// Haversine distance in km
function haversine(a: LatLon, b: LatLon): number {
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

export const LIGHTNING_DANGER_RADIUS_KM = 800;   // within this → drain
export const SATELLITE_REFUEL_RADIUS_KM = 1200;  // within this → refuel
const PASSIVE_DRAIN_RATE = 0.008;         // % per second
const LIGHTNING_DRAIN_RATE = 0.06;        // % per second at max proximity
const SATELLITE_REFUEL_RATE = 0.04;       // % per second at max proximity
const TICK_MS = 1000;

export function useFuel(
  astronautPos: LatLon | null,
  lightningStrikes: LightningStrike[],
  satellites: Satellite[],
  paused: boolean
) {
  const [state, setState] = useState<FuelState>({
    fuel: 85,
    maxFuel: 100,
    isLow: false,
    isCritical: false,
    nearLightning: false,
    nearSatellite: false,
    lightningDist: null,
    satelliteDist: null,
    nearestLightningPos: null,
    nearestSatellitePos: null,
    lightningIntensity: 0,
    satelliteIntensity: 0,
    fuelDeltaPerSec: -PASSIVE_DRAIN_RATE,
    lastEvent: null,
  });

  // Keep latest values in refs so the stable interval callback always sees fresh data
  const fuelRef = useRef(85);
  const pausedRef = useRef(paused);
  const astronautPosRef = useRef(astronautPos);
  const lightningRef = useRef(lightningStrikes);
  const satellitesRef = useRef(satellites);

  // Sync refs on every render — no deps needed for the interval itself
  pausedRef.current = paused;
  astronautPosRef.current = astronautPos;
  lightningRef.current = lightningStrikes;
  satellitesRef.current = satellites;

  useEffect(() => {
    const id = setInterval(() => {
      const pos = astronautPosRef.current;
      if (pausedRef.current || !pos || !isFinite(pos.lat) || !isFinite(pos.lon)) return;

      const strikes = lightningRef.current;
      const sats = satellitesRef.current;

      // Find nearest lightning strike
      let minLightningDist = Infinity;
      let nearestLightningPos: { lat: number; lon: number } | null = null;
      for (const s of strikes) {
        if (s == null || !isFinite(s.lat) || !isFinite(s.lon)) continue;
        const d = haversine(pos, { lat: s.lat, lon: s.lon });
        if (d < minLightningDist) {
          minLightningDist = d;
          nearestLightningPos = { lat: s.lat, lon: s.lon };
        }
      }

      // Find nearest satellite
      let minSatDist = Infinity;
      let nearestSatellitePos: { lat: number; lon: number } | null = null;
      for (const sat of sats) {
        if (sat == null || sat.latitude == null || sat.longitude == null) continue;
        if (!isFinite(sat.latitude) || !isFinite(sat.longitude)) continue;
        const d = haversine(pos, { lat: sat.latitude, lon: sat.longitude });
        if (d < minSatDist) {
          minSatDist = d;
          nearestSatellitePos = { lat: sat.latitude, lon: sat.longitude };
        }
      }

      const nearLightning = isFinite(minLightningDist) && minLightningDist < LIGHTNING_DANGER_RADIUS_KM;
      const nearSatellite = isFinite(minSatDist) && minSatDist < SATELLITE_REFUEL_RADIUS_KM;

      const lightningIntensity = nearLightning
        ? Math.max(0, 1 - minLightningDist / LIGHTNING_DANGER_RADIUS_KM)
        : 0;
      const satelliteIntensity = nearSatellite
        ? Math.max(0, 1 - minSatDist / SATELLITE_REFUEL_RADIUS_KM)
        : 0;

      let delta = -PASSIVE_DRAIN_RATE;
      let lastEvent: FuelEvent = "passive_drain";

      if (nearLightning) {
        delta -= LIGHTNING_DRAIN_RATE * lightningIntensity;
        lastEvent = "lightning_drain";
      }

      if (nearSatellite) {
        delta += SATELLITE_REFUEL_RATE * satelliteIntensity;
        lastEvent = "satellite_refuel";
      }

      const newFuel = Math.max(0, Math.min(100, fuelRef.current + delta));
      fuelRef.current = newFuel;

      setState({
        fuel: newFuel,
        maxFuel: 100,
        isLow: newFuel < 20,
        isCritical: newFuel < 10,
        nearLightning,
        nearSatellite,
        lightningDist: isFinite(minLightningDist) ? Math.round(minLightningDist) : null,
        satelliteDist: isFinite(minSatDist) ? Math.round(minSatDist) : null,
        nearestLightningPos,
        nearestSatellitePos,
        lightningIntensity,
        satelliteIntensity,
        fuelDeltaPerSec: delta,
        lastEvent,
      });
    }, TICK_MS);

    return () => clearInterval(id);
  }, []); // stable — no deps, reads from refs

  const refuelFromQuiz = useCallback((amount: number) => {
    const newFuel = Math.min(100, fuelRef.current + amount);
    fuelRef.current = newFuel;
    setState(prev => ({
      ...prev,
      fuel: newFuel,
      isLow: newFuel < 20,
      isCritical: newFuel < 10,
      lastEvent: "quiz_refuel",
    }));
  }, []);

  return { fuelState: state, refuelFromQuiz };
}
