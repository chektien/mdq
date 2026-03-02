#!/usr/bin/env bash
# scripts/verify.sh -- One-command quality gate for md-quiz.
# Runs lint, typecheck, build, unit tests, e2e tests, and load smoke.
# Exit code 0 = all pass, non-zero = failure.
#
# Usage:
#   ./scripts/verify.sh          # full suite
#   ./scripts/verify.sh --quick  # skip load smoke
#   LOAD_STUDENTS=50 ./scripts/verify.sh  # custom load param

set -euo pipefail
cd "$(dirname "$0")/.."

QUICK=false
if [[ "${1:-}" == "--quick" ]]; then
  QUICK=true
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}----${NC} $1"; }

# ── 1. Lint ──
info "Running ESLint..."
npm run lint || fail "ESLint"
pass "ESLint"

# ── 2. Typecheck ──
info "Running TypeScript type check..."
npm run typecheck || fail "TypeScript"
pass "TypeScript"

# ── 3. Build ──
info "Building all packages..."
npm run build || fail "Build"
pass "Build"

# ── 4. Unit + integration tests ──
info "Running unit and integration tests..."
npm run test -- --forceExit --detectOpenHandles || fail "Tests"
pass "Tests"

# ── 5. E2E lifecycle test (included in test suite above) ──
# The e2e-lifecycle.test.ts runs as part of the server test suite.
# If you want to run it separately:
# npx jest --testPathPattern e2e-lifecycle --forceExit --detectOpenHandles

# ── 6. Load smoke (optional) ──
if [[ "$QUICK" == "false" ]]; then
  STUDENTS="${LOAD_STUDENTS:-20}"
  info "Running load smoke test (${STUDENTS} students)..."
  LOAD_STUDENTS="$STUDENTS" npx jest --testPathPattern load-smoke --forceExit --detectOpenHandles --no-coverage --config packages/server/jest.config.js 2>&1 || fail "Load smoke"
  pass "Load smoke (${STUDENTS} students)"
else
  info "Skipping load smoke (--quick mode)"
fi

echo ""
echo -e "${GREEN}All quality gates passed.${NC}"
