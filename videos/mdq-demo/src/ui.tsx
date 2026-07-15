import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { C, sans, mono } from "./theme";

export const EASE = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_OUT = Easing.out(Easing.cubic);

// ── animation helpers ───────────────────────────────────────────
export const fade = (frame: number, start: number, dur = 14, hold = 1) =>
  interpolate(frame, [start, start + dur], [0, hold], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

export const rise = (frame: number, start: number, dur = 18, dist = 28) =>
  interpolate(frame, [start, start + dur], [dist, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

export const useSpringIn = (delay = 0, damping = 200) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.7, stiffness: 120 } });
};

// ── background ──────────────────────────────────────────────────
export const Bg: React.FC<{ glow?: number }> = ({ glow = 1 }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 60;
  const drift2 = Math.cos(frame / 110) * 50;
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 620px at ${50 + drift / 18}% ${22 + drift2 / 30}%, rgba(179,102,255,${0.16 * glow}), transparent 60%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(760px 520px at ${78 - drift / 20}% ${88 + drift2 / 40}%, rgba(53,166,77,${0.08 * glow}), transparent 62%)`,
        }}
      />
      {/* fine dot texture */}
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          opacity: 0.5,
        }}
      />
      {/* vignette */}
      <AbsoluteFill
        style={{
          background: "radial-gradient(120% 120% at 50% 50%, transparent 58%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

// ── screenshot frames ───────────────────────────────────────────
export const ScreenFrame: React.FC<{
  src: string;
  label?: string;
  style?: React.CSSProperties;
  radius?: number;
}> = ({ src, label, style, radius = 16 }) => {
  return (
    <div style={{ position: "relative", ...style }}>
      <div
        style={{
          borderRadius: radius,
          overflow: "hidden",
          border: `1px solid ${C.line}`,
          boxShadow:
            "0 2px 0 rgba(255,255,255,0.04) inset, 0 40px 90px -30px rgba(0,0,0,0.85), 0 12px 30px -12px rgba(0,0,0,0.6)",
          background: C.paper,
        }}
      >
        <Img src={staticFile(`captures/${src}.png`)} style={{ display: "block", width: "100%" }} />
      </div>
      {label && (
        <div
          style={{
            position: "absolute",
            top: -13,
            left: 22,
            background: C.accent,
            color: "#1c0e2b",
            fontFamily: sans,
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: 1.4,
            padding: "5px 12px",
            borderRadius: 8,
            boxShadow: "0 8px 20px -8px rgba(179,102,255,0.8)",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};

export const PhoneFrame: React.FC<{ src: string; style?: React.CSSProperties }> = ({ src, style }) => {
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 46,
        background: "linear-gradient(160deg, #3a3a38, #1d1d1c)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 50px 90px -30px rgba(0,0,0,0.9), 0 16px 40px -16px rgba(0,0,0,0.7)",
        ...style,
      }}
    >
      <div style={{ borderRadius: 38, overflow: "hidden", background: C.bg }}>
        <Img src={staticFile(`captures/${src}.png`)} style={{ display: "block", width: "100%" }} />
      </div>
    </div>
  );
};

// ── typography pieces ───────────────────────────────────────────
export const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({
  children,
  color = C.accent,
  style,
}) => (
  <div
    style={{
      fontFamily: sans,
      fontWeight: 600,
      fontSize: 20,
      letterSpacing: 4,
      textTransform: "uppercase",
      color,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Caption: React.FC<{
  eyebrow?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  start?: number;
  style?: React.CSSProperties;
  align?: "left" | "center";
}> = ({ eyebrow, title, sub, start = 0, style, align = "left" }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        alignItems: align === "center" ? "center" : "flex-start",
        textAlign: align,
        ...style,
      }}
    >
      {eyebrow && (
        <div style={{ opacity: fade(frame, start), transform: `translateY(${rise(frame, start)}px)`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 30, height: 3, borderRadius: 2, background: C.accent }} />
          <Eyebrow>{eyebrow}</Eyebrow>
        </div>
      )}
      <div
        style={{
          fontFamily: sans,
          fontWeight: 700,
          fontSize: 64,
          lineHeight: 1.04,
          letterSpacing: -1.5,
          color: C.ink,
          opacity: fade(frame, start + 4),
          transform: `translateY(${rise(frame, start + 4, 20, 34)}px)`,
          maxWidth: 980,
        }}
      >
        {title}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: sans,
            fontWeight: 400,
            fontSize: 27,
            lineHeight: 1.4,
            color: C.muted,
            opacity: fade(frame, start + 12),
            transform: `translateY(${rise(frame, start + 12, 20, 24)}px)`,
            maxWidth: 760,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
};

export const Chip: React.FC<{ children: React.ReactNode; start?: number; tone?: "accent" | "green" | "gold"; style?: React.CSSProperties }> = ({
  children,
  start = 0,
  tone = "accent",
  style,
}) => {
  const frame = useCurrentFrame();
  const col = tone === "green" ? C.green : tone === "gold" ? C.gold : C.accent;
  const o = fade(frame, start, 12);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 11,
        padding: "11px 20px 11px 16px",
        borderRadius: 999,
        background: "rgba(38,38,37,0.82)",
        border: `1px solid ${C.line}`,
        backdropFilter: "blur(8px)",
        boxShadow: "0 18px 40px -22px rgba(0,0,0,0.9)",
        opacity: o,
        transform: `translateX(${interpolate(o, [0, 1], [-24, 0])}px)`,
        ...style,
      }}
    >
      <span style={{ width: 11, height: 11, borderRadius: 999, background: col, boxShadow: `0 0 14px ${col}` }} />
      <span style={{ fontFamily: sans, fontWeight: 600, fontSize: 23, color: C.ink, letterSpacing: -0.2 }}>{children}</span>
    </div>
  );
};

// Spotlight ring to draw attention to a region of a screenshot.
// x,y,w,h are fractions (0..1) of the parent box.
export const Spotlight: React.FC<{
  rect: [number, number, number, number];
  start: number;
  tone?: string;
  radius?: number;
}> = ({ rect, start, tone = C.accent, radius = 12 }) => {
  const frame = useCurrentFrame();
  const o = fade(frame, start, 12);
  const pulse = 0.5 + 0.5 * Math.sin((frame - start) / 9);
  const [x, y, w, h] = rect;
  return (
    <div
      style={{
        position: "absolute",
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
        border: `2.5px solid ${tone}`,
        borderRadius: radius,
        opacity: o,
        boxShadow: `0 0 ${10 + pulse * 22}px ${tone}, inset 0 0 ${pulse * 12}px rgba(179,102,255,0.25)`,
      }}
    />
  );
};

export const mfont = mono;
