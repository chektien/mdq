# mdq

Design and manage your quizzes in clean, editable Markdown. No more clunky interfaces and proprietary nonsense.

All you need is your computer and a free, secure private network like Tailscale.

## Open Source Repo Layout

- `packages/`: app code (safe to commit)
- `samples/quizzes/`: tracked sample quiz markdown for onboarding
- `data/`: local-only runtime and private instance data (gitignored)
  - `data/quizzes/`: your editable quiz source files
  - `data/sessions/`, `data/submissions/`, `data/winners/`, `data/access/`: generated runtime data
  - `data/access/current.json` may contain your active Tailscale or LAN access URL and should stay local

The `data/` folder is intentionally ignored so local state and access info do not get committed.

## First-Time Setup

```bash
cd ~/repos/mdq
npm install
npm run setup:local
```

This creates local `data/` directories and copies sample quizzes into `data/quizzes/`.

## Run

```bash
# optional but recommended for admin protection
export INSTRUCTOR_KEY="choose-a-strong-local-secret"

# if running the client in Vite dev mode, mirror it for browser requests
export VITE_INSTRUCTOR_KEY="$INSTRUCTOR_KEY"

npm run start --workspace=@mdq/server
```

Open `http://localhost:3000` and choose Instructor.

For off-LAN access during class, expose your local server with Tailscale Funnel (or an equivalent secure tunnel):

```bash
tailscale funnel 3000
```

Then share the generated `https://<machine>.ts.net` URL (or short URL / QR shown in the instructor screen).

Student QR behavior:

- QR codes resolve directly to `/#/join/<SESSION_CODE>`
- students land on the join page with the code pre-filled
- instructor controls require the optional `INSTRUCTOR_KEY` when configured

## Why This Works

mdq is optimized for a narrow classroom usage scenario:

- short, synchronous quiz sessions
- one instructor-led live room
- simple leaderboard and answer distribution
- markdown files as the source of truth

Because sessions are short and operationally simple, you do not need a large multi-tenant cloud quiz stack with heavy admin workflows and feature bloat.

## Architecture

```text
Instructor Browser                 Student Browsers
       |                                 |
       | REST (session control)          | Socket.IO (join/answer/reconnect)
       |                                 |
       +-------------+-------------------+
                     |
             Node.js + Express + Socket.IO (mdq server)
                     |
          +----------+-----------+
          |                      |
    Quiz source            Runtime output
  data/quizzes/*.md      data/sessions/*.json
                         data/submissions/*.json
                         data/winners/*.json
                         data/access/current.json (local only)
```

Design notes:

- markdown files are the single source of truth for quiz content
- live session state is in-memory for speed and simplicity
- completed session artifacts are persisted to local flat files
- access URL and QR generation are runtime concerns, not committed artifacts

## Media Scope

Images and embedded video in quiz content are a future enhancement.

For now, mdq assumes image or video context is shown by the instructor in slides during class, while the quiz app handles prompts, options, explanations, and scoring.

## Security and Risk

The primary security boundary is your private network tunnel (for example, Tailscale Funnel) plus ephemeral classroom sessions.

Worst-case scenarios and realistic impact:

- **Link sharing outside class**: Someone with the join URL could submit answers, mitigated by short-lived sessions, visible participant counts, and per-session closure. Likelihood low, impact low to medium.
- **Student impersonation (same room)**: A student could type another student ID. This affects fairness, not host compromise. Token-based reconnect protection prevents easy socket hijack after first join. Likelihood low, impact medium for grading integrity.
- **DoS on a session URL**: Spam joins/submits could disrupt one session, but does not expose host secrets by design. Likelihood low in typical classroom context, impact medium for that class period.
- **Accidental data exposure from git push**: If runtime files were tracked, URLs/session data could leak. This repo structure avoids that by keeping `data/` local-only and gitignored. Likelihood low when workflow is followed, impact medium if ignored.

What is intentionally out of scope for this deployment model:

- hard identity verification and anti-cheat guarantees
- internet-scale adversarial abuse resistance
- long-term PII storage and compliance-heavy workflows

## Safe Contribution Workflow

- Commit code changes under `packages/`, `docs/`, `samples/`, scripts, and config files
- Keep personal/local files under `data/`
- Do not commit `.env*` or logs

You can push to `main` without exposing local runtime artifacts if you keep private files in `data/`.
