# MDQ Security Hardening Plan (Review First)

This document is a planning artifact only. It proposes security controls and operating procedures before any implementation changes are made.

## Scope and assumptions

- Deployment context: MDQ server exposed through Tailscale Funnel for classroom use.
- Primary objective: reduce risk to the instructor machine while maintaining usable live quiz operations.
- Constraint: no behavior changes in this plan, only reviewable guidance and sequencing.

## Threat model: Tailscale Funnel exposure

### Assets to protect

- Instructor machine integrity and local data.
- Instructor-only control path (start/stop/reveal/leaderboard flows).
- Session tokens, instructor keys, and any exported attendance/submission data.
- Availability of quiz service during class time.

### Adversaries and likely attack paths

1. Internet opportunistic attackers
   - Scan public Funnel endpoints and probe for weak routes.
   - Attempt brute force against instructor key or predictable session identifiers.
2. Token/key leakage scenarios
   - Instructor URL or key leaked in screenshots, screen shares, chat, or browser history sync.
   - Secrets exposed through shell history, logs, or copied environment files.
3. Abuse and spam actors
   - Bot joins that flood participant lists or submit junk payloads.
   - Repeated reconnects to stress state transitions and socket handling.
4. Denial attempts
   - Burst request floods targeting join/submit endpoints.
   - Long-lived connection pressure causing resource exhaustion.

### Impact areas

- Confidentiality: instructor controls and private class data disclosure.
- Integrity: unauthorized state transitions, fake submissions, corrupted attendance records.
- Availability: degraded or unavailable service during class.
- Host compromise blast radius: attacker pivot from app process into instructor workstation.

## Prioritized hardening controls (impact vs effort)

### P0: high impact, low to medium effort

1. Isolate runtime in Docker with least privilege
   - Run app as non-root user.
   - Use read-only root filesystem, tmpfs for writable paths, and no host Docker socket.
   - Bind only required port to localhost, publish externally via Funnel path only.
2. Secret hygiene for instructor key and tokens
   - Move secrets to environment file not committed to git.
   - Rotate instructor key before each major teaching block.
   - Never include key in query strings that may be logged.
3. Basic edge abuse controls
   - Rate limiting on join and submit operations.
   - Request body size limits and socket connection caps per IP/session.
4. Safe default visibility
   - Student-facing URL never includes instructor route hints.
   - Instructor URL handling process that avoids projector exposure.

### P1: high impact, medium effort

1. Auth hardening for instructor actions
   - Time-bounded instructor session token after key validation.
   - Optional second factor via one-time code at class start.
2. Monitoring and alerting baseline
   - Structured logs with redaction, plus anomaly counters (join bursts, submit bursts, failed auth).
   - Lightweight alert threshold for abnormal spikes before class starts.
3. Resilience tuning
   - Connection timeout tuning, backpressure, and queue limits to prevent memory blowups.

### P2: medium impact, medium to high effort

1. Reverse proxy tier in front of app container
   - Add explicit allow/deny policies, stricter headers, and request normalization.
2. Session abuse detection
   - Duplicate-pattern detection for scripted spam behavior.
3. Hardened host baseline
   - Dedicated instructor profile, minimal local privileges, disk encryption checks, and update cadence.

## Docker hosting guidance (isolate instructor machine risk)

### Security objectives for container hosting

- Treat MDQ as untrusted internet-facing workload.
- Reduce host attack surface and prevent lateral movement to instructor desktop data.
- Enable fast replacement of runtime between classes.

### Recommended topology

1. Run MDQ in a dedicated container on a dedicated Docker network.
2. Keep persistent quiz exports in an explicit mounted data directory only.
3. Expose only one application port; map host port to localhost.
4. Publish external access through Tailscale Funnel, not by opening firewall inbound rules.

### Container hardening requirements

- Use pinned base image tags and rebuild on security updates.
- `USER` non-root, drop Linux capabilities, `no-new-privileges`.
- `read_only: true`, explicit writable mounts only where required.
- CPU/memory/pids limits to reduce denial blast radius.
- Healthcheck for quick restart on failure.
- Secrets injected at runtime (env file or Docker secrets), never baked into image.

### Example review checklist for Docker Compose settings

- `user` set to non-root UID/GID.
- `read_only` enabled.
- `cap_drop: ["ALL"]` with no unnecessary add-backs.
- `security_opt: ["no-new-privileges:true"]`.
- `pids_limit`, `mem_limit`, and `cpus` defined.
- Mounts limited to data export directory and marked least-privilege.
- Logging driver/options configured with rotation.

## Operational runbook: class-day checklist

### T-30 minutes (pre-flight)

- Verify container image digest matches reviewed build.
- Confirm instructor key rotated as planned and loaded from secure env file.
- Start stack and run smoke checks (join, submit, reveal, leaderboard).
- Validate Funnel URL and instructor route are reachable only through intended path.
- Confirm logs redact secrets and rotate correctly.

### T-10 minutes (presentation safety)

- Open student URL and instructor URL in separate browser contexts.
- Enable iPad presentation safeguards to avoid URL exposure.
- Keep instructor controls in non-shared window/screen.
- Confirm resource usage is stable under quick burst test.

### During class

- Monitor join/submission rate spikes.
- Watch for repeated failed instructor auth attempts.
- If abuse begins, apply pre-defined mitigation (throttle, temporarily pause joins, rotate path/key).

### Post class

- Export CSV and verify expected row counts.
- Stop container and archive logs.
- Rotate instructor key if any suspicious event occurred.

## Rollback and incident response

### Rollback plan

1. Keep last known-good image tag and compose file revision.
2. If instability occurs, stop current container and redeploy known-good stack.
3. Revalidate smoke path before reopening to students.

### Incident response workflow

1. Detect and triage
   - Classify event: auth abuse, spam flood, service degradation, suspected compromise.
2. Contain
   - Rotate instructor key, suspend new joins if needed, and isolate affected container.
3. Preserve evidence
   - Save logs, timestamps, source IP summaries, and impacted session IDs.
4. Recover
   - Redeploy clean container from trusted image, restore service, verify integrity.
5. Post-incident actions
   - Document root cause, control gaps, and concrete remediation owners/timelines.

## Review checklist (fast vetting)

Use this checklist to approve or request revisions quickly:

1. Threat model coverage
   - Internet attack, token leakage, abuse/spam, and denial attempts are explicitly addressed.
2. Prioritization quality
   - P0/P1/P2 controls are realistic for teaching operations and ordered by impact/effort.
3. Docker isolation clarity
   - Container boundaries and least-privilege controls are specific enough to implement.
4. Runbook usability
   - Pre-flight, in-class, and post-class actions are concise and executable.
5. Incident readiness
   - Rollback and response steps are actionable within classroom time pressure.
6. Scope discipline
   - Plan-only, no unintended production behavior or codepath changes.

## Proposed execution sequence after plan approval

1. Implement Docker isolation baseline and secret handling controls.
2. Add rate limits and abuse protections.
3. Add monitoring counters and class-day alert thresholds.
4. Run tabletop incident drill and update runbook.
