#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/data"
DECK_DIR="$DATA_DIR/decks"
LEGACY_QUIZ_DIR="$DATA_DIR/quizzes"
SAMPLES_DIR="$ROOT_DIR/samples/decks"
SAMPLE_IMAGES_DIR="$ROOT_DIR/samples/images"
IMAGE_DIR="$DATA_DIR/images"
SAMPLE_QUIZ="$SAMPLES_DIR/week00.md"

mkdir -p "$DECK_DIR" "$IMAGE_DIR" "$DATA_DIR/sessions" "$DATA_DIR/submissions" "$DATA_DIR/winners" "$DATA_DIR/access"

if [[ -f "$SAMPLE_QUIZ" ]]; then
  if [[ -f "$DECK_DIR/week00.md" ]]; then
    echo "Sample smoke deck already exists in data/decks/week00.md."
  else
    cp "$SAMPLE_QUIZ" "$DECK_DIR/week00.md"
    echo "Copied sample smoke deck to data/decks/week00.md."
  fi
else
  echo "No sample smoke deck found in samples/decks/week00.md."
fi

if [[ -d "$LEGACY_QUIZ_DIR" ]]; then
  echo "Legacy data/quizzes/ exists. MDQ will still read it if data/decks/ is absent, or you can set deckDir/MDQ_DECK_DIR explicitly."
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
- Editable decks: data/decks/ (ships with sample week00.md)
- Deck images: data/images/
- Runtime output: data/sessions/, data/submissions/, data/winners/, data/access/
- Optional local config: copy data/config.example.json to data/config.json
EOF
