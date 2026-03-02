Basically anti cheating and contiuity of experience for students is important. I do not want a single student to have double counting, or lose the history of their answers if they disconnect and reconnect. I think requiring the student to provide the student id solves this largely but the system needs to be designed to handle this properly. 

Consider the following updates:

---

1️⃣ Update Target Scale

- Replace any references to supporting 500 students with 200–250 concurrent students.
- Adjust performance assumptions accordingly.
- Add a brief clarification in the Technical Architecture section that horizontal scaling, clustering, Redis, and external databases are not required at this scale.
- Do not introduce new infrastructure recommendations.

---

2️⃣ Add Identity and Anti-Cheat Model Section

Add a new section titled:

"Identity and Anti-Cheat Model"

Place it after the Feature Requirements section.

Include:

- Require `studentId` (mandatory) and `displayName` (optional).
- Server generates a `sessionToken` (UUID) per participant.
- `sessionToken` is stored in localStorage for reconnect support.
- Each `studentId` is locked to one `sessionToken` per session.
- If a join attempt uses an existing studentId with a different token, reject or disconnect previous socket (policy configurable).
- Only the first submission per question is recorded.
- Submissions cannot be overwritten.
- Late joiners cannot answer previous questions.
- Response timing is computed server-side only.

Keep the tone consistent with the PRD.

---

3️⃣ Extend Student Join Flow with Reconnection Behavior

Update the existing Student Join Flow section to include:

- If localStorage contains a valid `sessionToken`, treat the request as a reconnect.
- Client sends `studentId + sessionToken`.
- If token matches server record, restore:
  - current question index
  - score
  - answered status
- If token mismatch, reject the join.

Append this behavior without restructuring the original flow.

---

4️⃣ Add Explicit Session State Machine

Under the Technical Architecture section, add a new subsection titled:

"Session State Machine"

Define the states:

LOBBY  
QUESTION_OPEN  
QUESTION_CLOSED  
REVEAL  
LEADERBOARD  
ENDED  

Clarify:

- Submissions are accepted only during QUESTION_OPEN.
- State transitions are controlled exclusively by the instructor.
- This prevents race conditions and inconsistent UI states.

Do not modify other architecture content.

---

5️⃣ Clarify Server-Side Timing Integrity

Update any sections referencing response time to explicitly state:

- `questionStartTime` is stored on the server.
- `responseTime = serverNow - questionStartTime`.
- Client-provided timestamps are ignored.

Keep the change minimal and consistent with existing language.

---

6️⃣ Simplify Performance Assumptions

Add a short clarification in the Technical Architecture or Performance section:

- At 200–250 concurrent students, broadcasting updates per submission is acceptable.
- No batching or message queue system required.
- A single Node.js process is sufficient for expected load.

Do not introduce scaling complexity.

---

7️⃣ Clarify Leaderboard Persistence

Update the leaderboard section to clarify:

- Weekly results are persisted to `leaderboard.json`.
- Cumulative leaderboard is computed dynamically at runtime.
- Cumulative totals should not be precomputed and stored.

Keep structure unchanged.

---

8️⃣ Enhance Instructor View Requirements

In the Feature Requirements table, add one new row:

Feature: Submission Count Display  
Description: Projector view must display submission count in format "X / Y answered" during active questions.

Do not modify table formatting.

---

Lastly for the user stories, be clear that each story tries to capture the motivation behind each feature, and that the acceptance criteria can be testable.
