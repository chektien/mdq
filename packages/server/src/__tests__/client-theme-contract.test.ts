import fs from "fs";
import path from "path";

const clientSrc = path.resolve(__dirname, "..", "..", "..", "client", "src");
const read = (rel: string): string =>
  fs.readFileSync(path.join(clientSrc, rel), "utf-8");

describe("client light-theme contract", () => {
  describe("per-deck theme application", () => {
    const theme = read("theme.ts");
    const instructor = read("views/InstructorView.tsx");
    const student = read("views/StudentView.tsx");
    const presentation = read("views/PresentationView.tsx");
    const socket = read("hooks/useSocket.ts");

    it("normalizes and applies only supported themes", () => {
      expect(theme).toContain('theme === "light" || theme === "dark"');
      expect(theme).toContain("document.documentElement.dataset.theme = resolved");
    });

    it("applies deck themes to instructor, student, and projector views", () => {
      expect(instructor).toContain("sessionTheme ?? selectedDeck?.theme");
      expect(student).toContain("resolveClientTheme(data.theme, defaultTheme)");
      expect(presentation).toContain("applyClientTheme(meta?.theme, defaultTheme)");
    });

    it("retains the deck theme across student socket reconnection", () => {
      expect(socket).toContain("sessionTheme?: DeckTheme");
      expect(socket).toContain("sessionTheme: existing.sessionTheme");
    });
  });

  describe("theme.css end-session dialog", () => {
    const css = read("theme.css");

    it("defines light-theme overrides for the dialog semantic classes", () => {
      for (const cls of [
        ".end-session-card",
        ".end-session-stat",
        ".end-session-stat-value",
        ".end-session-keep",
        ".end-session-end",
      ]) {
        expect(css).toMatch(
          new RegExp(`html\\[data-theme="light"\\]\\s+${cls.replace(".", "\\.")}`),
        );
      }
    });

    it("does not reuse the dark dialog hex (#201d28) inside light overrides", () => {
      const lightBlock = css.slice(css.indexOf("End-session dialog (light theme)"));
      expect(lightBlock).not.toMatch(/#201d28/i);
    });
  });

  describe("InstructorView end-session dialog markup", () => {
    const tsx = read("views/InstructorView.tsx");

    it("carries the semantic class names", () => {
      for (const cls of [
        "end-session-overlay",
        "end-session-card",
        "end-session-eyebrow",
        "end-session-desc",
        "end-session-stat",
        "end-session-stat-value",
        "end-session-stat-label",
        "end-session-keep",
        "end-session-end",
      ]) {
        expect(tsx).toContain(cls);
      }
    });

    it("still carries the original dark Tailwind classes (dark stays identical)", () => {
      expect(tsx).toContain("bg-[#201d28]");
      expect(tsx).toContain("bg-[#07060b]/80");
    });
  });

  describe("index.css slide media canvas", () => {
    const css = read("index.css");

    it("has a light-theme .slide-media-figure override with a light background", () => {
      expect(css).toMatch(
        /html\[data-theme="light"\]\s+\.slide-media-figure\s*\{[^}]*background:\s*#fffdfa/,
      );
    });

    it("keeps the base dark .slide-media-figure rule (dark stays identical)", () => {
      expect(css).toMatch(/\.slide-media-figure\s*\{[^}]*background:\s*rgba\(31,\s*31,\s*30/);
    });
  });
});
