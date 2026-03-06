# mdq

MCQs are passe. Enter MDQs. Human- and agent-friendly Markdown Quizzes.

No clunky interfaces. No database. No proprietary nonsense.

Just your own machine and a public secure tunnel (like Tailscale).

## Disclaimer

MDQ is provided as-is, and you use it at your own risk. This was developed for personal use and shared in the spirit of open source, but it is not a polished commercial product. It may have security vulnerabilities, bugs, or data loss risks if used in production or with sensitive data. Always review the code and test in a safe environment before using it for real classes.

MDQ is an independent project and is not affiliated with, endorsed by, or sponsored by Tailscale or TinyURL.

## Open Source Repo Layout

- `packages/`: app code (safe to commit)
- `samples/quizzes/`: tracked sample quiz markdown for onboarding
- `data/`: local-only runtime and private instance data (gitignored)
  - `data/quizzes/`: your editable quiz source files
  - `data/sessions/`, `data/submissions/`, `data/winners/`, `data/access/`: generated runtime data
  - `data/access/current.json` may contain your active Tailscale or LAN access URL and should stay local

The `data/` folder is intentionally ignored so local state and access info do not get committed.

Server runtime note:

- MDQ writes runtime artifacts to the repository root `data/` directory by default.
- If you previously ran older builds, you may still have a local `packages/server/data/` folder from earlier path resolution.
- `packages/server/data/` is local runtime output, not source. It is safe to delete locally when the server is stopped.

## Demo

![MDQ demo 1](docs/demo/mdq-demo-01.png)
![MDQ demo 2](docs/demo/mdq-demo-02.png)
![MDQ demo 3](docs/demo/mdq-demo-03.png)
![MDQ demo 4](docs/demo/mdq-demo-04.png)
![MDQ demo 5](docs/demo/mdq-demo-05.png)
![MDQ demo 6](docs/demo/mdq-demo-06.png)
![MDQ demo 7](docs/demo/mdq-demo-07.png)

## First-Time Setup

```bash
cd ~/repos/mdq
npm install
npm run setup:local
```

This creates local `data/` directories and copies sample quizzes into `data/quizzes/`.

## Run

### 1) Instructor setup (server machine)

```bash
# required if you want instructor-only controls
export INSTRUCTOR_PASSWORD="choose-a-strong-local-secret"

# optional: override instructor hash route (build-time)
# use a long cryptic segment for class use
export VITE_INSTRUCTOR_ROUTE_SEGMENT="instructor"

npm run build
npm run start --workspace=@mdq/server
```

Open `http://localhost:<server-port>/#/<instructor-route-segment>`.

Default server port is `3000`, with fallback retries enabled when that port is occupied.

If `VITE_INSTRUCTOR_ROUTE_SEGMENT` is unset, the default segment is `instructor` (backward compatible local dev behavior).

### 2) iPad instructor flow (private)

**Security model:** MDQ serves one built client bundle to everyone (students and instructor). `VITE_INSTRUCTOR_ROUTE_SEGMENT` is build-time routing only. Real instructor access is gated by a server-side login cookie created after entering `INSTRUCTOR_PASSWORD`. The password is never bundled into client code.

1. Build the client with route segment:
   ```bash
   export VITE_INSTRUCTOR_ROUTE_SEGMENT="instructor-9f2c7b1e4d8a6f3c"
   npm run build --workspace=@mdq/client
   ```

2. On your iPad, open:

   `https://<your-mdq-host>/#/<VITE_INSTRUCTOR_ROUTE_SEGMENT>`

   Example:

   `https://abc123.ts.net/#/instructor-9f2c7b1e4d8a6f3c`

3. Enter the instructor password on the login page. Login persists for the current browser session (refresh-safe) until the browser session ends.

4. **Important limitation:** The longer route is still obscurity, not authentication by itself. Keep using a strong `INSTRUCTOR_PASSWORD` and avoid sharing your instructor route.

Tip for classroom privacy and mobility: present from iPad, add MDQ to your iPad Home Screen, and launch it as a web app. This keeps browser chrome out of view, hides the full URL during projection, and lets you walk around while controlling the session.

### iPad Home Screen bad-state recovery

If the Home Screen app gets into a bad state during class:

1. Force-close the Home Screen app and reopen it from the Home Screen icon.
2. If it is still stuck, open normal Safari and load the same instructor URL (`https://<host>/#/<instructor-route-segment>`), then log in again.
3. If Safari does not restore the active instructor controls, return to the Home Screen app and retry there.

Current limitation:

- Instructor auto-resume depends on browser-session storage from the same app context.
- iPad Home Screen web app and normal Safari can behave like separate browser contexts.
- Because of that, switching from Home Screen app to Safari may not reliably resume an already running instructor session today.

**For classroom security:** Keep your Tailscale Funnel URL private. The security boundary is your private network (Tailscale) plus operational secrecy (don't share the instructor route with students).

### 3) student join flow (share this one)

- Share only the student join URL or QR code from the instructor screen.
- Student QR codes resolve to `/#/join/<SESSION_CODE>` and do not need instructor login.
- Student join flow does not depend on `VITE_INSTRUCTOR_ROUTE_SEGMENT`.

Port fallback retries default to 10 attempts (`PORT_FALLBACKS=10`).

For off-LAN access during class, expose your local server with Tailscale Funnel (or an equivalent secure tunnel):

```bash
tailscale funnel 3000
```

Then share the generated `https://<machine>.ts.net` URL (or short URL / QR shown in the instructor screen).

If students see `Session not found for that code`, verify your Tailscale Funnel is bound to the same port your active MDQ server process is using.

After each quiz session ends:

- Stop the MDQ server process (`Ctrl+C` in the terminal running `npm run start --workspace=@mdq/server`).
- Turn off your active Tailscale Funnel/node exposure for the quiz host before leaving class.

Why Tailscale works (plain language):

- Tailscale creates a secure, encrypted path between your class devices and your MDQ server.
- For normal Tailscale access, each device must be signed in and approved first.
- With Funnel, anyone who has the URL can reach that one published quiz page.
- When you run `tailscale funnel 3000`, you are publishing only the MDQ web app on that one port.
- This is not the same as opening your whole computer. It does not expose your files, terminal, or other apps unless you explicitly publish those too.
- If the link is shared outside class, outsiders could still reach the quiz page, so keep session links short-lived and private.

Student QR behavior:

- QR codes resolve directly to `/#/join/<SESSION_CODE>`
- Students land on the join page with the code pre-filled
- Instructor controls require a valid login session when `INSTRUCTOR_PASSWORD` is configured

## Why This Works

MDQ is optimized for a narrow classroom usage scenario:

- short, synchronous quiz sessions
- one instructor-led live room
- simple leaderboard and answer distribution
- markdown files as the source of truth
- zero-friction quiz updates: edit markdown in `data/quizzes/`, click `Reload Quiz Files`, and run the next session
- agent-friendly quiz iteration without export/import overhead

Because sessions are short and operationally simple, you do not need a large multi-tenant cloud quiz stack with heavy admin workflows and feature bloat.

## Architecture

```text
Instructor Browser                 Student Browsers
       |                                 |
       | REST (session control)          | Socket.IO (join/answer/reconnect)
       |                                 |
       +-------------+-------------------+
                     |
             Node.js + Express + Socket.IO (MDQ server)
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

For now, MDQ assumes image or video context is shown by the instructor in slides during class, while the quiz app handles prompts, options, explanations, and scoring.

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

## Security Considerations for MDQ

### Input Safety

Most quiz answering uses button-based selections, which limits payload shape. However, MDQ still accepts text input for fields like student ID and username, so normal input validation and output escaping remain important.

### Docker, Pros and Cons

Pros:

- Isolation: the app runs in a clean, consistent environment.
- Reproducibility: every run is identical, reducing surprises.

Cons:

- Slight complexity: you need to manage a Dockerfile and container setup.
- Overhead: minimal extra resource use, but not essential for a simple class deployment.

In summary, Docker offers structure, but may be overkill if you are running a simple Node.js quiz with controlled input. As long as you keep your app scoped, this is mostly sufficient but of course containerizing is always an option for extra isolation.

## Safe Contribution Workflow

- Commit code changes under `packages/`, `docs/`, `samples/`, scripts, and config files
- Keep personal/local files under `data/`
- Keep local planning notes in `docs/` using `DEV-*.md` names so they stay untracked
- Keep the local product requirements doc at `docs/DEV-PRD.md` (gitignored)
- Keep public docs in `docs/` with non-`DEV-` names (for example runbooks or published evidence)
- Do not commit `.env*` or logs

You can push to `main` without exposing local runtime artifacts if you keep private files in `data/`.
