import { useEffect, useState } from "react";

const GIF_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/92410230/IxBRPlkrBZpqMMlT.gif";

interface WelcomeScreenProps {
  onEnter: () => void;
}

export default function WelcomeScreen({ onEnter }: WelcomeScreenProps) {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  const handleEnter = () => {
    setFadeOut(true);
    setTimeout(() => {
      setVisible(false);
      onEnter();
    }, 800);
  };

  // Allow pressing Enter key to proceed
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") handleEnter();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
      style={{
        transition: "opacity 0.8s ease",
        opacity: fadeOut ? 0 : 1,
      }}
    >
      {/* GIF background */}
      <img
        src={GIF_URL}
        alt="Universe background"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: "brightness(0.55)" }}
      />

      {/* Dark overlay gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.85) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
        {/* Title */}
          <div className="flex flex-col items-center gap-2">
          <div
            className="text-xs font-mono tracking-[0.3em] uppercase mb-1"
            style={{ color: "rgba(129,140,248,0.9)" }}
          >
            Fuel your journey — one problem at a time
          </div>
          <h1
            className="text-4xl md:text-6xl font-bold tracking-tight"
            style={{
              color: "#fff",
              textShadow: "0 0 40px rgba(129,140,248,0.6), 0 2px 8px rgba(0,0,0,0.8)",
              letterSpacing: "-0.02em",
            }}
          >
            LEETCODE
          </h1>
          <h1
            className="text-4xl md:text-6xl font-bold tracking-tight"
            style={{
              background: "linear-gradient(135deg, #818cf8, #c084fc, #38bdf8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textShadow: "none",
              letterSpacing: "-0.02em",
            }}
          >
            SPACE ODYSSEY
          </h1>
        </div>

        {/* Subtitle */}
        <p
          className="text-sm md:text-base max-w-md leading-relaxed"
          style={{ color: "rgba(255,255,255,0.65)" }}
        >
          Travel the cosmos with your astronaut. Dodge lightning storms, dock with satellites — and when fuel runs low, crack open a LeetCode problem to blast off again.
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-6 text-xs font-mono" style={{ color: "rgba(255,255,255,0.45)" }}>
          <span>2,500+ Satellites</span>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
          <span>Real Lightning Data</span>
          <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
          <span>LeetCode Refuel</span>
        </div>

        {/* Enter button */}
        <button
          onClick={handleEnter}
          className="group relative mt-2 px-10 py-3.5 rounded-full text-sm font-semibold tracking-wide transition-all duration-300"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.9), rgba(168,85,247,0.9))",
            border: "1px solid rgba(168,85,247,0.5)",
            color: "#fff",
            boxShadow: "0 0 30px rgba(129,140,248,0.4), 0 4px 20px rgba(0,0,0,0.4)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 0 50px rgba(129,140,248,0.7), 0 4px 20px rgba(0,0,0,0.4)";
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.04)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 0 30px rgba(129,140,248,0.4), 0 4px 20px rgba(0,0,0,0.4)";
            (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
          }}
        >
          <span className="flex items-center gap-2">
            <span style={{ fontSize: 16 }}>✦</span>
            Start Journey
          </span>
        </button>

        <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          Press <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>Enter</kbd> to continue
        </p>
      </div>

      {/* Bottom data strip */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-8 px-6 py-3 text-xs font-mono"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)",
          color: "rgba(255,255,255,0.3)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <span>N2YO Satellite API</span>
        <span>Blitzortung Lightning Network</span>
        <span>ISS Real-Time Tracking</span>
      </div>
    </div>
  );
}
