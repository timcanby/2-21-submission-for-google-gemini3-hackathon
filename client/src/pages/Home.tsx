import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import Globe, { type SatellitePoint, type LightningPoint } from "@/components/Globe";
import AstronautPanel from "@/components/AstronautPanel";
import FuelBar from "@/components/FuelBar";
import QuizModal from "@/components/QuizModal";
import { useAstronaut } from "@/hooks/useAstronaut";
import { useFuel } from "@/hooks/useFuel";
import { Satellite, Zap, RefreshCw, Activity, Globe as GlobeIcon, X } from "lucide-react";

interface DetailPanel {
  type: "satellite";
  data: SatellitePoint;
}

function StatCard({
  icon: Icon, label, value, color, active, onClick,
}: {
  icon: React.ElementType; label: string; value: number | string;
  color: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`data-card p-3 flex flex-col gap-1 transition-all duration-200 w-full text-left ${
        active ? "" : "opacity-50 hover:opacity-70"
      }`}
      style={{
        borderColor: active ? color : undefined,
        boxShadow: active ? `0 0 12px ${color}30` : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <Icon size={13} style={{ color }} />
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className="counter-value text-2xl font-bold" style={{ color }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </button>
  );
}

function EventFeedItem({
  icon: Icon, color, title, subtitle, time,
}: {
  icon: React.ElementType; color: string; title: string; subtitle: string; time: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-border/20 last:border-0">
      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${color}20` }}>
        <Icon size={10} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
      </div>
      <div className="text-xs text-muted-foreground flex-shrink-0 font-mono">{time}</div>
    </div>
  );
}

export default function Home() {
  const [showSatellites, setShowSatellites] = useState(true);
  const [showLightning, setShowLightning] = useState(true);
  const [showStarlink, setShowStarlink] = useState(false);
  const [rotationSpeed, setRotationSpeed] = useState(0.3); // default 0.3x (slower than original 1x)
  const [showAstronautPanel, setShowAstronautPanel] = useState(false);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [detail, setDetail] = useState<DetailPanel | null>(null);
  const astronaut = useAstronaut(showAstronautPanel);
  const [lightningStrikes, setLightningStrikes] = useState<LightningPoint[]>([]);
  const [lightningTotal, setLightningTotal] = useState(0);
  const [lightningLastMin, setLightningLastMin] = useState(0);
  const [sseStatus, setSseStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const quizOpenedRef = useRef(false);

  const { data: satelliteData, isLoading: satLoading, refetch: refetchSat } =
    trpc.satellites.tracked.useQuery(undefined, {
      refetchInterval: 30000,
      retry: 2,
      retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 6000),
    });

  const { data: lightningData } = trpc.lightning.recent.useQuery(undefined, { refetchInterval: 10000 });

  // Lightning SSE
  useEffect(() => {
    const es = new EventSource("/api/lightning/stream");
    es.onopen = () => setSseStatus("connected");
    es.onerror = () => setSseStatus("error");
    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "connected") { setSseStatus("connected"); }
        else if (msg.type === 'history') {
          const valid = (msg.strikes as LightningPoint[]).filter(
            (s) => s != null && typeof s.lat === 'number' && isFinite(s.lat) && typeof s.lon === 'number' && isFinite(s.lon)
          );
          setLightningStrikes((prev) => [...prev, ...valid].slice(-500));
        } else if (msg.lat !== undefined && typeof msg.lat === 'number' && isFinite(msg.lat) && typeof msg.lon === 'number' && isFinite(msg.lon)) {
          setLightningStrikes((prev) => [...prev, msg as LightningPoint].slice(-500));
          setLightningTotal((t) => t + 1);
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    if (lightningData) {
      setLightningLastMin(lightningData.lastMinute);
      if (lightningData.total > lightningTotal) setLightningTotal(lightningData.total);
    }
  }, [lightningData]);

  const satellites: SatellitePoint[] = (satelliteData?.satellites ?? [])
    .filter((s: { latitude: number | null; longitude: number | null; name: string }) =>
      s.latitude != null && s.longitude != null && isFinite(s.latitude) && isFinite(s.longitude) &&
      (showStarlink || !s.name?.toUpperCase().startsWith("STARLINK"))
    )
    .map((s: { id: number; name: string; latitude: number | null; longitude: number | null; altitude: number | null }) => ({
      id: s.id, name: s.name, latitude: s.latitude!, longitude: s.longitude!, altitude: s.altitude ?? 0,
    }));

  const starlinkCount = (satelliteData?.satellites ?? []).filter(
    (s: { name: string }) => s.name?.toUpperCase().startsWith("STARLINK")
  ).length;

  // Fuel system
  const astronautPos = isFinite(astronaut.lat) && isFinite(astronaut.lon)
    ? { lat: astronaut.lat, lon: astronaut.lon }
    : null;

  const { fuelState, refuelFromQuiz } = useFuel(
    astronautPos,
    lightningStrikes,
    satellites,
    showAstronautPanel // pause fuel drain when panel is open
  );

  // Auto-open quiz when fuel hits critical
  useEffect(() => {
    if (fuelState.isCritical && !showQuizModal && !quizOpenedRef.current) {
      quizOpenedRef.current = true;
      setShowQuizModal(true);
    }
    if (!fuelState.isCritical) {
      quizOpenedRef.current = false;
    }
  }, [fuelState.isCritical, showQuizModal]);

  const handleRefuel = (amount: number) => {
    refuelFromQuiz(amount);
    setShowQuizModal(false);
  };

  const validStrikes = lightningStrikes.filter(
    (s) => s != null && typeof s.lat === 'number' && isFinite(s.lat) && typeof s.lon === 'number' && isFinite(s.lon)
  );
  const recentLightning = validStrikes.slice(-100);
  const recentStrikes = validStrikes.slice(-5).reverse();
  // Show up to 20 satellites in Live Feed, sorted by altitude (lower = more interesting)
  const recentSats = satellites
    .slice()
    .sort((a, b) => (a.altitude ?? 0) - (b.altitude ?? 0))
    .slice(0, 20);

  const formatTime = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="h-screen w-screen overflow-hidden grid-bg flex flex-col" style={{ background: "oklch(0.09 0.02 240)" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 flex-shrink-0">
        <div className="flex items-center gap-3">
          <GlobeIcon size={20} className="text-primary" />
          <div>
            <h1 className="text-sm font-bold text-foreground tracking-wide">LEETCODE SPACE ODYSSEY</h1>
            <p className="text-xs text-muted-foreground font-mono">Fuel your journey — one problem at a time</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 text-xs">
            {[
              { label: "N2YO", ok: !satLoading },
              { label: "Blitzortung", ok: sseStatus === "connected" },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className={`status-dot ${ok ? "active" : "inactive"}`} />
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            <Activity size={10} className="inline mr-1" />
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <a
            href="https://raydekk.github.io/StarsAndPlanets/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))",
              border: "1px solid rgba(168,85,247,0.4)",
              color: "#c4b5fd",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background =
                "linear-gradient(135deg, rgba(99,102,241,0.35), rgba(168,85,247,0.35))";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background =
                "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))";
            }}
          >
            <span style={{ fontSize: 13 }}>✦</span>
            <span>Explore Universe</span>
          </a>
          <button onClick={() => refetchSat()} className="p-1.5 rounded hover:bg-secondary transition-colors" title="Refresh">
            <RefreshCw size={14} className="text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <aside className="w-52 flex-shrink-0 border-r border-border/40 flex flex-col gap-3 p-3 overflow-y-auto">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-medium">Live Counts</p>
            <div className="flex flex-col gap-2">
              <StatCard
                icon={Satellite}
                label="Satellites"
                value={satelliteData?.available ? satellites.length : "N/A"}
                color="#CE93D8"
                active={showSatellites}
                onClick={() => setShowSatellites((v) => !v)}
              />
              <StatCard
                icon={Zap}
                label="Lightning"
                value={lightningTotal}
                color="#FFF176"
                active={showLightning}
                onClick={() => setShowLightning((v) => !v)}
              />
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">Last 60s</p>
            <div className="data-card p-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap size={10} style={{ color: "#FFF176" }} />
                <span className="text-xs text-muted-foreground">Strikes</span>
              </div>
              <span className="counter-value text-sm font-bold" style={{ color: "#FFF176" }}>{lightningLastMin}</span>
            </div>
          </div>

          {/* Fuel Bar */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 font-medium">Astronaut Fuel</p>
            <FuelBar
              fuelState={fuelState}
              onRefuelClick={() => setShowQuizModal(true)}
            />
          </div>

          {!satelliteData?.available && (
            <div className="data-card p-2" style={{ borderColor: "rgba(255,241,118,0.2)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,241,118,0.8)" }}>N2YO API key not set. Satellite tracking disabled.</p>
            </div>
          )}

          <div className="mt-auto">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 font-medium">Legend</p>
            {[
              { color: "#CE93D8", label: "Satellites (N2YO)" },
              { color: "#FFF176", label: "Lightning (Blitzortung)" },
              { color: "#FFD700", label: "Astronaut Tracker" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 mb-1.5">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
            {/* All Satellites toggle */}
            <button
              onClick={() => setShowSatellites((v) => !v)}
              className={`mt-1 w-full flex items-center justify-between px-2 py-1 rounded text-xs transition-all ${
                showSatellites
                  ? "bg-purple-500/20 border border-purple-400/40 text-purple-300"
                  : "bg-secondary/40 border border-border/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    showSatellites ? "bg-purple-400" : "bg-muted-foreground/40"
                  }`}
                />
                All Satellites
              </span>
              <span className={`font-mono text-xs ${
                showSatellites ? "text-purple-300" : "text-muted-foreground/60"
              }`}>
                {showSatellites ? "ON" : "OFF"}
              </span>
            </button>
            {/* Starlink toggle */}
            <button
              onClick={() => setShowStarlink((v) => !v)}
              className={`mt-1.5 w-full flex items-center justify-between px-2 py-1 rounded text-xs transition-all ${
                showStarlink
                  ? "bg-purple-500/20 border border-purple-400/40 text-purple-300"
                  : "bg-secondary/40 border border-border/30 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    showStarlink ? "bg-purple-400" : "bg-muted-foreground/40"
                  }`}
                />
                Starlink ({starlinkCount.toLocaleString()})
              </span>
              <span className={`font-mono text-xs ${
                showStarlink ? "text-purple-300" : "text-muted-foreground/60"
              }`}>
                {showStarlink ? "ON" : "OFF"}
              </span>
            </button>
            {/* Rotation speed slider */}
            <div className="mt-2 pt-2 border-t border-border/20">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Globe Spin</p>
                <span className="text-xs font-mono text-muted-foreground/80">
                  {rotationSpeed === 0 ? "STOP" : `${rotationSpeed.toFixed(1)}x`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={3}
                step={0.1}
                value={rotationSpeed}
                onChange={(e) => setRotationSpeed(Number(e.target.value))}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #818cf8 0%, #818cf8 ${(rotationSpeed / 3) * 100}%, rgba(255,255,255,0.1) ${(rotationSpeed / 3) * 100}%, rgba(255,255,255,0.1) 100%)`,
                  accentColor: "#818cf8",
                }}
              />
              <div className="flex justify-between text-xs text-muted-foreground/50 mt-0.5">
                <span>Stop</span>
                <span>3x</span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-border/20">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 font-medium">Fuel Rules</p>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                  <span style={{ color: "#ef4444" }}>⚡</span>
                  <span>Near lightning → drains fuel</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                  <span style={{ color: "#22c55e" }}>🛰</span>
                  <span>Near satellite → refuels</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                  <span style={{ color: "#f97316" }}>🧠</span>
                  <span>Answer quiz to refuel</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Globe */}
        <main className="flex-1 relative overflow-hidden">
          <Globe
            satellites={satellites}
            lightning={recentLightning}
            astronaut={astronaut}
            showSatellites={showSatellites}
            showLightning={showLightning}
            onSatelliteClick={(s) => setDetail({ type: "satellite", data: s })}
            onAstronautClick={() => setShowAstronautPanel(true)}
            nearestLightningPos={fuelState.nearestLightningPos}
            nearestSatellitePos={fuelState.nearestSatellitePos}
            nearLightning={fuelState.nearLightning}
            nearSatellite={fuelState.nearSatellite}
            lightningIntensity={fuelState.lightningIntensity}
            satelliteIntensity={fuelState.satelliteIntensity}
            rotationSpeed={rotationSpeed}
          />
          {/* Astronaut badge */}
          <div
            className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-all hover:opacity-80"
            style={{ background: "rgba(255,165,0,0.12)", border: "1px solid rgba(255,165,0,0.3)", color: "#FFD700" }}
            onClick={() => setShowAstronautPanel(true)}
          >
            <span>🧑‍🚀</span>
            <span className="font-mono">
              {isFinite(astronaut.lat) ? astronaut.lat.toFixed(3) : "--"}°,{" "}
              {isFinite(astronaut.lon) ? astronaut.lon.toFixed(3) : "--"}°
            </span>
            <span className="text-muted-foreground">→ {astronaut.destPlaceName?.split(",")[0] ?? "..."}</span>
          </div>

          {/* Fuel indicator on globe */}
          <div
            className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs pointer-events-none"
            style={{
              background: fuelState.isCritical
                ? "rgba(239,68,68,0.15)"
                : fuelState.isLow
                ? "rgba(249,115,22,0.12)"
                : "rgba(34,197,94,0.08)",
              border: `1px solid ${fuelState.isCritical ? "rgba(239,68,68,0.4)" : fuelState.isLow ? "rgba(249,115,22,0.3)" : "rgba(34,197,94,0.2)"}`,
            }}
          >
            <span style={{ color: fuelState.isCritical ? "#ef4444" : fuelState.isLow ? "#f97316" : "#22c55e" }}>
              {fuelState.isCritical ? "🔴" : fuelState.isLow ? "🟡" : "🟢"}
            </span>
            <span
              className="font-mono font-bold"
              style={{ color: fuelState.isCritical ? "#ef4444" : fuelState.isLow ? "#f97316" : "#22c55e" }}
            >
              {Math.round(fuelState.fuel)}%
            </span>
            {fuelState.nearLightning && (
              <span className="text-red-400 animate-pulse">⚡ DRAIN</span>
            )}
            {fuelState.nearSatellite && (
              <span className="text-green-400">🛰 CHARGE</span>
            )}
          </div>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-muted-foreground/40 font-mono pointer-events-none">
            Drag to rotate · Click to inspect
          </div>
        </main>

        {/* Right Panel */}
        <aside className="w-60 flex-shrink-0 border-l border-border/40 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-medium">Live Feed</p>
            {showLightning && recentStrikes.map((s) => (
              <EventFeedItem
                key={s.id}
                icon={Zap}
                color="#FFF176"
                title="Lightning Strike"
                subtitle={`${(s.lat ?? 0).toFixed(2)}°, ${(s.lon ?? 0).toFixed(2)}°`}
                time={formatTime(s.time)}
              />
            ))}
            {showSatellites && recentSats.map((s) => (
              <EventFeedItem
                key={s.id}
                icon={Satellite}
                color="#CE93D8"
                title={s.name}
                subtitle={`${(s.latitude ?? 0).toFixed(1)}°, ${(s.longitude ?? 0).toFixed(1)}°`}
                time={`${Math.round(s.altitude ?? 0)}km`}
              />
            ))}
          </div>

          {detail?.type === "satellite" && (
            <div className="border-t border-border/40 p-3 bg-card/50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Satellite Detail</p>
                <button onClick={() => setDetail(null)} className="p-0.5 hover:bg-secondary rounded transition-colors">
                  <X size={12} className="text-muted-foreground" />
                </button>
              </div>
              {(() => {
                const s = detail.data as SatellitePoint;
                return (
                  <div className="space-y-1 text-xs">
                    {[
                      { l: "Name", v: s.name, c: "font-mono text-accent truncate max-w-28" },
                      { l: "NORAD ID", v: String(s.id), c: "font-mono text-foreground" },
                      { l: "Altitude", v: `${Math.round(s.altitude ?? 0)} km`, c: "font-mono text-foreground" },
                      { l: "Position", v: `${(s.latitude ?? 0).toFixed(2)}°, ${(s.longitude ?? 0).toFixed(2)}°`, c: "font-mono text-foreground" },
                    ].map(({ l, v, c }) => (
                      <div key={l} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{l}</span>
                        <span className={c}>{v}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          <div className="border-t border-border/40 p-2 flex items-center justify-between text-xs font-mono">
            <span className="text-muted-foreground">{satellites.length} satellites</span>
            <span className="text-muted-foreground">{lightningTotal.toLocaleString()} strikes total</span>
          </div>
        </aside>
      </div>

      {/* Astronaut Panel */}
      {showAstronautPanel && (
        <AstronautPanel
          astronaut={astronaut}
          onClose={() => setShowAstronautPanel(false)}
        />
      )}

      {/* Quiz Modal */}
      {showQuizModal && (
        <QuizModal
          onClose={() => setShowQuizModal(false)}
          onRefuel={handleRefuel}
          currentFuel={fuelState.fuel}
        />
      )}
    </div>
  );
}
