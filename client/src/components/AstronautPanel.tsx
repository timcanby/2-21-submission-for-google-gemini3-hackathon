import { useState, useRef, useEffect, useCallback } from "react";
import { X, MapPin, Navigation, Zap, Globe, ChevronRight, Map, Pause, Sparkles, RefreshCw, ExternalLink, Telescope } from "lucide-react";
import type { AstronautState } from "@/hooks/useAstronaut";
import { MapView } from "@/components/Map";
import { trpc } from "@/lib/trpc";

interface AstronautPanelProps {
  astronaut: AstronautState;
  onClose: () => void;
}

function formatCoord(val: number, posLabel: string, negLabel: string) {
  if (!isFinite(val)) return "--";
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const min = Math.floor((abs - deg) * 60);
  const sec = ((abs - deg - min / 60) * 3600).toFixed(1);
  const dir = val >= 0 ? posLabel : negLabel;
  return `${deg}° ${min}' ${sec}" ${dir}`;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,165,0,0.15)" }}>
      <div
        className="h-full rounded-full transition-all duration-100"
        style={{
          width: `${Math.min(100, value * 100)}%`,
          background: "linear-gradient(90deg, #FF8C00, #FFD700)",
          boxShadow: "0 0 6px rgba(255,165,0,0.6)",
        }}
      />
    </div>
  );
}

function TypingText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayed("");
    indexRef.current = 0;
    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1));
        indexRef.current++;
      } else {
        clearInterval(interval);
      }
    }, 18);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <span>
      {displayed}
      {displayed.length < text.length && (
        <span className="inline-block w-0.5 h-3.5 ml-0.5 animate-pulse" style={{ background: "#FFD700", verticalAlign: "middle" }} />
      )}
    </span>
  );
}

type Tab = "map" | "cosmic";

export default function AstronautPanel({ astronaut, onClose }: AstronautPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("map");
  const [mapType, setMapType] = useState<"satellite" | "roadmap">("satellite");
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  const lat = isFinite(astronaut.lat) ? astronaut.lat : 0;
  const lon = isFinite(astronaut.lon) ? astronaut.lon : 0;

  const distRemaining = Math.round(astronaut.totalDistance * (1 - astronaut.progress));
  const timeRemaining = Math.round((astronaut.travelDurationMs * (1 - astronaut.progress)) / 1000);

  // Gemini travel mood mutation
  const travelMood = trpc.astronaut.travelMood.useMutation();

  // Cosmic Window mutation
  const cosmicWindow = trpc.astronaut.cosmicWindow.useMutation();

  // Auto-generate mood when panel opens
  useEffect(() => {
    if (isFinite(lat) && isFinite(lon)) {
      travelMood.mutate({ lat, lon, destination: astronaut.destPlaceName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fetch cosmic window when tab is first opened
  useEffect(() => {
    if (activeTab === "cosmic" && !cosmicWindow.data && !cosmicWindow.isPending) {
      cosmicWindow.mutate();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // When map is ready, place a marker and set map type
  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    map.setMapTypeId(mapType);

    const markerEl = document.createElement("div");
    markerEl.style.cssText = `
      width: 28px; height: 28px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255,215,0,0.9) 0%, rgba(255,140,0,0.6) 100%);
      border: 2px solid #FFD700;
      box-shadow: 0 0 14px rgba(255,215,0,0.8);
      display: flex; align-items: center; justify-content: center;
      font-size: 14px;
    `;
    markerEl.textContent = "🧑‍🚀";

    markerRef.current = new window.google.maps.marker.AdvancedMarkerElement({
      map,
      position: { lat, lng: lon },
      content: markerEl,
      title: "Astronaut",
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mapRef.current) mapRef.current.setCenter({ lat, lng: lon });
    if (markerRef.current) markerRef.current.position = { lat, lng: lon };
  }, [lat, lon]);

  useEffect(() => {
    if (mapRef.current) mapRef.current.setMapTypeId(mapType);
  }, [mapType]);

  const handleRefreshMood = () => {
    travelMood.mutate({ lat, lon, destination: astronaut.destPlaceName });
  };

  const handleNewCosmicView = () => {
    cosmicWindow.mutate();
  };

  const TABS: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: "map", icon: <Map size={12} />, label: "Map View" },
    { key: "cosmic", icon: <Telescope size={12} />, label: "Cosmic Window" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(5,10,20,0.85)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-4xl rounded-xl border overflow-hidden"
        style={{
          background: "oklch(0.11 0.025 240)",
          borderColor: "rgba(255,165,0,0.35)",
          boxShadow: "0 0 40px rgba(255,140,0,0.2), 0 0 80px rgba(255,140,0,0.08)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0"
          style={{ borderColor: "rgba(255,165,0,0.2)", background: "rgba(255,140,0,0.06)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
              style={{
                background: "radial-gradient(circle, rgba(255,165,0,0.3) 0%, rgba(255,140,0,0.1) 100%)",
                border: "1.5px solid rgba(255,165,0,0.6)",
                boxShadow: "0 0 12px rgba(255,165,0,0.4)",
              }}
            >
              🧑‍🚀
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground tracking-wide">ASTRONAUT TRACKER</h2>
                <span
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(255,165,0,0.15)", color: "#FFD700", border: "1px solid rgba(255,165,0,0.3)" }}
                >
                  <Pause size={9} />
                  PAUSED
                </span>
              </div>
              <p className="text-xs font-mono" style={{ color: "rgba(255,165,0,0.7)" }}>
                Currently near: <span style={{ color: "#FFD700" }}>{astronaut.placeName}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-secondary">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Gemini Travel Mood Banner */}
        <div
          className="flex-shrink-0 px-5 py-3 border-b"
          style={{ borderColor: "rgba(255,165,0,0.15)", background: "rgba(255,140,0,0.04)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <div className="flex-shrink-0 mt-0.5">
                <Sparkles size={14} style={{ color: "#FFD700" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,165,0,0.8)" }}>
                    Travel Diary · Gemini AI
                  </span>
                  {travelMood.isPending && (
                    <span className="text-xs text-muted-foreground/50 animate-pulse">Generating...</span>
                  )}
                </div>
                <div className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {travelMood.isPending ? (
                    <span className="text-muted-foreground/50 italic text-xs">
                      ✨ The astronaut is writing their travel diary...
                    </span>
                  ) : travelMood.data?.mood ? (
                    <TypingText text={travelMood.data.mood} />
                  ) : travelMood.isError ? (
                    <span className="text-muted-foreground/50 italic text-xs">
                      Unable to generate travel mood. Check your Gemini API key.
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50 italic text-xs">
                      Click refresh to generate a travel mood message.
                    </span>
                  )}
                </div>
                {travelMood.data?.sources && travelMood.data.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {travelMood.data.sources.slice(0, 3).map((src, i) => (
                      <a
                        key={i}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-opacity hover:opacity-80"
                        style={{
                          background: "rgba(79,195,247,0.1)",
                          border: "1px solid rgba(79,195,247,0.25)",
                          color: "rgba(79,195,247,0.8)",
                        }}
                      >
                        <ExternalLink size={9} />
                        {src.title.length > 30 ? src.title.slice(0, 30) + "…" : src.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={handleRefreshMood}
              disabled={travelMood.isPending}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all disabled:opacity-40"
              style={{
                borderColor: "rgba(255,165,0,0.3)",
                background: "rgba(255,165,0,0.08)",
                color: "#FFD700",
              }}
            >
              <RefreshCw size={11} className={travelMood.isPending ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
          {/* Left: Info panel */}
          <div
            className="w-full md:w-60 flex-shrink-0 p-4 flex flex-col gap-4 border-b md:border-b-0 md:border-r overflow-y-auto"
            style={{ borderColor: "rgba(255,165,0,0.15)" }}
          >
            {/* Current Position */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <MapPin size={11} style={{ color: "#FFD700" }} />
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Current Position</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Latitude</span>
                  <span className="font-mono" style={{ color: "#FFD700" }}>{lat.toFixed(5)}°</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Longitude</span>
                  <span className="font-mono" style={{ color: "#FFD700" }}>{lon.toFixed(5)}°</span>
                </div>
                <div className="mt-1 text-xs font-mono text-muted-foreground/60">
                  {formatCoord(lat, "N", "S")}
                </div>
                <div className="text-xs font-mono text-muted-foreground/60">
                  {formatCoord(lon, "E", "W")}
                </div>
              </div>
            </div>

            {/* Journey */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Navigation size={11} style={{ color: "#FFD700" }} />
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Journey</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <ChevronRight size={10} style={{ color: "rgba(255,165,0,0.5)" }} />
                  <span className="text-muted-foreground">To:</span>
                  <span className="font-medium text-foreground truncate">{astronaut.destPlaceName}</span>
                </div>
                <ProgressBar value={astronaut.progress} />
                <div className="flex justify-between text-xs font-mono text-muted-foreground/70">
                  <span>{Math.round(astronaut.progress * 100)}% complete</span>
                  <span>{distRemaining.toLocaleString()} km</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Zap size={11} style={{ color: "#FFD700" }} />
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Stats</span>
              </div>
              <div className="space-y-1 text-xs">
                {[
                  { l: "Total Distance", v: `${Math.round(astronaut.totalDistance).toLocaleString()} km` },
                  { l: "Travel Speed", v: `${astronaut.speed.toLocaleString()} km/h` },
                  { l: "ETA (resume)", v: `${timeRemaining}s` },
                ].map(({ l, v }) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-muted-foreground">{l}</span>
                    <span className="font-mono text-foreground">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tab switcher — Map View / Cosmic Window */}
            <div className="mt-auto">
              <div className="flex items-center gap-1.5 mb-2">
                <Globe size={11} style={{ color: "#FFD700" }} />
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">View Mode</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {TABS.map(({ key, icon, label }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className="flex items-center gap-2 py-2 px-3 text-xs rounded-md border transition-all text-left"
                    style={{
                      borderColor: activeTab === key ? "rgba(255,165,0,0.6)" : "rgba(255,255,255,0.1)",
                      background: activeTab === key ? "rgba(255,165,0,0.15)" : "transparent",
                      color: activeTab === key ? "#FFD700" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>

              {/* Map type toggle — only shown in map tab */}
              {activeTab === "map" && (
                <div className="mt-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Map size={11} style={{ color: "#FFD700" }} />
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Map Type</span>
                  </div>
                  <div className="flex gap-2">
                    {([
                      { key: "satellite" as const, label: "🛰 Satellite" },
                      { key: "roadmap" as const, label: "🗺 Street" },
                    ]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setMapType(key)}
                        className="flex-1 py-1.5 text-xs rounded-md border transition-all"
                        style={{
                          borderColor: mapType === key ? "rgba(255,165,0,0.6)" : "rgba(255,255,255,0.1)",
                          background: mapType === key ? "rgba(255,165,0,0.15)" : "transparent",
                          color: mapType === key ? "#FFD700" : "rgba(255,255,255,0.4)",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Map or Cosmic Window */}
          <div className="flex-1 flex flex-col min-h-0">
            {activeTab === "map" ? (
              <>
                <div
                  className="flex items-center gap-2 px-4 py-2 border-b text-xs flex-shrink-0"
                  style={{ borderColor: "rgba(255,165,0,0.15)", background: "rgba(0,0,0,0.2)" }}
                >
                  <Globe size={10} style={{ color: "rgba(255,165,0,0.6)" }} />
                  <span className="font-mono text-muted-foreground/60">
                    {lat.toFixed(5)}, {lon.toFixed(5)} · {mapType === "satellite" ? "Satellite View" : "Street View"}
                  </span>
                </div>
                <div className="flex-1 relative" style={{ minHeight: "300px" }}>
                  <MapView
                    className="w-full h-full"
                    initialCenter={{ lat, lng: lon }}
                    initialZoom={10}
                    onMapReady={handleMapReady}
                  />
                </div>
              </>
            ) : (
              /* ── Cosmic Window ── */
              <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "#000" }}>
                {/* Toolbar */}
                <div
                  className="flex items-center justify-between px-4 py-2 border-b text-xs flex-shrink-0"
                  style={{ borderColor: "rgba(255,165,0,0.15)", background: "rgba(0,0,0,0.6)" }}
                >
                  <div className="flex items-center gap-2">
                    <Telescope size={11} style={{ color: "rgba(255,165,0,0.7)" }} />
                    <span className="font-mono text-muted-foreground/60">
                      ESA Hubble Space Telescope · Top 100 Images
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {cosmicWindow.data?.pageUrl && (
                      <a
                        href={cosmicWindow.data.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded border transition-opacity hover:opacity-80"
                        style={{
                          borderColor: "rgba(79,195,247,0.3)",
                          background: "rgba(79,195,247,0.08)",
                          color: "rgba(79,195,247,0.8)",
                        }}
                      >
                        <ExternalLink size={9} />
                        ESA Page
                      </a>
                    )}
                    <button
                      onClick={handleNewCosmicView}
                      disabled={cosmicWindow.isPending}
                      className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg border transition-all disabled:opacity-40"
                      style={{
                        borderColor: "rgba(255,165,0,0.3)",
                        background: "rgba(255,165,0,0.08)",
                        color: "#FFD700",
                      }}
                    >
                      <RefreshCw size={10} className={cosmicWindow.isPending ? "animate-spin" : ""} />
                      New View
                    </button>
                  </div>
                </div>

                {/* Image area */}
                <div className="flex-1 relative flex items-center justify-center" style={{ minHeight: "300px" }}>
                  {cosmicWindow.isPending && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                      style={{ background: "rgba(0,0,0,0.85)" }}>
                      <div
                        className="w-10 h-10 rounded-full border-2 animate-spin"
                        style={{ borderColor: "rgba(255,165,0,0.3)", borderTopColor: "#FFD700" }}
                      />
                      <span className="text-xs font-mono" style={{ color: "rgba(255,165,0,0.7)" }}>
                        Connecting to Hubble...
                      </span>
                    </div>
                  )}

                  {!cosmicWindow.isPending && !cosmicWindow.data && (
                    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                      <div className="text-4xl">🔭</div>
                      <div>
                        <p className="text-sm font-semibold text-foreground mb-1">Cosmic Window</p>
                        <p className="text-xs text-muted-foreground/60">
                          Look out the window and see the universe through Hubble's eyes.
                        </p>
                      </div>
                      <button
                        onClick={handleNewCosmicView}
                        className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border transition-all"
                        style={{
                          borderColor: "rgba(255,165,0,0.4)",
                          background: "rgba(255,165,0,0.1)",
                          color: "#FFD700",
                        }}
                      >
                        <Telescope size={14} />
                        Look Outside
                      </button>
                    </div>
                  )}

                  {!cosmicWindow.isPending && cosmicWindow.data && (
                    <div className="absolute inset-0 flex flex-col">
                      {/* Full image */}
                      <div className="flex-1 relative overflow-hidden">
                        <img
                          src={cosmicWindow.data.imageUrl}
                          alt={cosmicWindow.data.title}
                          className="w-full h-full object-cover"
                          style={{ display: "block" }}
                          onError={(e) => {
                            // Fallback if image fails to load
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                        {/* Gradient overlay at bottom */}
                        <div
                          className="absolute bottom-0 left-0 right-0 px-4 py-3"
                          style={{
                            background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)",
                          }}
                        >
                          <p className="text-sm font-semibold text-white leading-snug mb-1">
                            {cosmicWindow.data.title}
                          </p>
                          {cosmicWindow.data.description && (
                            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
                              {cosmicWindow.data.description.length > 180
                                ? cosmicWindow.data.description.slice(0, 180) + "…"
                                : cosmicWindow.data.description}
                            </p>
                          )}
                          <p className="text-xs mt-1.5" style={{ color: "rgba(255,165,0,0.6)" }}>
                            📡 ESA/Hubble Space Telescope
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {cosmicWindow.isError && (
                    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                      <div className="text-3xl">🌌</div>
                      <p className="text-xs text-muted-foreground/60">
                        Could not reach ESA Hubble. Check your connection.
                      </p>
                      <button
                        onClick={handleNewCosmicView}
                        className="text-xs px-3 py-1.5 rounded border"
                        style={{ borderColor: "rgba(255,165,0,0.3)", color: "#FFD700" }}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-2 border-t flex items-center justify-between text-xs font-mono text-muted-foreground/50 flex-shrink-0"
          style={{ borderColor: "rgba(255,165,0,0.15)" }}
        >
          <span>🧑‍🚀 Astronaut · Random World Explorer · Travel resumes on close</span>
          <span>Click outside to close</span>
        </div>
      </div>
    </div>
  );
}
