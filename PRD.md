# md-quiz: Product Requirements Document

## 1. Executive Summary

md-quiz is a lightweight, self-hosted quiz platform for in-class use. Instructors author quiz questions in markdown files (one per week), and the platform renders them as live, interactive quizzes that students join via QR code or short URL. The system provides a projector-friendly instructor view with real-time answer distributions, a results review screen with correct answers and explanations, and a weekly leaderboard for tracking top performers. The platform is designed to replace Slido for weekly in-class quizzes with a simpler, more controllable workflow that uses markdown files as the single source of truth.

## 2. Problem Statement

The current workflow uses Slido for in-class quizzes. While Slido works, it introduces friction in several ways:

- **Manual question entry**: Quiz questions must be manually created in Slido's web interface, even when they already exist in structured markdown files. This is time-consuming and error-prone.
- **Limited format control**: Slido does not natively support code blocks, syntax highlighting, or rich markdown formatting, all of which are essential for a programming-heavy module like Developing Immersive Applications (DIA).
- **No persistent leaderboard**: Slido does not provide a cumulative leaderboard across sessions. The instructor must manually track weekly winners for bonus marks.
- **Subscription cost and feature bloat**: Slido includes many features (word clouds, open-ended polls, Q&A) that are unnecessary for the core use case of multiple-choice quizzes. The free tier has participant limits.
- **No version control**: Quiz content lives in Slido's proprietary system rather than in a git-tracked repository, making it harder to review, iterate, and reuse across semesters.

md-quiz solves these problems by using markdown files as the canonical quiz source, eliminating manual data entry, and providing exactly the features needed for in-class quizzes with no extras.

## 3. Goals and Non-Goals

### Goals

- **G1**: Auto-parse quiz questions from markdown files (week01-quiz.md, week02-quiz.md, etc.) without manual data entry.
- **G2**: Host live in-class quizzes where students join via QR code or short URL and answer questions in real time.
- **G3**: Display a projector view for the instructor showing the current question, a live answer distribution chart, and a timer.
- **G4**: Show a results view after each question (or after the full quiz) with correct answers and explanations.
- **G5**: Maintain a cumulative leaderboard across weeks. The instructor records weekly winners for bonus marks.
- **G6**: Support code blocks and basic markdown formatting in quiz questions and answer choices.
- **G7**: Work for classes of up to 200-250 concurrent students with 1-2 quizzes per week.

### Non-Goals

- Real-time collaborative editing of quiz files.
- Student accounts, login, or persistent user profiles. Students provide a student ID when joining; no passwords or OAuth.
- Open-ended text responses, word clouds, or poll types beyond multiple-choice and multi-select.
- Grading integration with LMS (D2L/xSITe). The leaderboard is the output; grade entry is manual.
- Mobile app distribution. The student interface is a responsive web page only.
- Analytics dashboards, CSV exports, or detailed per-student response logs (P2 at most).

## 4. User Stories

### Instructor

1. **As an instructor**, I want to write quiz questions in a markdown file using a format I already know (from d2l-quiz), so I can reuse and version-control my questions without manual data entry.
2. **As an instructor**, I want to select a week's quiz and start a live session, so students can join from their devices without any setup on their end.
3. **As an instructor**, I want to display a QR code and short URL on the projector, so students can join quickly without typing a long URL.
4. **As an instructor**, I want to see a real-time bar chart of answer distribution and a live "X / Y answered" count on the projector, so I know when most students have submitted and can decide when to close the question.
5. **As an instructor**, I want to reveal the correct answer and explanation after closing a question, so I can discuss it with the class while the context is fresh.
6. **As an instructor**, I want to advance through questions one at a time at my own pace, so I can control the flow of the quiz based on class discussion.
7. **As an instructor**, I want to see a leaderboard at the end of the quiz showing who answered correctly and fastest, so I can recognize top performers.
8. **As an instructor**, I want a cumulative leaderboard (just based on students' positioning and not scores) across all weeks, so I can track weekly winners for bonus marks without manual record-keeping.

### Student

1. **As a student**, I want to scan a QR code or type a short URL to join the quiz on my phone, so I can participate without installing anything.
2. **As a student**, I want to enter my student ID as the main way to identify myself, so my answers are tracked consistently even if I disconnect and reconnect.
3. **As a student**, I want to optionally enter a display name that shows on the leaderboard alongside my student ID, so I can be recognized by name if I choose.
4. **As a student**, I want to see the question, real-time countdown time limit, and answer choices on my phone and tap to submit my answer, so I can participate in real time.
5. **As a student**, I want to see whether my answer was correct after the instructor reveals the answer, so I can learn from mistakes immediately.
6. **As a student**, I want to see my rank on the leaderboard at the end of the quiz, so I know how I performed relative to others.

## 5. Feature Requirements

### P1 (Must Have)

| Feature | Description |
|---------|-------------|
| Markdown parser | Parse week01-quiz.md through weekNN-quiz.md files into structured quiz data. Support the d2l-quiz markdown format (see Section 8). |
| Session management | Instructor can create a live quiz session from a selected week's quiz file. Generate a unique session code. |
| Student join flow | Students scan QR code or enter short URL, provide a student ID (and optionally a display name), and join the session. No login required. |
| Question display | Render questions with markdown support (bold, inline code, code blocks with syntax highlighting, images). |
| Live answer submission | Students submit answers from their devices. Server tracks submissions per question. |
| Answer distribution | Projector view shows a real-time bar chart of how many students picked each option. |
| Instructor controls | Start quiz, advance to next question, close submissions for current question, reveal answer. |
| Results reveal | After closing a question, show the correct answer highlighted and display the explanation (Overall Feedback). |
| Session leaderboard | At end of quiz, rank students by number of correct answers (tiebreak by cumulative response time, computed server-side). |
| Cumulative leaderboard | Persist weekly scores in a flat JSON file. The cumulative leaderboard is computed dynamically at runtime from per-week results; cumulative totals are not precomputed or stored. |
| QR code generation | Generate and display a QR code for the session URL on the projector view. |
| Auto-generated QR and access URL | On server startup, the backend calls `tailscale status --json` to read `Self.DNSName` (e.g., `my-laptop.tailnet-name.ts.net`) and constructs the public URL `https://<DNSName>`. It then calls the TinyURL free API (`https://tinyurl.com/api-create.php?url=<url>`, no API key needed) to produce a short URL (e.g., `https://tinyurl.com/abc123`). A QR code is generated server-side using the `qrcode` npm package and served as a PNG or SVG endpoint. The instructor's "Session Start" screen (before launching the quiz) prominently displays: (a) the full Tailscale Funnel URL, (b) the short URL, and (c) a large QR code that students can scan. The QR code and short URL remain visible on the instructor view during the quiz (in a corner or toggle panel) so latecomers can join. If the `tailscale` CLI is not available or Funnel is not active, the server falls back to displaying the local LAN IP with a warning that students on isolated campus WiFi may not be able to connect. |
| Submission count display | Projector view must display submission count in format "X / Y answered" during active questions. |
| Per-question time limit | Each question has a `time_limit` field (in seconds, default 20 if omitted in the markdown file). The server enforces the time limit by closing the submission window after the specified duration, even if the client is slow to reflect the countdown. The projector view displays a visible countdown timer. |

### P2 (Nice to Have)

| Feature | Description |
|---------|-------------|
| Multi-select questions | Support questions with multiple correct answers (matching the d2l-quiz "Correct Answers: A, B, C" format). |
| Short answer questions | Support free-text short answer questions with exact-match grading. |
| Question images | Render images referenced in markdown (e.g., `![alt](url)`). |
| Export results | Export session results as CSV or JSON for the instructor's records. |
| Sound effects | Optional audio cues for question open/close and leaderboard reveal. |
| Reconnection | Students who lose connection can rejoin the same session using their stored `sessionToken`. The server restores their state (current question, score, answered status). See Section 5a for details. |

## 5a. Identity and Anti-Cheat Model

To prevent duplicate counting, ensure continuity of experience for students who disconnect and reconnect, and maintain submission integrity, the system enforces the following identity and anti-cheat rules.

### Student Identity

- Students must provide a `studentId` (mandatory) when joining a session. A `displayName` is optional.
- On join, the server generates a `sessionToken` (UUID) for the participant. This token is stored in the student's browser via `localStorage` to support reconnection.
- Each `studentId` is locked to exactly one `sessionToken` per session. If a join attempt uses an existing `studentId` with a different token, the server either rejects the new connection or disconnects the previous socket (policy configurable by the instructor).

### Roster Validation and Impersonation Prevention

The system supports two modes for student identity validation at join time, configurable per session by the instructor.

**Strict mode (roster file present):** If the instructor uploads a roster file (e.g., `roster.csv` containing a column of valid student IDs), the server validates each submitted `studentId` against the roster on join. If the ID is not found, the server rejects the join with a clear error message: "Student ID not found, please check your ID." The student can retry immediately with a corrected ID. This prevents both accidental typos and intentional impersonation of IDs that do not exist in the class.

**Open mode (no roster file):** If no roster is uploaded, the system falls back to a "claim any ID" model where any `studentId` is accepted. This is useful for ad hoc sessions, guest lectures, or situations where the instructor does not have a roster on hand. The instructor selects strict or open mode in the session configuration.

**Impersonation mitigation in an in-class setting:** Since md-quiz is designed for in-person, in-class use, the following measures reduce impersonation risk without requiring authentication infrastructure:

1. **Session token binding**: Each `studentId` is bound to a `sessionToken` stored in the student's browser (see Student Identity above). A second device attempting to join with the same `studentId` would need a new token, triggering a conflict (rejected or previous connection dropped, per instructor policy).
2. **Per-device submission count**: The instructor dashboard shows submission counts per connected device, allowing the instructor to spot a single device submitting under multiple IDs.
3. **Live participant list**: The projector view displays the list of active participants. The instructor can visually scan for duplicate or suspicious IDs during the lobby phase before starting questions.

**Wrong ID handling:** Students receive immediate feedback at join time if their ID is rejected (strict mode). They can correct and retry before the session moves past the lobby. Once a question is open, no new joins are processed until the next lobby or inter-question pause.

### Submission Integrity

- Only the first submission per question per student is recorded. Submissions cannot be overwritten or changed after submission.
- Late joiners cannot answer questions that have already been closed. The server only accepts submissions during the `QUESTION_OPEN` state (see Section 6, Session State Machine).
- Response timing is computed server-side only. The server records `questionStartTime` when a question opens and computes `responseTime = serverNow - questionStartTime` when a submission arrives. Client-provided timestamps are ignored.

## 6. Technical Architecture

### Constraints and Design Decisions

**GitHub Pages constraint**: GitHub Pages serves static files only. It cannot run a backend server, handle WebSocket connections, or store session state. Therefore, the "served through GitHub Pages" requirement applies to the frontend assets and the markdown quiz files, not to the entire application.

**Architecture**: The system has two components:

1. **Static frontend** (hosted on GitHub Pages): React + Tailwind CSS single-page application. This includes the student view, instructor view, and all UI components. The markdown quiz files (week01-quiz.md, etc.) are also committed to the same repo and served as static assets.

2. **Lightweight backend** (runs locally on instructor's machine, exposed via Tailscale Funnel): A Node.js server that handles session state, WebSocket connections for real-time updates, and quiz data serving. Tailscale Funnel provides a public HTTPS endpoint so students can reach the backend from any network without installing anything (see Section 9).

### Why not a fully static (serverless) approach?

A fully static architecture was considered (using services like Firebase Realtime Database or Supabase for real-time sync). However:

- Adding a third-party real-time database introduces a dependency, potential cost, and configuration complexity that contradicts the "no bells and whistles" requirement.
- WebSocket-based communication between a simple Node.js server and browser clients is the most straightforward approach for real-time answer submission and distribution updates.
- A single Node.js process can handle 250 concurrent WebSocket connections with minimal resources.

### Recommended Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 18 + TypeScript | Component-based UI, large ecosystem, TypeScript for type safety. |
| Styling | Tailwind CSS | Utility-first, minimal CSS overhead, responsive by default. |
| Build tool | Vite | Fast dev server and build, good TypeScript support. |
| Backend | Node.js + Express | Lightweight, same language as frontend, minimal setup. |
| Real-time | Socket.IO (or native WebSocket) | Established library for real-time bidirectional communication. Handles reconnection automatically. |
| Markdown parsing | marked + highlight.js | Parse markdown to HTML with syntax-highlighted code blocks. |
| QR code | qrcode (npm package) | Generate QR codes as SVG or data URL. |
| Data storage | Flat JSON files on disk | No database needed. Session data is in-memory; leaderboard data persists to a JSON file. |

### Alternative Stack Consideration

If the instructor wants to avoid running a backend server entirely, an alternative is:

- Use **Cloudflare Workers** or **Deno Deploy** (free tier) as a serverless backend with **Durable Objects** or **KV** for session state.
- This eliminates server management but adds platform lock-in and complexity.

The recommended approach is the Node.js backend due to simplicity and the instructor's existing familiarity with the Node.js ecosystem.

At the target scale of 200-250 concurrent students, horizontal scaling, clustering, Redis, and external databases are not required. A single Node.js process is sufficient for all session management, WebSocket connections, and quiz state.

### Session State Machine

A quiz session moves through the following states. State transitions are controlled exclusively by the instructor.

```
LOBBY -> QUESTION_OPEN -> QUESTION_CLOSED -> REVEAL -> QUESTION_OPEN -> ... -> LEADERBOARD -> ENDED
```

| State | Description |
|-------|-------------|
| `LOBBY` | Session created. Students can join. No question is active. |
| `QUESTION_OPEN` | A question is displayed and submissions are accepted. |
| `QUESTION_CLOSED` | Submissions are no longer accepted. The answer distribution is visible to the instructor. |
| `REVEAL` | The correct answer and explanation are shown to all clients. |
| `LEADERBOARD` | The session leaderboard is displayed after the final question. |
| `ENDED` | The session is over. In-memory session data is discarded. |

Submissions are accepted only during `QUESTION_OPEN`. Any submission received in another state is rejected. This prevents race conditions between the instructor advancing the quiz and students submitting answers, and ensures consistent UI states across all clients.

### Performance Assumptions

At 200-250 concurrent students, the following simplifications apply:

- Broadcasting updated answer counts to the instructor view on every submission is acceptable. No batching, debouncing, or message queue system is required.
- A single Node.js process can handle all WebSocket connections, session state, and quiz logic for the expected load.
- No horizontal scaling, worker threads, or external message brokers are needed.

## 7. Data Flow

```
[Markdown Files]          [Backend Server]           [Clients]
                                                          
week01-quiz.md  ------>  Parse on startup or     <----->  Instructor browser
week02-quiz.md           on file change                   (projector view)
week03-quiz.md                                            
    ...                  In-memory quiz store     <----->  Student browsers
                                                          (phone view)
                         session state (in-memory)
                         leaderboard.json (on disk)
```

### Detailed Flow

1. **Startup**: The backend reads all `weekNN-quiz.md` files from the configured quiz directory (or fetches them from the GitHub Pages URL). It parses each file into a structured array of questions. The server then detects its public Funnel URL by calling `tailscale status --json` and parsing `Self.DNSName`. If Tailscale is available and Funnel is active, the server constructs the public URL (`https://<DNSName>`), calls the TinyURL API to generate a short URL, and generates a QR code via the `qrcode` npm package. If Tailscale is unavailable, the server falls back to the local LAN IP and logs a warning.

2. **Session creation**: The instructor selects a week's quiz from the dashboard. The backend creates a session with a unique 6-character code, stores it in memory, and returns the session URL. The instructor's "Session Start" screen prominently displays the Funnel URL, the short URL, and a large QR code so students can scan or type the URL to join.

3. **Student join**: Students navigate to the URL (or scan the QR code). They enter a student ID (and optionally a display name) and connect via WebSocket. The server adds them to the session's participant list.

   **Reconnection behavior**: If the student's browser has a valid `sessionToken` in `localStorage`, the client sends the `studentId` and `sessionToken` together. If the token matches the server's record for that student, the server treats this as a reconnect and restores the student's state: current question index, score, and which questions have been answered. If the token does not match (e.g., a different device or cleared storage), the server rejects the join attempt.

4. **Question flow**: The instructor advances to the next question. The server broadcasts the question text and options (without the correct answer) to all connected students. Students submit their chosen option(s). The server records each submission and broadcasts updated answer counts to the instructor view.

5. **Reveal**: The instructor closes submissions and reveals the answer. The server broadcasts the correct answer and explanation to all clients. The student view shows whether the student's answer was correct.

6. **Leaderboard**: After the last question, the server computes the leaderboard (correct count, then server-side response time as tiebreaker) and broadcasts it. The server also updates `leaderboard.json` with the week's results.

7. **Session end**: The instructor ends the session. In-memory session data is discarded. The leaderboard file persists.

## 8. Markdown Quiz File Format

Quiz files follow the format established in the [d2l-quiz](https://github.com/chektien/d2l-quiz) repository, with minor adaptations for web rendering.

### File Naming Convention

```
week01-quiz.md
week02-quiz.md
...
week13-quiz.md
```

### Format Specification

Each question block supports an optional `time_limit:` field that specifies how many seconds students have to answer. If omitted, the default is 20 seconds. The time limit is server-enforced: the server closes the submission window after the specified duration regardless of client-side timer state.

````markdown
# Week 01 Quiz: Introduction to XR (10 Questions)

---

## Topic: Subtopic

time_limit: 30

Question text goes here. Supports **bold**, *italic*, `inline code`, and links.

**Main question prompt?**

A. First option
B. Second option
C. Third option
D. Fourth option

> Correct Answer: B. Second option
> Overall Feedback: Explanation of why B is correct.

---

## Another Topic: Code Question

Consider the following code:

```typescript
const xr = await scene.createDefaultXRExperienceAsync({
    sessionMode: "immersive-vr",
});
```

**What does this code do?**

A. Creates a default scene
B. Initializes VR components
C. Renders a frame
D. Loads a 3D model

> Correct Answer: B. Initializes VR components
> Overall Feedback: The createDefaultXRExperienceAsync method sets up stereo rendering, input handling, and other VR defaults.

---

## Multi-Select Topic

time_limit: 45

**Which options apply? (Select all that apply)**

A. Option one
B. Option two
C. Option three
D. Option four

> Correct Answers: A, C
> Overall Feedback: Options A and C are correct because...

---
````

In the examples above, the first question has a 30-second time limit, the second question uses the default (20 seconds, since `time_limit:` is omitted), and the multi-select question has a 45-second time limit.

### Parsing Rules

1. **Title**: The H1 heading (`# ...`) is the quiz title. The parenthetical "(N Questions)" is optional metadata.
2. **Question separator**: Questions are separated by horizontal rules (`---`).
3. **Topic header**: Each question starts with an H2 heading (`## Topic: Subtopic`). This is used for categorization and display.
4. **Time limit**: An optional line `time_limit: N` (where N is an integer in seconds) appearing after the H2 header and before the question text. If omitted, defaults to 20 seconds. The parser looks for this line before the first paragraph of question text.
5. **Question text**: Everything between the H2 header (and optional `time_limit:` line) and the answer options. May include markdown formatting, code blocks, and images.
6. **Answer options**: Lines starting with `A.`, `B.`, `C.`, `D.`, etc. (letter followed by period and space).
7. **Correct answer (single)**: A blockquote line starting with `> Correct Answer:` followed by the letter and optionally the answer text.
8. **Correct answers (multi-select)**: A blockquote line starting with `> Correct Answers:` followed by comma-separated letters.
9. **Feedback**: A blockquote line starting with `> Overall Feedback:` with the explanation text.
10. **End of questions**: Parsing stops at `## Learning Objectives` or end of file.

### Compatibility with d2l-quiz

This format is intentionally compatible with the d2l-quiz markdown format so that the same markdown files can be used with the `gen_quiz_csv.py` script for D2L/xSITe import and with md-quiz for live in-class quizzes.

## 9. Hosting and Deployment

### Frontend (GitHub Pages)

The built React application and the markdown quiz files are committed to the `chektien/md-quiz` repository. GitHub Pages serves the static frontend from the `gh-pages` branch (or `/docs` folder on `main`).

- URL: `https://chektien.github.io/md-quiz/`
- The markdown quiz files are placed in a `quizzes/` directory within the repo.
- The frontend fetches quiz file contents via the GitHub raw content URL or from the same static hosting.

Note: GitHub Pages hosts the static frontend only. The backend must still run locally on the instructor's machine and be exposed to students via Tailscale Funnel (see below).

### Backend (Tailscale Funnel, Primary Approach)

The backend runs as a local Node.js process on the instructor's laptop. To make it accessible to students without requiring them to install anything, the instructor uses Tailscale Funnel to expose the local server via a public HTTPS URL.

**Why Tailscale Funnel:** Campus WiFi networks typically enable client isolation (AP isolation), which blocks device-to-device traffic. Students on the same campus WiFi network cannot reach the instructor's laptop by LAN IP because the access points drop inter-client packets. Tailscale Funnel bypasses this entirely by routing traffic through Tailscale's relay infrastructure, providing a publicly accessible HTTPS endpoint with no student-side setup.

**Funnel URL format:** `https://<hostname>.<tailnet>.ts.net` (e.g., `https://instructors-macbook.tail12345.ts.net`). This URL is publicly accessible over HTTPS. Students open it in any browser on any network (campus WiFi, cellular, home WiFi). No Tailscale installation is needed on student devices.

**One-time setup (instructor only):**

1. Install Tailscale on the instructor's laptop (free tier is sufficient).
2. Enable Funnel in the Tailscale admin console (one-time toggle).

**Each class session:**

1. The instructor starts the Node.js backend (`node server.js`).
2. The instructor runs `tailscale funnel 3000` (or whatever port the backend listens on) to expose the local server.
3. The server automatically detects its own Funnel URL at startup by calling `tailscale status --json` and parsing the `Self.DNSName` field.
4. The server generates a QR code and short URL (see Section 5, P1, "Auto-generated QR and access URL").
5. The instructor displays the session start screen on the projector. Students scan the QR code or type the short URL to join.

**Latency:** Funnel routes traffic through Tailscale's relay infrastructure, adding modest latency. For a quiz with 200-250 students submitting short multiple-choice answers, this latency is negligible.

**Fallback:** If Tailscale is not installed or Funnel is not active, the server falls back to displaying the local LAN IP address (`http://192.168.x.x:3000`) with a warning that students on isolated campus WiFi may not be able to connect. This fallback is useful for networks without client isolation (e.g., home WiFi for testing).

### Alternative Backend Hosting

For cases where the instructor prefers not to run the backend locally, cloud-hosted options are available:

| Service | Free Tier | WebSocket Support | Notes |
|---------|-----------|-------------------|-------|
| **Render** | 750 hours/month (spins down after inactivity) | Yes | Simple deploy from GitHub repo. Cold starts of ~30 seconds. |
| **Fly.io** | 3 shared VMs, 256MB RAM | Yes | Good performance, slightly more setup. |
| **Railway** | $5 credit/month | Yes | Simple deploy, may exceed free tier with heavy use. |

These are secondary options. The Tailscale Funnel approach is recommended because it avoids cold-start delays, external dependencies, and hosting costs while giving the instructor full control over the server.

## 10. Out of Scope

The following are explicitly out of scope for the initial version:

- **User authentication or student accounts**: Students join with a student ID only. No login, no passwords, no OAuth.
- **Database**: No SQL or NoSQL database. All state is in-memory (sessions) or flat JSON files (leaderboard).
- **LMS integration**: No automatic grade upload to D2L, xSITe, or any other LMS.
- **Question editing UI**: Questions are authored by editing markdown files directly. No web-based question editor.
- **Analytics or reporting**: No per-student analytics, response-time distributions, or question-difficulty metrics.
- **Internationalization**: English only.
- **Accessibility compliance**: Best-effort responsive design, but no formal WCAG audit.
- **Offline support**: Requires network connectivity for both instructor and students.
- **Video or audio questions**: Text, code, and images only.
- **Anti-cheating measures**: No lockdown browser, no IP tracking, no answer-shuffling (P2 consideration). Roster validation and impersonation mitigation are covered in Section 5a.

## 11. API and Event Contract

### WebSocket Events (Socket.IO)

All real-time communication uses Socket.IO events. Direction notation: `C->S` = client to server, `S->C` = server to client, `S->All` = server broadcasts to all connected clients in the session.

| Event Name | Direction | Payload Fields | Description |
|------------|-----------|---------------|-------------|
| `student:join` | C->S | `{ studentId: string, displayName?: string, sessionToken?: string }` | Student requests to join a session. If `sessionToken` is provided, server attempts reconnection. |
| `student:joined` | S->C | `{ participantId: string, sessionToken: string, sessionState: string, currentQuestion?: number }` | Server acknowledges join. Client stores `sessionToken` in localStorage. |
| `student:rejected` | S->C | `{ reason: string }` | Server rejects join (invalid ID, duplicate token conflict, session ended). |
| `session:participants` | S->C (instructor) | `{ count: number, participants: Array<{ studentId: string, displayName?: string }> }` | Updated participant list sent to instructor on each join/leave. |
| `question:open` | S->All | `{ questionIndex: number, topic: string, text: string, options: Array<{ label: string, text: string }>, timeLimitSec: number, startedAt: number }` | Server broadcasts question to all students. `text` and `options` are rendered markdown (HTML). Correct answer is never sent to clients. `startedAt` is a Unix timestamp (ms). |
| `question:tick` | S->All | `{ remainingSec: number }` | Server broadcasts remaining seconds every 1s during an active question. |
| `answer:submit` | C->S | `{ questionIndex: number, selectedOptions: string[] }` | Student submits answer. `selectedOptions` is an array of labels (e.g., `["B"]` or `["A","C"]` for multi-select). |
| `answer:accepted` | S->C | `{ questionIndex: number }` | Server confirms the submission was recorded. |
| `answer:rejected` | S->C | `{ questionIndex: number, reason: string }` | Server rejects submission (question closed, already submitted, invalid state). |
| `answer:count` | S->C (instructor) | `{ questionIndex: number, submitted: number, total: number }` | Updated submission count sent to instructor after each submission. |
| `question:close` | S->All | `{ questionIndex: number }` | Server closes submissions (timer expired or instructor manually closed). |
| `results:distribution` | S->C (instructor) | `{ questionIndex: number, distribution: Record<string, number> }` | Answer distribution by option label (e.g., `{ "A": 12, "B": 45, "C": 8, "D": 5 }`). Sent to instructor after question closes. |
| `results:reveal` | S->All | `{ questionIndex: number, correctOptions: string[], explanation: string, distribution: Record<string, number> }` | Correct answer and explanation broadcast to all clients. Students see whether their answer was correct. |
| `leaderboard:update` | S->All | `{ entries: Array<{ rank: number, studentId: string, displayName?: string, correctCount: number, totalTimeSec: number }>, totalQuestions: number }` | Leaderboard broadcast after reveal or at end of quiz. |
| `session:state` | S->All | `{ state: string, questionIndex?: number }` | Broadcast on every state transition (LOBBY, QUESTION_OPEN, QUESTION_CLOSED, REVEAL, LEADERBOARD, ENDED). |

#### Example: Full Question-Answer Flow

```json
// 1. Instructor advances to question 0 -> server broadcasts:
// Event: question:open (S->All)
{
  "questionIndex": 0,
  "topic": "Introduction to XR",
  "text": "<p><strong>What does createDefaultXRExperienceAsync do?</strong></p>",
  "options": [
    { "label": "A", "text": "Creates a default scene" },
    { "label": "B", "text": "Initializes VR components" },
    { "label": "C", "text": "Renders a frame" },
    { "label": "D", "text": "Loads a 3D model" }
  ],
  "timeLimitSec": 20,
  "startedAt": 1709345678000
}

// 2. Student submits answer:
// Event: answer:submit (C->S)
{
  "questionIndex": 0,
  "selectedOptions": ["B"]
}

// 3. Server acknowledges:
// Event: answer:accepted (S->C)
{
  "questionIndex": 0
}

// 4. Server sends updated count to instructor:
// Event: answer:count (S->C instructor)
{
  "questionIndex": 0,
  "submitted": 142,
  "total": 198
}

// 5. Timer expires or instructor closes -> server broadcasts:
// Event: question:close (S->All)
{
  "questionIndex": 0
}

// 6. Instructor reveals answer -> server broadcasts:
// Event: results:reveal (S->All)
{
  "questionIndex": 0,
  "correctOptions": ["B"],
  "explanation": "The createDefaultXRExperienceAsync method sets up stereo rendering, input handling, and other VR defaults.",
  "distribution": { "A": 12, "B": 145, "C": 28, "D": 13 }
}
```

### REST Endpoints

REST endpoints handle session lifecycle and static data. All endpoints return JSON. The server listens on a single port (default 3000) for both REST and WebSocket traffic.

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|-------------|----------|
| `GET` | `/api/health` | Health check | None | `{ "status": "ok", "uptime": number }` |
| `GET` | `/api/quiz/:week` | Get parsed quiz metadata for a week (question count, title). Does not include correct answers. | None | `{ "week": string, "title": string, "questionCount": number }` |
| `GET` | `/api/quizzes` | List all available weeks | None | `Array<{ week: string, title: string, questionCount: number }>` |
| `POST` | `/api/session` | Create a new quiz session | `{ "week": string, "mode": "strict" \| "open", "rosterPath?": string }` | `{ "sessionId": string, "sessionCode": string, "joinUrl": string }` |
| `POST` | `/api/session/:id/start` | Transition session from LOBBY to QUESTION_OPEN (first question) | None | `{ "state": "QUESTION_OPEN", "questionIndex": 0 }` |
| `POST` | `/api/session/:id/next` | Advance to next question | None | `{ "state": "QUESTION_OPEN", "questionIndex": number }` |
| `POST` | `/api/session/:id/close` | Close current question submissions | None | `{ "state": "QUESTION_CLOSED", "questionIndex": number }` |
| `POST` | `/api/session/:id/reveal` | Reveal correct answer for current question | None | `{ "state": "REVEAL", "questionIndex": number }` |
| `POST` | `/api/session/:id/end` | End the session | None | `{ "state": "ENDED" }` |
| `GET` | `/api/session/:id/leaderboard` | Get current session leaderboard | None | `{ "entries": Array<LeaderboardEntry>, "totalQuestions": number }` |
| `GET` | `/api/access-info` | Get server access info (full URL, short URL, QR path) | None | `{ "fullUrl": string, "shortUrl": string, "qrCodePath": string, "source": "tailscale" \| "lan-fallback" }` |
| `GET` | `/api/qr/:sessionId.png` | QR code image for session join URL | None | PNG image |

## 12. Data Model and Storage Schema

### TypeScript Interfaces

```typescript
interface Quiz {
  week: string;              // e.g., "week01"
  title: string;             // e.g., "Week 01 Quiz: Introduction to XR"
  questions: Question[];
  sourceFile: string;        // e.g., "week01-quiz.md"
}

interface Question {
  index: number;             // 0-based position within the quiz
  topic: string;             // from H2 heading, e.g., "Introduction to XR"
  subtopic?: string;         // after colon in H2, e.g., "Subtopic"
  textMd: string;            // raw markdown of question body
  textHtml: string;          // rendered HTML of question body
  options: QuestionOption[];
  correctOptions: string[];  // e.g., ["B"] or ["A", "C"] for multi-select
  explanation: string;       // from Overall Feedback
  timeLimitSec: number;      // default 20 if not specified in markdown
}

interface QuestionOption {
  label: string;             // "A", "B", "C", "D", etc.
  textMd: string;            // raw markdown of option text
  textHtml: string;          // rendered HTML of option text
}

interface Session {
  sessionId: string;         // UUID v4
  sessionCode: string;       // 6-character alphanumeric code
  week: string;              // which quiz week this session uses
  mode: "strict" | "open";   // roster validation mode
  state: SessionState;       // current state machine state
  currentQuestionIndex: number;  // -1 when in LOBBY
  questionStartedAt?: number;    // Unix timestamp (ms) when current question opened
  participants: Map<string, Participant>;  // keyed by studentId
  submissions: Submission[];
  createdAt: number;         // Unix timestamp (ms)
}

type SessionState = "LOBBY" | "QUESTION_OPEN" | "QUESTION_CLOSED" | "REVEAL" | "LEADERBOARD" | "ENDED";

interface Participant {
  studentId: string;
  displayName?: string;
  sessionToken: string;      // UUID v4, generated on first join
  socketId: string;          // current Socket.IO socket ID
  joinedAt: number;          // Unix timestamp (ms)
  connected: boolean;        // tracks live connection status
}

interface Submission {
  studentId: string;
  questionIndex: number;
  selectedOptions: string[]; // e.g., ["B"] or ["A", "C"]
  submittedAt: number;       // Unix timestamp (ms), server-recorded
  responseTimeMs: number;    // submittedAt - questionStartedAt, computed server-side
}

interface LeaderboardEntry {
  rank: number;
  studentId: string;
  displayName?: string;
  correctCount: number;
  totalTimeMs: number;       // sum of responseTimeMs for correct answers only
}

interface AccessInfo {
  fullUrl: string;           // e.g., "https://my-laptop.tailnet.ts.net"
  shortUrl: string;          // e.g., "https://tinyurl.com/abc123"
  qrCodeDataUrl: string;     // base64 data URL of QR code SVG/PNG
  source: "tailscale" | "lan-fallback";
  detectedAt: number;        // Unix timestamp (ms)
}
```

### Flat-File Persistence Layout

In-memory data (sessions, connected participants, live submissions) is authoritative during a session. On session end, relevant data is persisted to disk. On server restart, in-memory state is lost (sessions do not survive restarts).

```
data/
  quizzes/
    week01-quiz.md           # source markdown files (read-only by server)
    week02-quiz.md
    ...
  sessions/
    <sessionId>.json         # session metadata + final state snapshot (written on session end)
  submissions/
    <sessionId>.json         # all submissions for a session (written on session end)
  winners/
    week01.json              # per-week leaderboard results (top N, used for cumulative leaderboard)
    week02.json
    ...
  access/
    current.json             # current server access info (overwritten on each startup)
```

**What stays in-memory vs. persisted:**

| Data | In-Memory (during session) | Persisted (on session end) |
|------|---------------------------|---------------------------|
| Session state machine | Yes (authoritative) | `sessions/<id>.json` (snapshot) |
| Participant list + socket IDs | Yes | `sessions/<id>.json` (without socket IDs) |
| Submissions | Yes (authoritative) | `submissions/<id>.json` |
| Per-week leaderboard results | Computed at LEADERBOARD state | `winners/weekNN.json` |
| Cumulative leaderboard | Computed on demand from `winners/*.json` | Not stored (always derived) |
| Parsed quiz data | Yes (loaded on startup) | No (re-parsed from markdown on startup) |
| Access info (URL, QR) | Yes | `access/current.json` |

### `timeLimitSec` Default Behavior

If a question's markdown does not include a `time_limit:` line, the default is 20 seconds. The server enforces this: when `questionStartedAt + (timeLimitSec * 1000)` is reached, the server automatically transitions to `QUESTION_CLOSED` and broadcasts `question:close`. Submissions arriving after this timestamp are rejected with `answer:rejected` regardless of network latency.

## 13. Acceptance Criteria and Success Metrics (P1)

Each criterion below is testable. P1 is complete when all criteria pass.

### Markdown Parsing

- AC-1: The parser successfully extracts title, topic, question text, options, correct answer(s), explanation, and time limit from every question block in the example `week01-quiz.md` through `week13-quiz.md` files.
- AC-2: The parser produces a validation error (not a crash) for malformed questions: missing correct answer line, no options, unterminated code block. The error message identifies the question number and file.
- AC-3: Code blocks in question text and options render with syntax highlighting (highlight.js classes present in HTML output).

### Session and Join Flow

- AC-4: In strict mode with a roster loaded, a student submitting an ID not in the roster receives `student:rejected` with reason "Student ID not found" within 200ms. The student can retry immediately.
- AC-5: In open mode, any `studentId` string is accepted on join.
- AC-6: A second connection with the same `studentId` but a different `sessionToken` is rejected (or the first connection is dropped, per config).

### Timer and Submission Enforcement

- AC-7: The server closes the submission window exactly at `timeLimitSec` seconds after `question:open`, regardless of client clock. Submissions arriving after the deadline receive `answer:rejected` with reason "Question closed."
- AC-8: If a student submits a second answer for the same question, the server rejects it with `answer:rejected` and reason "Already submitted." The first submission is unchanged.
- AC-9: Submissions sent while the session is not in `QUESTION_OPEN` state are rejected.

### Access Info and QR

- AC-10: When `tailscale status --json` succeeds and Funnel is active, the server generates a valid HTTPS URL, calls TinyURL API for a short URL, and generates a scannable QR code (verifiable with any QR reader).
- AC-11: When Tailscale CLI is unavailable or Funnel is not active, the server falls back to the local LAN IP and logs a warning. The `GET /api/access-info` response shows `"source": "lan-fallback"`.

### Instructor Live View

- AC-12: The projector view displays a bar chart that updates within 500ms of each new submission during `QUESTION_OPEN`.
- AC-13: The submission count display shows `"X / Y answered"` where X = submissions received and Y = connected participants, updating in real time.
- AC-14: The instructor can advance through the full state machine (LOBBY -> QUESTION_OPEN -> QUESTION_CLOSED -> REVEAL -> next QUESTION_OPEN -> ... -> LEADERBOARD -> ENDED) using the UI controls. Each transition broadcasts the correct `session:state` event.

### Leaderboard

- AC-15: Students are ranked by correct answer count (descending). Ties are broken by cumulative response time (ascending, lower is better). Response time is computed server-side only.
- AC-16: The cumulative leaderboard aggregates results from all `winners/weekNN.json` files. Adding a new week's results and refreshing the leaderboard reflects the update without server restart.

### Reconnection (P1 scope: within active question)

- AC-17: A student who disconnects and reconnects with a valid `sessionToken` during a `QUESTION_OPEN` window can still submit an answer if they have not already submitted for that question.
- AC-18: A reconnected student's previous submissions and score are preserved. They are not counted as a new participant.

### Scale

- AC-19: The server handles 250 concurrent WebSocket connections with sub-second event broadcast latency, verified by a load test script using a WebSocket client library (e.g., `ws` or `socket.io-client`).

## 14. Implementation Milestones (P1 Build Order)

P1 is broken into seven milestones. Each milestone has concrete deliverables and verification checks. Milestones are sequential; each builds on the previous.

### M1: Parser and Schema Validation

**Deliverables:**
- Markdown parser module that reads `weekNN-quiz.md` files and produces `Quiz` objects matching the Section 12 interface.
- Validation layer that rejects malformed questions with descriptive errors (question index, file name, what is missing).
- Unit tests covering: single-select, multi-select, code blocks, missing fields, `time_limit` parsing, default `time_limit` of 20s.

**Verification:**
- `npm test` passes all parser tests.
- Parser correctly handles the example questions from Section 8.
- Malformed input produces errors, not crashes.

### M2: Session State Machine and REST Shell

**Deliverables:**
- Express server with all REST endpoints from Section 11 returning correct responses.
- In-memory `Session` object with state machine transitions (Section 6).
- State transition guards: e.g., cannot call `/start` unless in LOBBY, cannot call `/next` unless in REVEAL.
- `GET /api/health` returns uptime.

**Verification:**
- REST endpoints return correct status codes and payloads (testable with curl or automated HTTP tests).
- Invalid state transitions return 400 with a descriptive error.
- Session creation assigns a 6-character code and UUID.

### M3: WebSocket Student Answer Loop

**Deliverables:**
- Socket.IO integration on the Express server.
- `student:join` / `student:joined` / `student:rejected` flow with roster validation (strict and open modes).
- `answer:submit` / `answer:accepted` / `answer:rejected` flow with duplicate-submission and late-submission guards.
- Server-enforced timer: auto-closes question after `timeLimitSec` and broadcasts `question:close`.
- `question:tick` broadcast every 1 second.
- `sessionToken` generation and reconnection within active question window.

**Verification:**
- A test client can join, submit, and receive acknowledgment.
- Duplicate submissions are rejected.
- Late submissions (after timer) are rejected.
- Reconnection with valid token restores state.

### M4: Instructor UI and Projector Controls

**Deliverables:**
- React instructor view with: quiz selector, session start screen (QR + URLs), question display, state-machine control buttons (Start, Close, Reveal, Next, End).
- Real-time bar chart of answer distribution (updates on each `answer:count`).
- Submission count display: "X / Y answered."
- Countdown timer display synced with server `question:tick`.
- Participant list panel.

**Verification:**
- Instructor can drive a full quiz session from LOBBY to ENDED using UI controls.
- Bar chart updates visually within 500ms of a submission.
- Timer counts down and question auto-closes when it reaches zero.

### M5: Student UI, Results Reveal, and Leaderboard

**Deliverables:**
- React student view with: join screen (student ID + optional display name), question display with answer buttons, submission confirmation, results screen (correct/incorrect + explanation), leaderboard screen.
- Markdown rendering in questions and options (bold, code, images via marked + highlight.js).
- Leaderboard computation: rank by correct count, tiebreak by cumulative server-side response time.
- Persist per-week results to `winners/weekNN.json` on session end.
- Cumulative leaderboard derived from all `winners/*.json` files.

**Verification:**
- Student can join, answer all questions, and see results and leaderboard.
- Leaderboard ranking matches expected order (correct count, then time tiebreak).
- `winners/weekNN.json` file is written correctly after session end.
- Cumulative leaderboard reflects multiple weeks.

### M6: Tailscale Access Info, QR, and Short URL

**Deliverables:**
- Startup routine: call `tailscale status --json`, parse `Self.DNSName`, construct full URL.
- TinyURL API call to generate short URL.
- QR code generation via `qrcode` npm package, served at `/api/qr/:sessionId.png`.
- Fallback to LAN IP with warning when Tailscale is unavailable.
- `GET /api/access-info` endpoint returning `AccessInfo` object.
- Persist access info to `data/access/current.json`.

**Verification:**
- With Tailscale active: full URL, short URL, and QR code are generated and displayed.
- Without Tailscale: LAN IP fallback is used, warning is logged, `source` is `"lan-fallback"`.
- QR code is scannable and resolves to the correct join URL.

### M7: Load Test and Classroom Dry-Run Checklist

**Deliverables:**
- Load test script using `socket.io-client` that simulates 250 concurrent students: join, submit random answers, verify acknowledgment, measure broadcast latency.
- Dry-run checklist document covering: Tailscale Funnel active, quiz files in place, projector display tested, QR code scannable from back of room, timer behavior confirmed, leaderboard display verified.
- Fix any performance issues identified by load test (if broadcast latency > 1s at 250 clients).

**Verification:**
- Load test passes at 250 concurrent clients with sub-second broadcast latency.
- All acceptance criteria from Section 13 are verified.
- Dry-run checklist completed successfully on instructor's machine.
