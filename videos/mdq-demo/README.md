# MDQ demo video (Remotion)

A ~72s product-marketing demo of **MDQ v0.3.1-beta** — the markdown-driven
quiz / presentation app. Built with [Remotion](https://remotion.dev). Every app
visual is a **real screenshot** captured from a live local MDQ session driven by
Playwright; Remotion only adds motion, framing and callouts.

## What it shows
Markdown-first authoring → live slides with fold-out notes → scored questions,
polls and open responses → instructor / projector / phone surfaces → inline
images → reveal & leaderboard.

All content comes from the **public** sample deck `samples/decks/week00.md`.
No private class, session or submission data is used. Student names in the
capture are synthetic.

## Regenerate

1. Build + run MDQ on a non-conflicting port, serving only the public samples:

   ```bash
   # from repo root
   npm run build
   PORT=4810 MDQ_DECK_DIR="$PWD/samples/decks" \
     MDQ_AUTO_GENERATE_STUDENT_IDS=true MDQ_THEME=dark \
     MDQ_PUBLIC_URL=https://mdq.ch3k.com \
     node packages/server/dist/index.js
   ```

2. Capture the app screens (writes `public/captures/*.png`):

   ```bash
   node videos/mdq-demo/capture.mjs        # needs the server above on :4810
   ```

3. Preview / render (run inside this folder so `remotion.config.ts` applies):

   ```bash
   cd videos/mdq-demo
   npm run dev                              # Remotion Studio preview
   npx remotion render src/index.ts MdqDemo out/mdq-demo.mp4
   ```

The rendered MP4 lands in `out/` (git-ignored).

## Layout
- `src/Demo.tsx` — scene composition & timeline
- `src/ui.tsx` — reusable motion primitives (frames, captions, spotlights)
- `src/theme.ts` — MDQ brand tokens (mirrors `packages/client/src/theme.css`)
- `capture.mjs` — Playwright + socket.io capture pipeline
- `public/captures/` — captured app screenshots (video source assets)
