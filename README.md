# mdq

MCQs are passe. Enter MDQs. Human- and agent-friendly Markdown Quizzes.
No clunky interfaces. No database. No proprietary nonsense.
Just your own machine and a public secure tunnel (like Tailscale).

## Disclaimer

MDQ is provided as-is, and you use it at your own risk.

MDQ is an independent project and is not affiliated with, endorsed by, or sponsored by Tailscale or TinyURL.

## Open Source Repo Layout

- `packages/`: app code (safe to commit)
- `samples/quizzes/`: tracked sample smoke quiz markdown for onboarding
- `samples/images/`: tracked sample image assets copied into local runtime storage
- `data/`: local-only runtime and private instance data (gitignored)
  - `data/quizzes/`: your editable quiz source files
  - `data/images/`: quiz image attachments referenced from markdown
  - `data/sessions/`, `data/submissions/`, `data/winners/`, `data/access/`: generated runtime data
  - `data/access/current.json` may contain your active Tailscale or LAN access URL and should stay local
- `docs/DEV-*.md`: local development planning docs (gitignored by naming convention)

The `data/` folder is intentionally ignored so local state and access info do not get committed.

## Demo

![MDQ demo 1](docs/demo/mdq-demo-01.png)
![MDQ demo 2](docs/demo/mdq-demo-02.png)
![MDQ demo 3](docs/demo/mdq-demo-03.png)
![MDQ demo 4](docs/demo/mdq-demo-04.png)
![MDQ demo 5](docs/demo/mdq-demo-05.png)
![MDQ demo 6](docs/demo/mdq-demo-06.png)

## Why This Works

MDQ is optimized for a narrow classroom usage scenario:
- This project is intentionally built with tight operational integration around Tailscale (secure tunnel/Funnel) and TinyURL (short links in instructor flow).
- The core MDQ logic does not depend on those specific vendors, so you can adapt the same flow to other tunnel providers and URL shorteners if your environment prefers different services.
- short, synchronous quiz sessions
- one instructor-led live room
- simple leaderboard and answer distribution
- markdown files as the source of truth
- zero-friction quiz updates: edit markdown in `data/quizzes/`, click `Reload Quiz Files`, and run the next session
- agent-friendly quiz iteration without export/import overhead

Because sessions are short and operationally simple, you do not need a large multi-tenant cloud quiz stack with heavy admin workflows and feature bloat.

## Files

- `packages/`: app code (safe to commit)
- `samples/quizzes/`: tracked sample quiz markdown for onboarding
- `data/`: local-only runtime and private instance data (gitignored)
  - `data/quizzes/`: your editable quiz source files (you need to copy sample quizzes here on first setup)
  - `data/sessions/`, `data/submissions/`, `data/winners/`, `data/access/`: generated runtime data
  - `data/access/current.json` may contain your active Tailscale or LAN access URL and should stay local

The `data/` folder is intentionally ignored so local state and access info do not get committed. Again, you need to copy sample quizzes from `samples/quizzes/` to `data/quizzes/` on first setup, but after that you can edit quiz markdown directly in `data/quizzes/` and it becomes your source of truth for quiz content.

Server runtime note:

- MDQ writes runtime artifacts to the repository root `data/` directory by default.
- If you previously ran older builds, you may still have a local `packages/server/data/` folder from earlier path resolution.
- `packages/server/data/` is local runtime output, not source. It is safe to delete locally when the server is stopped.

## First-Time Setup

```bash
cd /path/to/mdq
npm install
npm run setup:local
```

This creates local `data/` directories, including `data/images/`, then copies the sample smoke quiz into `data/quizzes/week00.md` and the sample SVG attachment into `data/images/`.

Optional local runtime settings live in `data/config.json` (copy from `data/config.example.json`). The tracked example now includes `theme`, which defaults to `dark` and also accepts `light`.

## Tailscale Funnel Setup

mdq works best when the instructor machine is reachable through Tailscale Funnel.

If you are starting from scratch with your own personal Tailscale account, do this:

1. Go to `https://tailscale.com/` and create an account.
2. Install Tailscale on the computer that will run mdq.
3. Sign in to Tailscale on that computer.
4. Turn Tailscale on:

```bash
tailscale up
```

5. Check that Tailscale is working and note your `*.ts.net` device name:

```bash
tailscale status
```

6. Publish the mdq port with Funnel:

```bash
tailscale funnel 3000
```

7. Start mdq.
8. mdq auto-discovers the current Tailscale DNS name by calling `tailscale status --json` on startup, so a tailnet hostname change does not need a repo edit. The detected public base URL is cached locally in `data/access/current.json` and the instructor screen uses it to generate the join URL, TinyURL, and QR code.
9. Share the mdq join URL, TinyURL, or QR code with students.

Common gotchas:

- If `tailscale status` does not show your device, finish signing in first.
- If `tailscale funnel 3000` fails, Funnel is usually not enabled yet for your account or device in the Tailscale admin page.
- If mdq starts on a port other than `3000`, run Funnel on that actual port instead.
- If you rename the device or change the tailnet hostname, restart mdq so it refreshes `data/access/current.json` from the latest `tailscale status --json` output.
- When class ends, stop mdq and stop the Funnel exposure.

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

**For classroom security:** Assume students can see the final Tailscale host URL (TinyURL redirects reveal it, and MDQ QR codes target the full join URL directly). Treat join links as classroom-shareable, and protect instructor controls with a strong `INSTRUCTOR_PASSWORD` plus a non-obvious instructor route.

**Security model:** mdq serves one built client bundle to everyone (students and instructor). `VITE_INSTRUCTOR_ROUTE_SEGMENT` is build-time routing only. Real instructor access is gated by a server-side login cookie created after entering `INSTRUCTOR_PASSWORD`. The password is never bundled into client code.

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

**For classroom security:** Keep your Tailscale Funnel URL private. The security boundary is your private network (Tailscale) plus operational secrecy (don't share the instructor route with students).

While a quiz is running, the instructor screen also shows a `Next up` card with the next question's markdown heading. Use that as your cue in the lectorial slides before you tap `Next Question`.

### 3) student join flow (share this one)

- Share only the student join URL or QR code from the instructor screen.
- Student QR codes resolve to `/#/join/<SESSION_CODE>` and do not need instructor login.
- Student join flow does not depend on `VITE_INSTRUCTOR_ROUTE_SEGMENT`.

Port fallback retries default to 10 attempts (`PORT_FALLBACKS=10`).

For off-LAN access during class, expose your local server with Tailscale Funnel (or an equivalent secure tunnel):

```bash
tailscale funnel 3000
```

Then share the detected `https://<machine>.<tailnet>.ts.net` URL (or the short URL / QR shown in the instructor screen). mdq reads this from Tailscale automatically on startup.

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

### 4) presentation mode (read-only projector view)

- Open the session-scoped `Presentation view` link from the authenticated instructor screen when you want a second display that mirrors the instructor presentation without controls.
- The presentation route is intentionally not linked from the public home page. A code-based public entry point would let students discover the live projector feed and monitor the session outside the instructor flow.
- The presentation screen stays read-only. It never renders instructor action buttons or calls instructor REST actions.

## Quiz Markdown Format

Each question supports the existing `time_limit:` metadata plus optional `multi_select:` and `question_type:` flags. Question stems and option text can also include standard markdown images.

```markdown
---

## Example Topic: Selection Modes

time_limit: 45
multi_select: true

**Which items belong in the release checklist?**

A. Run verification
B. Delete git history
C. Write a short rollout note

> Correct Answers: A, C
> Overall Feedback: Verification plus a short note makes the release easier to trust and easier to hand off.
```

Rules:

- Omit `multi_select:` for backward compatibility. mdq will still treat `> Correct Answers: ...` as multi-select and `> Correct Answer: ...` as single-select.
- Use `multi_select: true` when you want students to be allowed to pick more than one option for that question.
- Use `question_type: poll` when you want a non-scored poll question. Poll questions must not include `> Correct Answer:` or `> Correct Answers:` lines.
- Poll questions still respect `multi_select:`. Omit it for a single-choice poll, or set `multi_select: true` for a multi-select poll.
- Do not combine `multi_select: false` with multiple correct answers.
- The instructor `Next up` preview uses the existing `## ...` question heading, including both sides of `Topic: Subtopic` when present.

Poll example:

```markdown
---

## Example Topic: Live Poll

question_type: poll
time_limit: 20

**How confident do you feel about today's topic right now?**

A. Very confident
B. Mostly confident
C. Still unsure
D. Completely lost

> Overall Feedback: Thanks, this helps pace the discussion.
```

Image attachments:

```markdown
## Example Topic: Image Prompt

time_limit: 35

![](../images/xr-setup.png)

**Which device is responsible for scene capture in this setup?**

A. The iPad
B. The headset strap
C. The HDMI adapter

> Correct Answer: A
> Overall Feedback: The iPad captures the source scan for reconstruction.
```

- Store image files in `data/images/`.
- Reference them from quiz markdown with `![](../images/<filename>)`.
- mdq rewrites that quiz-relative path to `/data/images/...` when rendering, so the same markdown works cleanly in the live frontend.

## iPad usage and troubleshooting (optional)

Most deployments can ignore this section. Use it only if you run instructor controls from iPad during class.

### iPad instructor flow (optional)

Security model: MDQ serves one built client bundle to everyone (students and instructor). `VITE_INSTRUCTOR_ROUTE_SEGMENT` is build-time routing only. Real instructor access is gated by a server-side login cookie created after entering `INSTRUCTOR_PASSWORD`.

1. Build the client with a non-default instructor route segment:
   ```bash
   export VITE_INSTRUCTOR_ROUTE_SEGMENT="instructor-9f2c7b1e4d8a6f3c"
   npm run build --workspace=@mdq/client
   ```
2. Open `https://<your-mdq-host>/#/<VITE_INSTRUCTOR_ROUTE_SEGMENT>` on iPad.
3. Log in with `INSTRUCTOR_PASSWORD`.

Tip: adding MDQ to iPad Home Screen hides browser chrome and can make projector presentation cleaner.

### iPad Home Screen recovery

If the Home Screen app gets into a bad state during class:

1. Force-close the Home Screen app and reopen it from the Home Screen icon.
2. If still stuck, open Safari and load the same instructor URL (`https://<host>/#/<instructor-route-segment>`), then log in again.
3. If Safari does not restore active instructor controls, return to the Home Screen app and retry there.

Current limitation:

- Instructor auto-resume depends on browser-session storage from the same app context.
- iPad Home Screen web app and normal Safari can behave like separate browser contexts.
- Switching from Home Screen app to Safari may not reliably resume an already running instructor session.

Verification status for `VITE_INSTRUCTOR_ROUTE_SEGMENT`:

- Covered by type/build checks and server integration tests in this repo.
- Smoke-tested by building with a non-default route segment and validating instructor login flow against that hash route.
- There is currently no dedicated client unit test that isolates hash-route parsing logic, so validate your exact route string before live class.

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

Image attachments are supported for quiz stems and option text through standard markdown syntax.

Embedded video is still out of scope for now. Keep video context in slides or a separate instructor-controlled window while mdq handles the prompt, options, explanations, and scoring.

## Security and Risk

The primary protection model is instructor authentication plus session scoping and careful link sharing. Tailscale Funnel still provides encrypted transport, but Funnel URLs are publicly reachable by anyone who has the link.

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

Related docs:

- `docs/classquiz-analysis.md`: ClassQuiz codebase summary and MDQ feature roadmap notes
- Commit code changes under `packages/`, `docs/`, `samples/`, scripts, and config files
- Keep personal/local files under `data/`
- Keep local planning notes in `docs/` using `DEV-*.md` names so they stay untracked
- Keep the local product requirements doc at `docs/DEV-PRD.md` (gitignored)
- Keep public docs in `docs/` with non-`DEV-` names (for example runbooks or published evidence)
- Do not commit `.env*` or logs

You can push to `main` without exposing local runtime artifacts if you keep private files in `data/`.

## Disclaimer

MDQ is provided as-is, and you use it at your own risk. This was developed for personal use and shared in the spirit of open source, but it is not a polished commercial product. It may have security vulnerabilities, bugs, or data loss risks if used in production or with sensitive data. Always review the code and test in a safe environment before using it for real classes.

MDQ is an independent project and is not affiliated with, endorsed by, or sponsored by Tailscale, TinyURL, or any other third-party services mentioned here.
