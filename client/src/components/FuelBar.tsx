import { useEffect, useRef, useState } from "react";
import { Zap, AlertTriangle, Satellite, Flame, FlaskConical, TrendingDown, TrendingUp } from "lucide-react";
import type { FuelState } from "@/hooks/useFuel";
import { LIGHTNING_DANGER_RADIUS_KM, SATELLITE_REFUEL_RADIUS_KM } from "@/hooks/useFuel";

interface FuelBarProps {
  fuelState: FuelState;
  onRefuelClick: () => void;
}

function getFuelColor(fuel: number): string {
  if (fuel > 60) return "#22c55e";
  if (fuel > 35) return "#eab308";
  if (fuel > 20) return "#f97316";
  return "#ef4444";
}

function getFuelGlow(fuel: number): string {
  if (fuel > 60) return "rgba(34,197,94,0.4)";
  if (fuel > 35) return "rgba(234,179,8,0.4)";
  if (fuel > 20) return "rgba(249,115,22,0.4)";
  return "rgba(239,68,68,0.5)";
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${(delta * 60).toFixed(2)}%/min`;
}

export default function FuelBar({ fuelState, onRefuelClick }: FuelBarProps) {
  const {
    fuel, isLow, isCritical,
    nearLightning, nearSatellite,
    lightningDist, satelliteDist,
    lightningIntensity, satelliteIntensity,
    fuelDeltaPerSec,
  } = fuelState;

  const pulseRef = useRef<HTMLDivElement>(null);

  // Flash animation when fuel changes direction
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const prevDeltaRef = useRef(fuelDeltaPerSec);
  useEffect(() => {
    const prev = prevDeltaRef.current;
    prevDeltaRef.current = fuelDeltaPerSec;
    if (Math.abs(fuelDeltaPerSec - prev) > 0.01) {
      const color = fuelDeltaPerSec > prev ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)";
      setFlashColor(color);
      const t = setTimeout(() => setFlashColor(null), 600);
      return () => clearTimeout(t);
    }
  }, [fuelDeltaPerSec]);

  useEffect(() => {
    if (!pulseRef.current) return;
    pulseRef.current.style.animation = isCritical ? "pulse 0.8s ease-in-out infinite" : "";
  }, [isCritical]);

  const color = getFuelColor(fuel);
  const glow = getFuelGlow(fuel);
  const pct = Math.max(0, Math.min(100, fuel));

  // Proximity bar percentages (0–100 representing how close we are to the radius edge)
  const lightningBarPct = lightningDist != null
    ? Math.max(0, Math.min(100, (1 - lightningDist / LIGHTNING_DANGER_RADIUS_KM) * 100))
    : 0;
  const satelliteBarPct = satelliteDist != null
    ? Math.max(0, Math.min(100, (1 - satelliteDist / SATELLITE_REFUEL_RADIUS_KM) * 100))
    : 0;

  const isDraining = fuelDeltaPerSec < -0.015;
  const isCharging = fuelDeltaPerSec > 0;

  return (
    <div
      ref={pulseRef}
      className="rounded-xl border p-3 flex flex-col gap-2"
      style={{
        background: flashColor
          ? flashColor
          : isCritical
          ? "rgba(239,68,68,0.08)"
          : nearSatellite
          ? "rgba(34,197,94,0.06)"
          : "rgba(255,255,255,0.03)",
        borderColor: isCritical
          ? "rgba(239,68,68,0.4)"
          : nearSatellite
          ? "rgba(34,197,94,0.3)"
          : "rgba(255,255,255,0.08)",
        transition: "background 0.5s, border-color 0.5s",
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Flame size={12} style={{ color }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>
            Fuel
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Fuel delta rate */}
          <span
            className="text-xs font-mono flex items-center gap-0.5"
            style={{ color: isCharging ? "#22c55e" : isDraining ? "#ef4444" : "#6b7280" }}
          >
            {isCharging ? <TrendingUp size={10} /> : isDraining ? <TrendingDown size={10} /> : null}
            {formatDelta(fuelDeltaPerSec)}
          </span>
          <span className="text-xs font-mono font-bold" style={{ color }}>
            {Math.round(pct)}%
          </span>
        </div>
      </div>

      {/* Fuel bar */}
      <div
        className="w-full h-2.5 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}99, ${color})`,
            boxShadow: `0 0 8px ${glow}`,
          }}
        />
      </div>

      {/* ── Proximity Distance Section ── */}
      <div className="flex flex-col gap-1.5 pt-1">
        <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>
          Proximity
        </span>

        {/* Lightning proximity */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Zap size={10} className={nearLightning ? "text-red-400 animate-pulse" : "text-yellow-500"} />
              <span className="text-xs" style={{ color: nearLightning ? "#f87171" : "rgba(255,255,255,0.5)" }}>
                Nearest Lightning
              </span>
            </div>
            <span className="text-xs font-mono" style={{ color: nearLightning ? "#f87171" : "rgba(255,255,255,0.5)" }}>
              {lightningDist != null ? `${lightningDist.toLocaleString()} km` : "—"}
            </span>
          </div>
          {/* Danger zone bar */}
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${lightningBarPct}%`,
                background: nearLightning
                  ? `linear-gradient(90deg, #ef444466, #ef4444)`
                  : "rgba(234,179,8,0.3)",
                boxShadow: nearLightning && lightningIntensity > 0.3
                  ? `0 0 6px rgba(239,68,68,${lightningIntensity * 0.8})`
                  : undefined,
              }}
            />
          </div>
          <div className="flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
            <span>Safe</span>
            <span>Danger ({LIGHTNING_DANGER_RADIUS_KM.toLocaleString()} km)</span>
          </div>
          {nearLightning && (
            <div
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md mt-0.5"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}
            >
              <Zap size={10} className="text-red-400 animate-pulse" />
              <span className="text-red-400 font-medium">
                FUEL DRAINING — {(lightningIntensity * 100).toFixed(0)}% intensity
              </span>
            </div>
          )}
        </div>

        {/* Satellite proximity */}
        <div className="flex flex-col gap-0.5 mt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Satellite size={10} className={nearSatellite ? "text-green-400" : "text-purple-400"} />
              <span className="text-xs" style={{ color: nearSatellite ? "#4ade80" : "rgba(255,255,255,0.5)" }}>
                Nearest Satellite
              </span>
            </div>
            <span className="text-xs font-mono" style={{ color: nearSatellite ? "#4ade80" : "rgba(255,255,255,0.5)" }}>
              {satelliteDist != null ? `${satelliteDist.toLocaleString()} km` : "—"}
            </span>
          </div>
          {/* Charge zone bar */}
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${satelliteBarPct}%`,
                background: nearSatellite
                  ? `linear-gradient(90deg, #22c55e66, #22c55e)`
                  : "rgba(139,92,246,0.3)",
                boxShadow: nearSatellite && satelliteIntensity > 0.3
                  ? `0 0 6px rgba(34,197,94,${satelliteIntensity * 0.8})`
                  : undefined,
              }}
            />
          </div>
          <div className="flex justify-between text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
            <span>Far</span>
            <span>Charge zone ({SATELLITE_REFUEL_RADIUS_KM.toLocaleString()} km)</span>
          </div>
          {nearSatellite && (
            <div
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md mt-0.5"
              style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}
            >
              <Satellite size={10} className="text-green-400" />
              <span className="text-green-400 font-medium">
                RECHARGING — {(satelliteIntensity * 100).toFixed(0)}% intensity
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Critical / low warning button */}
      {isLow && (
        <button
          onClick={onRefuelClick}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all hover:opacity-90 active:scale-95"
          style={{
            background: isCritical
              ? "linear-gradient(135deg, #ef4444, #dc2626)"
              : "linear-gradient(135deg, #f97316, #ea580c)",
            color: "white",
            boxShadow: isCritical
              ? "0 0 16px rgba(239,68,68,0.5)"
              : "0 0 12px rgba(249,115,22,0.4)",
            animation: isCritical ? "pulse 1s ease-in-out infinite" : undefined,
          }}
        >
          <AlertTriangle size={12} />
          {isCritical ? "CRITICAL — ANSWER TO REFUEL!" : "LOW FUEL — Click to Refuel"}
        </button>
      )}

      {/* Always-visible manual refuel button */}
      <button
        onClick={onRefuelClick}
        className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all hover:opacity-90 active:scale-95"
        style={{
          background: "rgba(139,92,246,0.12)",
          border: "1px solid rgba(139,92,246,0.35)",
          color: "#a78bfa",
        }}
        title="Open Refuel Challenge to earn extra fuel"
      >
        <FlaskConical size={11} />
        Refuel Challenge
      </button>
    </div>
  );
}
