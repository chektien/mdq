import fs from "fs";
import path from "path";

const clientSrc = path.resolve(__dirname, "..", "..", "..", "client", "src");
const read = (rel: string): string =>
  fs.readFileSync(path.join(clientSrc, rel), "utf-8");

describe("client light-theme contract", () => {
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

  describe("media caption contrast token", () => {
    const css = read("index.css");

    it("defines a dedicated media caption ink token", () => {
      expect(css).toMatch(/--mdq-media-caption-ink:\s*#/);
    });

    it("light theme overrides the caption ink token for the light slab", () => {
      expect(css).toMatch(
        /html\[data-theme="light"\]\s*\{[^}]*--mdq-media-caption-ink:/,
      );
    });

    it("thumbnail and video captions share one rule using the token", () => {
      expect(css).toMatch(
        /\.slide-media-figure figcaption,\s*\.slide-video-figure figcaption\s*\{[^}]*color:\s*var\(--mdq-media-caption-ink\)/,
      );
    });

    it("no longer paints the thumbnail caption with the low-contrast ink-soft token", () => {
      const start = css.indexOf(".slide-media-figure figcaption");
      const block = css.slice(start, css.indexOf("}", start));
      expect(block).not.toMatch(/--mdq-slide-ink-soft/);
    });

    it("expanded image caption uses the same token", () => {
      const start = css.indexOf(".image-expansion-caption");
      const block = css.slice(start, css.indexOf("}", start));
      expect(block).toMatch(/var\(--mdq-media-caption-ink\)/);
    });
  });

  describe("VideoCard media family + expansion close control", () => {
    const tsx = read("components/VideoCard.tsx");

    it("reuses the exact image-expansion close button and icon", () => {
      expect(tsx).toContain("image-expansion-close");
      expect(tsx).toContain("image-expansion-close-icon");
    });

    it("presents the caption with figcaption grammar inside a media figure", () => {
      expect(tsx).toContain("slide-video-figure");
      expect(tsx).toContain("<figcaption>");
    });

    it("drops the on-card fallback link and label badge", () => {
      expect(tsx).not.toContain("slide-video-card-fallback");
      expect(tsx).not.toContain("slide-video-card-badge");
    });

    it("no longer uses the bespoke text Close button", () => {
      expect(tsx).not.toContain("video-expansion-close");
    });

    it("closes on Escape and returns focus to the trigger", () => {
      expect(tsx).toContain('event.key === "Escape"');
      expect(tsx).toContain("triggerRef.current?.focus()");
    });
  });
});
