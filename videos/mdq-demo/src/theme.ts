// MDQ brand tokens — mirrored from packages/client/src/theme.css (dark "paper" theme)
import { loadFont as loadSans } from "@remotion/google-fonts/IBMPlexSans";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";

export const sans = loadSans("normal", { weights: ["400", "500", "600", "700"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "500"] }).fontFamily;

export const C = {
  bg: "#191918",
  paper: "#262625",
  panel: "#2d2d2b",
  line: "rgba(236, 232, 240, 0.10)",
  ink: "#ece8f0",
  muted: "#c6beca",
  soft: "#9a909e",
  accent: "#b366ff",
  accentHi: "#ca8cff",
  accentInk: "#ead8ff",
  green: "#35a64d",
  greenInk: "#bdf5c6",
  gold: "#e6c252",
  danger: "#b83d69",
};

export const FPS = 30;
