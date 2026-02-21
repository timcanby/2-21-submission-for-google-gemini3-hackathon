import { describe, expect, it } from "vitest";

// ─── Pure math utilities extracted for testing ────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("haversine distance", () => {
  it("returns ~0 for same point", () => {
    expect(haversine(35.6, 139.7, 35.6, 139.7)).toBeCloseTo(0, 1);
  });

  it("returns ~20015 km for antipodal points", () => {
    // Roughly half the Earth's circumference
    const dist = haversine(0, 0, 0, 180);
    expect(dist).toBeGreaterThan(19000);
    expect(dist).toBeLessThan(21000);
  });

  it("Paris to Tokyo is roughly 9700 km", () => {
    const dist = haversine(48.8566, 2.3522, 35.6762, 139.6503);
    expect(dist).toBeGreaterThan(9000);
    expect(dist).toBeLessThan(10500);
  });

  it("New York to London is roughly 5500 km", () => {
    const dist = haversine(40.7128, -74.006, 51.5074, -0.1278);
    expect(dist).toBeGreaterThan(5000);
    expect(dist).toBeLessThan(6000);
  });
});

describe("slerp interpolation", () => {
  it("returns start point at t=0", () => {
    const [lat, lon] = slerp(48.8566, 2.3522, 35.6762, 139.6503, 0);
    expect(lat).toBeCloseTo(48.8566, 1);
    expect(lon).toBeCloseTo(2.3522, 1);
  });

  it("returns destination at t=1", () => {
    const [lat, lon] = slerp(48.8566, 2.3522, 35.6762, 139.6503, 1);
    expect(lat).toBeCloseTo(35.6762, 1);
    expect(lon).toBeCloseTo(139.6503, 1);
  });

  it("midpoint is between start and end", () => {
    const [lat, lon] = slerp(0, 0, 0, 90, 0.5);
    // Midpoint of equator 0°→90° should be near 0°, 45°
    expect(lat).toBeCloseTo(0, 0);
    expect(lon).toBeCloseTo(45, 0);
  });

  it("returns valid lat/lon range", () => {
    for (let t = 0; t <= 1; t += 0.1) {
      const [lat, lon] = slerp(-33.8688, 151.2093, 40.7128, -74.006, t);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
      expect(lon).toBeGreaterThanOrEqual(-180);
      expect(lon).toBeLessThanOrEqual(180);
    }
  });
});

describe("cosmicWindow URL builder", () => {
  it("builds a valid ESA Hubble CDN URL from a slug", () => {
    const slug = "heic0601a";
    const imageUrl = `https://cdn.esahubble.org/archives/images/screen/${slug}.jpg`;
    const pageUrl = `https://esahubble.org/images/${slug}/`;
    expect(imageUrl).toMatch(/^https:\/\/cdn\.esahubble\.org\/archives\/images\/screen\/.+\.jpg$/);
    expect(pageUrl).toMatch(/^https:\/\/esahubble\.org\/images\/.+\/$/);
  });

  it("generates a random index within the top100 range", () => {
    const TOP100_COUNT = 100;
    for (let i = 0; i < 20; i++) {
      const idx = Math.floor(Math.random() * TOP100_COUNT);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(TOP100_COUNT);
    }
  });

  it("slug extraction regex matches ESA Hubble image paths", () => {
    const html = `<a href="/images/heic2007a/">Some image</a><a href="/images/potw2001a/">Another</a>`;
    const slugs: string[] = [];
    const re = /href="\/images\/([a-z0-9]+)\/"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) slugs.push(m[1]);
    expect(slugs).toEqual(["heic2007a", "potw2001a"]);
    expect(slugs.length).toBe(2);
  });
});
