#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

STUDENTS="${LOAD_STUDENTS:-35}"
COOLDOWN_SECONDS="${VERIFY_LIVE_COOLDOWN_SECONDS:-1}"
CURRENT_STEP="init"

on_error() {
  local exit_code=$?
  echo "[live-readiness] FAILED at step: ${CURRENT_STEP}" >&2
  echo "[live-readiness] Hint: if this follows another run, wait a few seconds and retry to allow socket/process cleanup." >&2
  exit "$exit_code"
}

trap on_error ERR

run_step() {
  CURRENT_STEP="$1"
  shift
  echo "[live-readiness] ${CURRENT_STEP}"
  "$@"
}

cooldown() {
  if [ "$COOLDOWN_SECONDS" -gt 0 ]; then
    sleep "$COOLDOWN_SECONDS"
  fi
}

run_step "Running targeted live E2E regression (serial)" npx jest --runInBand --testPathPattern e2e-live-readiness --forceExit --detectOpenHandles --config packages/server/jest.config.js
cooldown

run_step "Running full server suite" npm run test --workspace @mdq/server
cooldown

run_step "Building client" npm run build --workspace @mdq/client

run_step "Running classroom load smoke (${STUDENTS} students, serial)" env LOAD_STUDENTS="$STUDENTS" npx jest --runInBand --testPathPattern load-smoke --forceExit --detectOpenHandles --config packages/server/jest.config.js

echo "[live-readiness] All checks passed"
