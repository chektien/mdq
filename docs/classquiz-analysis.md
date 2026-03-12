# ClassQuiz Research Notes for MDQ

Source reviewed: <https://github.com/mawoka-myblock/ClassQuiz>

## What ClassQuiz does well

- Real-time classroom flow with stable reconnect behavior and explicit per-session state transitions.
- Strong operational features for larger deployments (service separation, background workers, multiple integrations).
- Rich feature set for long-running quiz operations.

## Why MDQ should stay simpler

- MDQ target is short live sessions, small operator footprint, and no database.
- ClassQuiz relies on a heavier multi-service stack, while MDQ intentionally favors local files and in-memory runtime state.
- For MDQ, lower operational complexity is more important than feature breadth.

## Suggested MDQ roadmap inspired by ClassQuiz

### Now (keeps no-DB and static-hosting-friendly constraints)

- Add stronger reconnect guarantees tied to a per-client instance token.
- Improve instructor recovery visibility with clear session-health indicators.
- Keep append-only local session event logs for post-class troubleshooting.

### Next

- Add explicit timer synchronization fields in session state broadcasts.
- Add lightweight integrity checks for reconnect and duplicate-answer edge cases.

### Later

- Optional pluggable adapters for external services, still keeping file-first local operation as default.
