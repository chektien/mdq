# AGENTS.md - MDQ Repository Instructions

## Public Repository Boundary
- This is a public-facing repository. Do not commit real quiz data, private class data, session exports, submissions, access logs, or other teaching-instance data.
- The only quiz content that may be committed is intentional smoke/sample content meant for public distribution, such as files under `samples/quizzes/` or minimal non-real fixtures used by automated tests.
- Keep private/runtime quiz data under ignored local data paths. If real quiz data is accidentally committed, stop and remove it from history before continuing normal development.

## Local Agent Notes
- Keep agent-generated planning, handoff, scratch, and review markdown out of the public repository unless Chek explicitly asks to publish a specific document.
- Prefer issue comments, PR descriptions, or ignored local notes for transient agentic development notes.
