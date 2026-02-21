import { useState, useEffect, useRef, useCallback } from "react";

export interface AstronautState {
  lat: number;
  lon: number;
  destLat: number;
  destLon: number;
  progress: number; // 0..1
  speed: number;    // km/h (simulated)
  placeName: string;
  destPlaceName: string;
  travelStartTime: number;
  travelDurationMs: number;
  totalDistance: number; // km
}

// Great-circle distance in km
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Spherical linear interpolation between two lat/lon points
function slerp(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
  t: number
): [number, number] {
  const φ1 = (lat1 * Math.PI) / 180;
  const λ1 = (lon1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const λ2 = (lon2 * Math.PI) / 180;

  const x1 = Math.cos(φ1) * Math.cos(λ1);
  const y1 = Math.cos(φ1) * Math.sin(λ1);
  const z1 = Math.sin(φ1);
  const x2 = Math.cos(φ2) * Math.cos(λ2);
  const y2 = Math.cos(φ2) * Math.sin(λ2);
  const z2 = Math.sin(φ2);

  const dot = Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2));
  const omega = Math.acos(dot);

  let x: number, y: number, z: number;
  if (Math.abs(omega) < 1e-6) {
    x = x1 + t * (x2 - x1);
    y = y1 + t * (y2 - y1);
    z = z1 + t * (z2 - z1);
  } else {
    const sinOmega = Math.sin(omega);
    const s1 = Math.sin((1 - t) * omega) / sinOmega;
    const s2 = Math.sin(t * omega) / sinOmega;
    x = s1 * x1 + s2 * x2;
    y = s1 * y1 + s2 * y2;
    z = s1 * z1 + s2 * z2;
  }

  const lat = (Math.atan2(z, Math.sqrt(x * x + y * y)) * 180) / Math.PI;
  const lon = (Math.atan2(y, x) * 180) / Math.PI;
  return [lat, lon];
}

// Interesting world locations the astronaut might visit
const INTERESTING_PLACES: Array<{ lat: number; lon: number; name: string }> = [
  { lat: 48.8566, lon: 2.3522, name: "Paris, France" },
  { lat: 35.6762, lon: 139.6503, name: "Tokyo, Japan" },
  { lat: -33.8688, lon: 151.2093, name: "Sydney, Australia" },
  { lat: 40.7128, lon: -74.006, name: "New York, USA" },
  { lat: -22.9068, lon: -43.1729, name: "Rio de Janeiro, Brazil" },
  { lat: 51.5074, lon: -0.1278, name: "London, UK" },
  { lat: 55.7558, lon: 37.6173, name: "Moscow, Russia" },
  { lat: 1.3521, lon: 103.8198, name: "Singapore" },
  { lat: 25.2048, lon: 55.2708, name: "Dubai, UAE" },
  { lat: -1.2921, lon: 36.8219, name: "Nairobi, Kenya" },
  { lat: 64.1466, lon: -21.9426, name: "Reykjavik, Iceland" },
  { lat: -34.6037, lon: -58.3816, name: "Buenos Aires, Argentina" },
  { lat: 19.4326, lon: -99.1332, name: "Mexico City, Mexico" },
  { lat: 37.9838, lon: 23.7275, name: "Athens, Greece" },
  { lat: 30.0444, lon: 31.2357, name: "Cairo, Egypt" },
  { lat: 28.6139, lon: 77.209, name: "New Delhi, India" },
  { lat: 39.9042, lon: 116.4074, name: "Beijing, China" },
  { lat: -26.2041, lon: 28.0473, name: "Johannesburg, South Africa" },
  { lat: 59.9311, lon: 30.3609, name: "Saint Petersburg, Russia" },
  { lat: 41.9028, lon: 12.4964, name: "Rome, Italy" },
  { lat: 52.52, lon: 13.405, name: "Berlin, Germany" },
  { lat: 43.6532, lon: -79.3832, name: "Toronto, Canada" },
  { lat: 34.0522, lon: -118.2437, name: "Los Angeles, USA" },
  { lat: 37.7749, lon: -122.4194, name: "San Francisco, USA" },
  { lat: -4.3217, lon: 15.3222, name: "Kinshasa, DR Congo" },
  { lat: 6.5244, lon: 3.3792, name: "Lagos, Nigeria" },
  { lat: 23.8103, lon: 90.4125, name: "Dhaka, Bangladesh" },
  { lat: 13.7563, lon: 100.5018, name: "Bangkok, Thailand" },
  { lat: -8.8399, lon: 13.2894, name: "Luanda, Angola" },
  { lat: 60.1699, lon: 24.9384, name: "Helsinki, Finland" },
  { lat: 47.3769, lon: 8.5417, name: "Zurich, Switzerland" },
  { lat: 22.3193, lon: 114.1694, name: "Hong Kong" },
  { lat: 14.6937, lon: -17.4441, name: "Dakar, Senegal" },
  { lat: -17.7334, lon: 168.3210, name: "Port Vila, Vanuatu" },
  { lat: 64.9631, lon: -19.0208, name: "Iceland Highlands" },
  { lat: -54.8019, lon: -68.3030, name: "Ushuaia, Argentina" },
  { lat: 78.2232, lon: 15.6267, name: "Longyearbyen, Svalbard" },
  { lat: -69.0, lon: 39.5, name: "Antarctica" },
  { lat: 21.3069, lon: -157.8583, name: "Honolulu, Hawaii" },
  { lat: -8.6573, lon: 115.2126, name: "Bali, Indonesia" },
];

function pickRandomDestination(excludeLat: number, excludeLon: number) {
  let pick: typeof INTERESTING_PLACES[0];
  do {
    pick = INTERESTING_PLACES[Math.floor(Math.random() * INTERESTING_PLACES.length)]!;
  } while (Math.abs(pick.lat - excludeLat) < 5 && Math.abs(pick.lon - excludeLon) < 5);
  return pick;
}

const TRAVEL_SPEED_KMH = 900;

function computeDuration(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const dist = haversine(from.lat, from.lon, to.lat, to.lon);
  return Math.max(8000, (dist / TRAVEL_SPEED_KMH) * 3600 * 1000 * 0.01);
}

function buildInitialState() {
  const start = INTERESTING_PLACES[Math.floor(Math.random() * INTERESTING_PLACES.length)]!;
  const dest = pickRandomDestination(start.lat, start.lon);
  const dist = haversine(start.lat, start.lon, dest.lat, dest.lon);
  const duration = computeDuration(start, dest);
  return {
    start,
    dest,
    state: {
      lat: start.lat,
      lon: start.lon,
      destLat: dest.lat,
      destLon: dest.lon,
      progress: 0,
      speed: TRAVEL_SPEED_KMH,
      placeName: start.name,
      destPlaceName: dest.name,
      travelStartTime: Date.now(),
      travelDurationMs: duration,
      totalDistance: dist,
    } satisfies AstronautState,
    duration,
    startTime: Date.now(),
  };
}

/**
 * useAstronaut — manages the randomly-traveling astronaut state.
 * @param paused  When true, the astronaut freezes in place. The travel clock
 *                is also frozen so it resumes from exactly the same position
 *                when unpaused, rather than jumping forward.
 */
export function useAstronaut(paused = false) {
  const initRef = useRef<ReturnType<typeof buildInitialState> | null>(null);
  if (!initRef.current) {
    initRef.current = buildInitialState();
  }

  const startRef = useRef(initRef.current.start);
  const destRef = useRef(initRef.current.dest);
  const travelStartRef = useRef(initRef.current.startTime);
  const travelDurationRef = useRef(initRef.current.duration);

  // Track how much time has elapsed before the current pause began
  const elapsedBeforePauseRef = useRef(0);
  const pausedRef = useRef(paused);

  const [state, setState] = useState<AstronautState>(initRef.current.state);

  // When paused transitions true→false, shift travelStart forward so elapsed
  // time continues from where it left off (no jump)
  useEffect(() => {
    const wasPaused = pausedRef.current;
    pausedRef.current = paused;

    if (wasPaused && !paused) {
      // Resuming: adjust travelStart so elapsed = elapsedBeforePause
      travelStartRef.current = Date.now() - elapsedBeforePauseRef.current;
    }
  }, [paused]);

  const tick = useCallback(() => {
    if (pausedRef.current) {
      // While paused, keep recording how much elapsed time we have
      elapsedBeforePauseRef.current = Date.now() - travelStartRef.current;
      return;
    }

    const now = Date.now();
    const elapsed = now - travelStartRef.current;
    const duration = travelDurationRef.current;

    if (duration <= 0) return;

    const t = Math.min(1, elapsed / duration);

    const [curLat, curLon] = slerp(
      startRef.current.lat, startRef.current.lon,
      destRef.current.lat, destRef.current.lon,
      t
    );

    if (!isFinite(curLat) || !isFinite(curLon)) return;

    if (t >= 1) {
      const newStart = destRef.current;
      const newDest = pickRandomDestination(newStart.lat, newStart.lon);
      const newDuration = computeDuration(newStart, newDest);
      const newDist = haversine(newStart.lat, newStart.lon, newDest.lat, newDest.lon);

      startRef.current = newStart;
      destRef.current = newDest;
      travelStartRef.current = now;
      travelDurationRef.current = newDuration;
      elapsedBeforePauseRef.current = 0;

      setState({
        lat: newStart.lat,
        lon: newStart.lon,
        destLat: newDest.lat,
        destLon: newDest.lon,
        progress: 0,
        speed: TRAVEL_SPEED_KMH,
        placeName: newStart.name,
        destPlaceName: newDest.name,
        travelStartTime: now,
        travelDurationMs: newDuration,
        totalDistance: newDist,
      });
    } else {
      setState((prev) => ({
        ...prev,
        lat: curLat,
        lon: curLon,
        progress: t,
      }));
    }
  }, []);

  useEffect(() => {
    const id = setInterval(tick, 100); // 10fps
    return () => clearInterval(id);
  }, [tick]);

  return state;
}
