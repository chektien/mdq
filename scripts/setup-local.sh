#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/data"
QUIZ_DIR="$DATA_DIR/quizzes"
SAMPLES_DIR="$ROOT_DIR/samples/quizzes"

mkdir -p "$QUIZ_DIR" "$DATA_DIR/sessions" "$DATA_DIR/submissions" "$DATA_DIR/winners" "$DATA_DIR/access"

if compgen -G "$QUIZ_DIR/week*.md" > /dev/null; then
  echo "Local quizzes already exist in data/quizzes. Skipping sample copy."
else
  if compgen -G "$SAMPLES_DIR/week*.md" > /dev/null; then
    cp "$SAMPLES_DIR"/week*.md "$QUIZ_DIR/"
    echo "Copied sample quizzes from samples/quizzes to data/quizzes."
  else
    echo "No sample quizzes found in samples/quizzes."
  fi
fi

cat <<EOF
Local workspace is ready.
- Editable quizzes: data/quizzes/
- Runtime output: data/sessions/, data/submissions/, data/winners/, data/access/
- Optional local config: copy data/config.example.json to data/config.json
EOF
