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
- **G7**: Work for classes of up to 500 students with 1-2 quizzes per week.

### Non-Goals

- Real-time collaborative editing of quiz files.
- Student accounts, login, or persistent user profiles. Students provide a display name (or student ID) when joining.
- Open-ended text responses, word clouds, or poll types beyond multiple-choice and multi-select.
- Grading integration with LMS (D2L/xSITe). The leaderboard is the output; grade entry is manual.
- Mobile app distribution. The student interface is a responsive web page only.
- Analytics dashboards, CSV exports, or detailed per-student response logs (P2 at most).

## 4. User Stories

### Instructor

1. **As an instructor**, I want to write quiz questions in a markdown file using a format I already know (from d2l-quiz), so I can reuse and version-control my questions.
2. **As an instructor**, I want to select a week's quiz and start a live session so students can join from their devices.
3. **As an instructor**, I want to display a QR code and short URL on the projector so students can join quickly.
4. **As an instructor**, I want to see a real-time bar chart of answer distribution on the projector while students submit answers.
5. **As an instructor**, I want to reveal the correct answer and explanation after closing a question, so I can discuss it with the class.
6. **As an instructor**, I want to advance through questions one at a time at my own pace.
7. **As an instructor**, I want to see a leaderboard at the end of the quiz showing who answered correctly and fastest.
8. **As an instructor**, I want a cumulative leaderboard across all weeks so I can track weekly winners for bonus marks.

### Student

1. **As a student**, I want to scan a QR code or type a short URL to join the quiz on my phone.
2. **As a student**, I want to enter a display name (or student ID) to identify myself.
3. **As a student**, I want to see the question and answer choices on my phone and tap to submit my answer.
4. **As a student**, I want to see whether my answer was correct after the instructor reveals the answer.
5. **As a student**, I want to see my rank on the leaderboard at the end of the quiz.

## 5. Feature Requirements

### P1 (Must Have)

| Feature | Description |
|---------|-------------|
| Markdown parser | Parse week01-quiz.md through weekNN-quiz.md files into structured quiz data. Support the d2l-quiz markdown format (see Section 8). |
| Session management | Instructor can create a live quiz session from a selected week's quiz file. Generate a unique session code. |
| Student join flow | Students scan QR code or enter short URL, provide a display name, and join the session. No login required. |
| Question display | Render questions with markdown support (bold, inline code, code blocks with syntax highlighting, images). |
| Live answer submission | Students submit answers from their devices. Server tracks submissions per question. |
| Answer distribution | Projector view shows a real-time bar chart of how many students picked each option. |
| Instructor controls | Start quiz, advance to next question, close submissions for current question, reveal answer. |
| Results reveal | After closing a question, show the correct answer highlighted and display the explanation (Overall Feedback). |
| Session leaderboard | At end of quiz, rank students by number of correct answers (tiebreak by cumulative response time). |
| Cumulative leaderboard | Persist weekly scores in a flat JSON file. Show cumulative leaderboard across all weeks. |
| QR code generation | Generate and display a QR code for the session URL on the projector view. |

### P2 (Nice to Have)

| Feature | Description |
|---------|-------------|
| Timer per question | Optional countdown timer that auto-closes submissions. |
| Multi-select questions | Support questions with multiple correct answers (matching the d2l-quiz "Correct Answers: A, B, C" format). |
| Short answer questions | Support free-text short answer questions with exact-match grading. |
| Question images | Render images referenced in markdown (e.g., `![alt](url)`). |
| Export results | Export session results as CSV or JSON for the instructor's records. |
| Sound effects | Optional audio cues for question open/close and leaderboard reveal. |
| Reconnection | Students who lose connection can rejoin the same session with the same display name. |

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
- A single Node.js process can handle 500 concurrent WebSocket connections with minimal resources.

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

3. **Student join**: Students navigate to the URL (or scan the QR code). They enter a display name and connect via WebSocket. The server adds them to the session's participant list.

4. **Question flow**: The instructor advances to the next question. The server broadcasts the question text and options (without the correct answer) to all connected students. Students submit their chosen option(s). The server records each submission and broadcasts updated answer counts to the instructor view.

5. **Reveal**: The instructor closes submissions and reveals the answer. The server broadcasts the correct answer and explanation to all clients. The student view shows whether the student's answer was correct.

6. **Leaderboard**: After the last question, the server computes the leaderboard (correct count, then response time as tiebreaker) and broadcasts it. The server also updates `leaderboard.json` with the week's results.

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

````markdown
# Week 01 Quiz: Introduction to XR (10 Questions)

---

## Topic: Subtopic

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

**Which options apply? (Select all that apply)**

A. Option one
B. Option two
C. Option three
D. Option four

> Correct Answers: A, C
> Overall Feedback: Options A and C are correct because...

---
````

### Parsing Rules

1. **Title**: The H1 heading (`# ...`) is the quiz title. The parenthetical "(N Questions)" is optional metadata.
2. **Question separator**: Questions are separated by horizontal rules (`---`).
3. **Topic header**: Each question starts with an H2 heading (`## Topic: Subtopic`). This is used for categorization and display.
4. **Question text**: Everything between the H2 header and the answer options. May include markdown formatting, code blocks, and images.
5. **Answer options**: Lines starting with `A.`, `B.`, `C.`, `D.`, etc. (letter followed by period and space).
6. **Correct answer (single)**: A blockquote line starting with `> Correct Answer:` followed by the letter and optionally the answer text.
7. **Correct answers (multi-select)**: A blockquote line starting with `> Correct Answers:` followed by comma-separated letters.
8. **Feedback**: A blockquote line starting with `> Overall Feedback:` with the explanation text.
9. **End of questions**: Parsing stops at `## Learning Objectives` or end of file.

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

## 10. Out of Scope

The following are explicitly out of scope for the initial version:

- **User authentication or student accounts**: Students join with a display name only. No login, no passwords, no OAuth.
- **Database**: No SQL or NoSQL database. All state is in-memory (sessions) or flat JSON files (leaderboard).
- **LMS integration**: No automatic grade upload to D2L, xSITe, or any other LMS.
- **Question editing UI**: Questions are authored by editing markdown files directly. No web-based question editor.
- **Analytics or reporting**: No per-student analytics, response-time distributions, or question-difficulty metrics.
- **Internationalization**: English only.
- **Accessibility compliance**: Best-effort responsive design, but no formal WCAG audit.
- **Offline support**: Requires network connectivity for both instructor and students.
- **Video or audio questions**: Text, code, and images only.
- **Anti-cheating measures**: No lockdown browser, no IP tracking, no answer-shuffling (P2 consideration).
