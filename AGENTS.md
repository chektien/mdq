# AGENTS.md - MDQ

## Project
- MDQ is the markdown-driven quiz/presentation app.
- This is a public-facing repository. Do not commit real quiz data, private class data, session exports, submissions, access logs, or other teaching-instance data.
- The only quiz/deck content that may be committed is intentional smoke/sample content meant for public distribution, such as files under `samples/decks/` or minimal non-real fixtures used by automated tests.
- Keep private/runtime quiz data under ignored local data paths. If real quiz data is accidentally committed, stop and remove it from history before continuing normal development.
- Keep agent-generated planning, handoff, scratch, and review markdown out of the public repository unless Chek explicitly asks to publish a specific document.

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
