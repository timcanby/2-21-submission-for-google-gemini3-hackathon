import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import * as topojson from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";

export interface SatellitePoint {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number;
}

export interface LightningPoint {
  id: string;
  lat: number;
  lon: number;
  time: number;
}

export interface AstronautPoint {
  lat: number;
  lon: number;
  progress: number;
  destLat: number;
  destLon: number;
}

interface GlobeProps {
  satellites: SatellitePoint[];
  lightning: LightningPoint[];
  astronaut: AstronautPoint;
  showSatellites: boolean;
  showLightning: boolean;
  onSatelliteClick?: (s: SatellitePoint) => void;
  onAstronautClick?: () => void;
  // Proximity highlights
  nearestLightningPos?: { lat: number; lon: number } | null;
  nearestSatellitePos?: { lat: number; lon: number } | null;
  nearLightning?: boolean;
  nearSatellite?: boolean;
  lightningIntensity?: number;   // 0–1
  satelliteIntensity?: number;   // 0–1
  rotationSpeed?: number;        // multiplier: 0 = stopped, 1 = default
}

const SATELLITE_COLOR = "#CE93D8";   // purple
const LIGHTNING_COLOR = "#FFF176";   // yellow
const ASTRONAUT_COLOR = "#FFD700";   // gold

export default function Globe({
  satellites,
  lightning,
  astronaut,
  showSatellites,
  showLightning,
  onSatelliteClick,
  onAstronautClick,
  nearestLightningPos,
  nearestSatellitePos,
  nearLightning = false,
  nearSatellite = false,
  lightningIntensity = 0,
  satelliteIntensity = 0,
  rotationSpeed = 1,
}: GlobeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const projectionRef = useRef<d3.GeoProjection | null>(null);
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef<[number, number] | null>(null);
  const rotationRef = useRef<[number, number, number]>([0, -20, 0]);
  const animFrameRef = useRef<number | null>(null);
  const autoRotateRef = useRef(true);
  const rotationSpeedRef = useRef(rotationSpeed);
  const worldRef = useRef<Topology | null>(null);

  // Load world topojson once
  useEffect(() => {
    fetch("/world-110m.json")
      .then((r) => r.json())
      .then((data: Topology) => {
        worldRef.current = data;
        renderGlobe();
      })
      .catch(console.error);
  }, []);

  const renderGlobe = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || !worldRef.current) return;

    const rect = svg.getBoundingClientRect();
    const width = rect.width || 600;
    const height = rect.height || 600;
    const radius = Math.min(width, height) / 2 - 10;

    const projection = d3
      .geoOrthographic()
      .scale(radius)
      .translate([width / 2, height / 2])
      .clipAngle(90)
      .rotate(rotationRef.current);

    projectionRef.current = projection;
    const path = d3.geoPath().projection(projection);

    d3.select(svg).selectAll("*").remove();

    const defs = d3.select(svg).append("defs");

    // Ocean gradient
    const oceanGrad = defs
      .append("radialGradient")
      .attr("id", "ocean-gradient")
      .attr("cx", "40%")
      .attr("cy", "40%");
    oceanGrad.append("stop").attr("offset", "0%").attr("stop-color", "#0d2b45");
    oceanGrad.append("stop").attr("offset", "100%").attr("stop-color", "#050A14");

    // Globe glow filter
    const filter = defs.append("filter").attr("id", "globe-glow");
    filter.append("feGaussianBlur").attr("stdDeviation", "8").attr("result", "blur");
    const merge = filter.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    // Lightning glow filter
    const lightningFilter = defs.append("filter").attr("id", "lightning-glow");
    lightningFilter.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", "3").attr("result", "blur");
    const lm = lightningFilter.append("feMerge");
    lm.append("feMergeNode").attr("in", "blur");
    lm.append("feMergeNode").attr("in", "SourceGraphic");

    // Danger glow filter (red)
    const dangerFilter = defs.append("filter").attr("id", "danger-glow");
    dangerFilter.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", "5").attr("result", "blur");
    const dm = dangerFilter.append("feMerge");
    dm.append("feMergeNode").attr("in", "blur");
    dm.append("feMergeNode").attr("in", "SourceGraphic");

    // Charge glow filter (green)
    const chargeFilter = defs.append("filter").attr("id", "charge-glow");
    chargeFilter.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", "5").attr("result", "blur");
    const cm = chargeFilter.append("feMerge");
    cm.append("feMergeNode").attr("in", "blur");
    cm.append("feMergeNode").attr("in", "SourceGraphic");

    const g = d3.select(svg).append("g");

    // Outer glow circle
    g.append("circle")
      .attr("cx", width / 2)
      .attr("cy", height / 2)
      .attr("r", radius + 4)
      .attr("fill", "none")
      .attr("stroke", "rgba(79, 195, 247, 0.15)")
      .attr("stroke-width", "8")
      .attr("filter", "url(#globe-glow)");

    // Ocean sphere
    g.append("circle")
      .attr("cx", width / 2)
      .attr("cy", height / 2)
      .attr("r", radius)
      .attr("fill", "url(#ocean-gradient)");

    // Graticule (grid lines)
    const graticule = d3.geoGraticule()();
    g.append("path")
      .datum(graticule)
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "rgba(79, 195, 247, 0.06)")
      .attr("stroke-width", "0.5");

    // Land
    const world = worldRef.current!;
    const countries = topojson.feature(
      world,
      world.objects["countries"] as GeometryCollection
    );
    g.append("path")
      .datum(countries)
      .attr("d", path)
      .attr("fill", "rgba(30, 60, 40, 0.85)")
      .attr("stroke", "rgba(79, 195, 247, 0.2)")
      .attr("stroke-width", "0.4");

    // Country borders
    const borders = topojson.mesh(
      world,
      world.objects["countries"] as GeometryCollection,
      (a, b) => a !== b
    );
    g.append("path")
      .datum(borders)
      .attr("d", path)
      .attr("fill", "none")
      .attr("stroke", "rgba(79, 195, 247, 0.15)")
      .attr("stroke-width", "0.3");

    // ── Lightning Layer ──────────────────────────────────────────────────────
    if (showLightning) {
      const now = Date.now();
      const recentLightning = lightning.filter((l) => now - l.time < 120000); // last 2 min

      const lightningG = g.append("g").attr("class", "lightning-layer");
      recentLightning.forEach((strike) => {
        const pos = projection([strike.lon, strike.lat]);
        if (!pos) return;

        const age = (now - strike.time) / 120000; // 0=new, 1=old
        const opacity = Math.max(0, 1 - age);

        lightningG
          .append("circle")
          .attr("cx", pos[0])
          .attr("cy", pos[1])
          .attr("r", age < 0.1 ? 5 : 2.5)
          .attr("fill", LIGHTNING_COLOR)
          .attr("opacity", opacity)
          .attr("filter", age < 0.1 ? "url(#lightning-glow)" : null);
      });
    }

    // ── Satellite Layer ──────────────────────────────────────────────────────
    if (showSatellites) {
      const satG = g.append("g").attr("class", "satellite-layer");
      satellites.forEach((s) => {
        const pos = projection([s.longitude, s.latitude]);
        if (!pos) return;

        const group = satG
          .append("g")
          .attr("transform", `translate(${pos[0]}, ${pos[1]})`)
          .attr("cursor", "pointer")
          .on("click", () => onSatelliteClick?.(s));

        // Satellite icon (diamond shape)
        group
          .append("polygon")
          .attr("points", "0,-5 3,0 0,5 -3,0")
          .attr("fill", SATELLITE_COLOR)
          .attr("opacity", 0.9);

        // Satellite label
        group
          .append("text")
          .attr("x", 6)
          .attr("y", 4)
          .attr("font-size", "8px")
          .attr("fill", SATELLITE_COLOR)
          .attr("opacity", 0.8)
          .text(s.name.length > 12 ? s.name.substring(0, 12) + "…" : s.name);
      });
    }

    // ── Proximity Connection Lines ───────────────────────────────────────────
    const astroPos = projection([astronaut.lon, astronaut.lat]);

    if (astroPos) {
      // Line to nearest lightning
      if (nearestLightningPos) {
        const lPos = projection([nearestLightningPos.lon, nearestLightningPos.lat]);
        if (lPos) {
          const lineOpacity = nearLightning ? 0.5 + lightningIntensity * 0.4 : 0.2;
          const lineColor = nearLightning ? "#ef4444" : "#FFF17688";
          g.append("line")
            .attr("x1", astroPos[0]).attr("y1", astroPos[1])
            .attr("x2", lPos[0]).attr("y2", lPos[1])
            .attr("stroke", lineColor)
            .attr("stroke-width", nearLightning ? 1.5 : 0.8)
            .attr("stroke-dasharray", "4,5")
            .attr("opacity", lineOpacity);

          // Pulsing ring around nearest lightning when in danger zone
          if (nearLightning) {
            const ringR = 8 + lightningIntensity * 10;
            g.append("circle")
              .attr("cx", lPos[0])
              .attr("cy", lPos[1])
              .attr("r", ringR)
              .attr("fill", "none")
              .attr("stroke", "#ef4444")
              .attr("stroke-width", 1.5)
              .attr("opacity", 0.6 * lightningIntensity)
              .attr("filter", "url(#danger-glow)");
            // Outer ring
            g.append("circle")
              .attr("cx", lPos[0])
              .attr("cy", lPos[1])
              .attr("r", ringR + 5)
              .attr("fill", "none")
              .attr("stroke", "#ef4444")
              .attr("stroke-width", 0.8)
              .attr("opacity", 0.3 * lightningIntensity);
          }
        }
      }

      // Line to nearest satellite
      if (nearestSatellitePos) {
        const sPos = projection([nearestSatellitePos.lon, nearestSatellitePos.lat]);
        if (sPos) {
          const lineOpacity = nearSatellite ? 0.5 + satelliteIntensity * 0.4 : 0.2;
          const lineColor = nearSatellite ? "#22c55e" : "#CE93D888";
          g.append("line")
            .attr("x1", astroPos[0]).attr("y1", astroPos[1])
            .attr("x2", sPos[0]).attr("y2", sPos[1])
            .attr("stroke", lineColor)
            .attr("stroke-width", nearSatellite ? 1.5 : 0.8)
            .attr("stroke-dasharray", "4,5")
            .attr("opacity", lineOpacity);

          // Pulsing ring around nearest satellite when in charge zone
          if (nearSatellite) {
            const ringR = 8 + satelliteIntensity * 10;
            g.append("circle")
              .attr("cx", sPos[0])
              .attr("cy", sPos[1])
              .attr("r", ringR)
              .attr("fill", "none")
              .attr("stroke", "#22c55e")
              .attr("stroke-width", 1.5)
              .attr("opacity", 0.6 * satelliteIntensity)
              .attr("filter", "url(#charge-glow)");
            // Outer ring
            g.append("circle")
              .attr("cx", sPos[0])
              .attr("cy", sPos[1])
              .attr("r", ringR + 5)
              .attr("fill", "none")
              .attr("stroke", "#22c55e")
              .attr("stroke-width", 0.8)
              .attr("opacity", 0.3 * satelliteIntensity);
          }
        }
      }
    }

    // ── Astronaut Layer ──────────────────────────────────────────────────────
    {
      const pos = projection([astronaut.lon, astronaut.lat]);
      if (pos) {
        // Draw travel path arc (faint dashed line to destination)
        const destPos = projection([astronaut.destLon, astronaut.destLat]);
        if (destPos) {
          g.append("line")
            .attr("x1", pos[0]).attr("y1", pos[1])
            .attr("x2", destPos[0]).attr("y2", destPos[1])
            .attr("stroke", "rgba(255,215,0,0.15)")
            .attr("stroke-width", "1")
            .attr("stroke-dasharray", "3,4");
        }

        const astroG = g.append("g")
          .attr("transform", `translate(${pos[0]}, ${pos[1]})`)
          .attr("cursor", "pointer")
          .on("click", () => onAstronautClick?.());

        // Danger aura when near lightning
        if (nearLightning && lightningIntensity > 0.1) {
          astroG.append("circle")
            .attr("r", 18 + lightningIntensity * 8)
            .attr("fill", `rgba(239,68,68,${lightningIntensity * 0.12})`)
            .attr("stroke", "#ef4444")
            .attr("stroke-width", 0.8)
            .attr("opacity", lightningIntensity * 0.6);
        }

        // Charge aura when near satellite
        if (nearSatellite && satelliteIntensity > 0.1) {
          astroG.append("circle")
            .attr("r", 18 + satelliteIntensity * 8)
            .attr("fill", `rgba(34,197,94,${satelliteIntensity * 0.1})`)
            .attr("stroke", "#22c55e")
            .attr("stroke-width", 0.8)
            .attr("opacity", satelliteIntensity * 0.6);
        }

        // Outer pulse ring
        astroG.append("circle")
          .attr("r", 10)
          .attr("fill", "none")
          .attr("stroke", ASTRONAUT_COLOR)
          .attr("stroke-width", "1")
          .attr("opacity", 0.3);

        // Mid ring
        astroG.append("circle")
          .attr("r", 6)
          .attr("fill", "none")
          .attr("stroke", ASTRONAUT_COLOR)
          .attr("stroke-width", "1.5")
          .attr("opacity", 0.6);

        // Core dot
        astroG.append("circle")
          .attr("r", 3.5)
          .attr("fill", ASTRONAUT_COLOR)
          .attr("opacity", 1)
          .attr("filter", "url(#lightning-glow)");

        // Astronaut emoji label
        astroG.append("text")
          .attr("x", 10)
          .attr("y", -8)
          .attr("font-size", "11px")
          .attr("fill", ASTRONAUT_COLOR)
          .attr("opacity", 0.9)
          .attr("font-family", "monospace")
          .text("🧑‍🚀");
      }
    }
  }, [
    satellites, lightning, astronaut,
    showSatellites, showLightning,
    onSatelliteClick, onAstronautClick,
    nearestLightningPos, nearestSatellitePos,
    nearLightning, nearSatellite,
    lightningIntensity, satelliteIntensity,
  ]);

  // Sync rotationSpeed prop into ref so the animation loop always reads latest value
  useEffect(() => {
    rotationSpeedRef.current = rotationSpeed;
  }, [rotationSpeed]);

  // Auto-rotation
  useEffect(() => {
    let lastTime = 0;
    const rotate = (time: number) => {
      if (autoRotateRef.current && !isDraggingRef.current) {
        const delta = time - lastTime;
        lastTime = time;
        const speed = rotationSpeedRef.current;
        if (speed > 0) {
          rotationRef.current = [
            rotationRef.current[0] + delta * 0.00005 * speed,
            rotationRef.current[1],
            rotationRef.current[2],
          ];
          renderGlobe();
        }
      } else {
        lastTime = time; // keep lastTime in sync even when paused/dragging
      }
      animFrameRef.current = requestAnimationFrame(rotate);
    };
    animFrameRef.current = requestAnimationFrame(rotate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [renderGlobe]);

  // Re-render when data changes
  useEffect(() => {
    renderGlobe();
  }, [renderGlobe]);

  // Drag to rotate
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    autoRotateRef.current = false;
    lastMouseRef.current = [e.clientX, e.clientY];
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !lastMouseRef.current) return;
    const dx = e.clientX - lastMouseRef.current[0];
    const dy = e.clientY - lastMouseRef.current[1];
    lastMouseRef.current = [e.clientX, e.clientY];
    rotationRef.current = [
      rotationRef.current[0] + dx * 0.3,
      rotationRef.current[1] - dy * 0.3,
      rotationRef.current[2],
    ];
    renderGlobe();
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    // Resume auto-rotation after 3 seconds
    setTimeout(() => {
      autoRotateRef.current = true;
    }, 3000);
  };

  // Touch support
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      autoRotateRef.current = false;
      lastMouseRef.current = [e.touches[0]!.clientX, e.touches[0]!.clientY];
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || !lastMouseRef.current || e.touches.length !== 1) return;
    const dx = e.touches[0]!.clientX - lastMouseRef.current[0];
    const dy = e.touches[0]!.clientY - lastMouseRef.current[1];
    lastMouseRef.current = [e.touches[0]!.clientX, e.touches[0]!.clientY];
    rotationRef.current = [
      rotationRef.current[0] + dx * 0.3,
      rotationRef.current[1] - dy * 0.3,
      rotationRef.current[2],
    ];
    renderGlobe();
  };

  return (
    <svg
      ref={svgRef}
      className="w-full h-full select-none"
      style={{ cursor: isDraggingRef.current ? "grabbing" : "grab" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    />
  );
}
