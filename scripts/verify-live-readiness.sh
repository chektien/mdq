#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "$0")/.."

STUDENTS="${LOAD_STUDENTS:-35}"

echo "[live-readiness] Running targeted live E2E regression"
npm run test:e2e-live

echo "[live-readiness] Running full server suite"
npm run test --workspace @mdq/server

echo "[live-readiness] Building client"
npm run build --workspace @mdq/client

echo "[live-readiness] Running classroom load smoke (${STUDENTS} students)"
LOAD_STUDENTS="$STUDENTS" npm run test:load

echo "[live-readiness] All checks passed"
