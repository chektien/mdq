#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/data"
QUIZ_DIR="$DATA_DIR/quizzes"
SAMPLES_DIR="$ROOT_DIR/samples/quizzes"
SAMPLE_IMAGES_DIR="$ROOT_DIR/samples/images"
IMAGE_DIR="$DATA_DIR/images"
SAMPLE_QUIZ="$SAMPLES_DIR/week00.md"

mkdir -p "$QUIZ_DIR" "$IMAGE_DIR" "$DATA_DIR/sessions" "$DATA_DIR/submissions" "$DATA_DIR/winners" "$DATA_DIR/access"

if [[ -f "$SAMPLE_QUIZ" ]]; then
  if [[ -f "$QUIZ_DIR/week00.md" ]]; then
    echo "Sample smoke quiz already exists in data/quizzes/week00.md."
  else
    cp "$SAMPLE_QUIZ" "$QUIZ_DIR/week00.md"
    echo "Copied sample smoke quiz to data/quizzes/week00.md."
  fi
else
  echo "No sample smoke quiz found in samples/quizzes/week00.md."
fi

if [[ -d "$SAMPLE_IMAGES_DIR" ]] && compgen -G "$SAMPLE_IMAGES_DIR/*" > /dev/null; then
  for sample_image in "$SAMPLE_IMAGES_DIR"/*; do
    target_image="$IMAGE_DIR/$(basename "$sample_image")"
    if [[ -f "$target_image" ]]; then
      echo "Sample image already exists: data/images/$(basename "$sample_image")"
    else
      cp "$sample_image" "$target_image"
      echo "Copied sample image to data/images/$(basename "$sample_image")"
    fi
  done
fi

cat <<EOF
Local workspace is ready.
- Editable quizzes: data/quizzes/ (ships with sample week00.md)
- Quiz images: data/images/
- Runtime output: data/sessions/, data/submissions/, data/winners/, data/access/
- Optional local config: copy data/config.example.json to data/config.json
EOF
