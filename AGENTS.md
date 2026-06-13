# AGENTS.md - MDQ

## Project
- MDQ is the markdown-driven quiz/presentation app.
- Keep real quiz data out of the public repo. Do not commit private class quiz content under `data/quizzes` or elsewhere; only intentional samples such as `samples/quizzes/week00.md` belong in git.

## Local Runtime
- The local MDQ server commonly runs on port `2081`.
- `mdq.ch3k.com` is the preferred student-facing/public URL when configured.
- A Cloudflare tunnel or Worker route may proxy to the local MDQ server. Prefer repairing that route before touching Tailscale Serve/Funnel.

## Tailscale Routing Warning
- Do **not** run `tailscale funnel 2081` or repoint bare `chq.singapura-broadnose.ts.net:443` for MDQ unless Chek explicitly asks for that exact routing.
- Bare `wss://chq.singapura-broadnose.ts.net` is used by Vimicate/OpenClaw Gateway and should normally proxy to `127.0.0.1:18789`.
- Repointing bare `chq` to MDQ `2081` breaks Vimicate/OpenClaw WebSocket clients.
- If MDQ needs temporary Tailscale exposure, prefer a non-conflicting port or path and verify it will not overwrite the bare `chq` 443 route. Check `tailscale serve status --json` before and after any Tailscale Serve/Funnel change.

## Verification
- For MDQ changes, run the repo's existing typecheck/build/test commands when practical.
- For routing changes, verify both local MDQ health and the intended public URL. If the task touches Tailscale, also verify `wss://chq.singapura-broadnose.ts.net` still opens to OpenClaw Gateway afterward.
