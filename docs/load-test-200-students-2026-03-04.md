# 200-Student Load Test Evidence (2026-03-04)

## Command

```bash
LOAD_STUDENTS=200 npm run verify:live
```

## Environment and realism

- Ran the existing mdq live-readiness path end to end (targeted e2e, full server suite, client build, load-smoke).
- The 200-student run used real Socket.IO client connections in parallel inside Jest against the mdq server.
- Limitation: this environment cannot reproduce physical iPad + classroom Wi-Fi + Tailscale Funnel path, so this is the nearest operational equivalent available in CI-like local execution.

## Key evidence from run output

- `PASS packages/server/src/__tests__/e2e-live-readiness.test.ts`
- `PASS src/__tests__/load-smoke.test.ts (18.178 s)` during full server suite
- `Join phase: 200 students in 7119ms`
- `Submit phase: 200 answers in 9727ms`
- `Total: 17747ms for 200 students, 1 question`
- Dedicated load-smoke step (final verify step) also passed:
  - `Join phase: 200 students in 7361ms`
  - `Submit phase: 200 answers in 9977ms`
  - `Total: 18244ms for 200 students, 1 question`
- Final status: `[live-readiness] All checks passed`

## Notes

- This confirms mdq can complete the full 200-participant simulation path without test failures in two independent load-smoke executions within the same verify run.
