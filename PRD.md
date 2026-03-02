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

2. **Lightweight backend** (hosted separately): A Node.js server that handles session state, WebSocket connections for real-time updates, and quiz data serving. This is the minimal server component needed for live interaction.

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

1. **Startup**: The backend reads all `weekNN-quiz.md` files from the configured quiz directory (or fetches them from the GitHub Pages URL). It parses each file into a structured array of questions.

2. **Session creation**: The instructor selects a week's quiz from the dashboard. The backend creates a session with a unique 6-character code, stores it in memory, and returns the session URL.

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

### Backend (Free Hosting Options)

The backend needs to run a Node.js process with WebSocket support. Free-tier options:

| Service | Free Tier | WebSocket Support | Notes |
|---------|-----------|-------------------|-------|
| **Render** | 750 hours/month (spins down after inactivity) | Yes | Recommended. Simple deploy from GitHub repo. Cold starts of ~30 seconds. |
| **Fly.io** | 3 shared VMs, 256MB RAM | Yes | Good performance, slightly more setup. |
| **Railway** | $5 credit/month | Yes | Simple deploy, may exceed free tier with heavy use. |
| **Glitch** | Always-on with limits | Yes | Easy to prototype but less reliable for production. |
| **Self-hosted** | Instructor's machine | Yes | Run locally during class. Zero cost, full control, but requires the instructor's laptop to be on and connected. |

### Recommended Deployment

For simplicity and zero cost:

1. **During class**: Run the backend locally on the instructor's laptop (`node server.js`). Students connect over the campus network. This avoids cold-start delays and external dependencies.
2. **Frontend**: Serve from GitHub Pages. The frontend connects to the backend URL (configurable, defaults to `localhost:3000` for local use).
3. **Backup option**: Deploy the backend to Render for cases where the instructor wants students to connect from outside the local network.

### Short URL

Use a free URL shortener (e.g., a custom short link via GitHub Pages redirect, or a service like `tinyurl.com`) to create a memorable class URL like `tinyurl.com/dia-quiz`. This URL can remain the same across weeks; the landing page shows available quiz sessions.

### Option B: Local Instructor Machine with Tailscale (Recommended for Classroom)

Running the Node.js backend on the instructor's own laptop is the simplest deployment, but campus WiFi networks typically enable client isolation (AP isolation), which blocks device-to-device traffic. Students on the same campus WiFi network cannot reach the instructor's laptop by LAN IP because the access points drop inter-client packets. This means `http://192.168.x.x:3000` will not work.

**Tailscale as the solution:** Tailscale creates an encrypted mesh network (WireGuard-based) that bypasses client isolation entirely by routing traffic through Tailscale's coordination servers when direct connections are blocked. Each device gets a stable Tailscale IP (e.g., `100.x.x.x`) that is reachable from any other device on the same Tailscale network, regardless of the underlying WiFi configuration.

**Classroom workflow:**

1. **One-time setup (instructor):** Install Tailscale on the instructor's laptop. Create a free Tailscale account (free tier supports up to 100 devices, sufficient for a class of 200-250 since students connect via browser, not Tailscale).
2. **One-time setup (students):** Two options:
   - **(a) Tailscale Funnel (no student install):** The instructor enables Tailscale Funnel on their machine, which exposes the local backend via a public HTTPS URL (e.g., `https://instructors-macbook.tail12345.ts.net:3000`). Students access this URL directly from any browser. No Tailscale installation needed on student devices. This is the recommended option for simplicity.
   - **(b) Tailscale on student devices:** Students install the Tailscale app (available on iOS, Android, macOS, Windows, Linux) and join the instructor's Tailscale network via an invite link shared at the start of class. Students then access the backend via the instructor's Tailscale IP (e.g., `http://100.x.x.x:3000`). This is a one-time setup per device.
3. **Each class session:** The instructor starts the Node.js backend (`node server.js`), opens the Tailscale app (or verifies it is running), and displays the QR code pointing to the Tailscale URL on the projector. Students scan and join.

**Tradeoffs:**

- Tailscale Funnel (option a) requires zero student-side setup but routes traffic through Tailscale's relay infrastructure, adding modest latency. For a quiz with 200-250 students submitting short answers, this latency is negligible.
- Direct Tailscale mesh (option b) has lower latency but requires a one-time student install. The mobile apps are lightweight and free.
- Both options work through any network configuration (campus WiFi, home WiFi, cellular), making the system robust to varying classroom network setups.

**QR code integration:** The QR code feature (Section 5, P1) points to whichever URL the instructor configures: the Tailscale Funnel HTTPS URL, the Tailscale IP, or a short URL redirect. The instructor sets the base URL in the session configuration.

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
