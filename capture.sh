#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
RUNTIME_DIR="${RUNTIME_DIR:?RUNTIME_DIR is required}"
URL="${CAPTURE_URL:?Set CAPTURE_URL to the preview URL}"
OUT="${CAPTURE_DIR:?Set CAPTURE_DIR to an output directory outside the project}"

stamp() { printf '[capture] %s\n' "$*"; }
run() { stamp "$*"; /usr/bin/time -p "$@"; }

case "$URL" in
  http://*|https://*) ;;
  *) echo "CAPTURE_URL must start with http:// or https://" >&2; exit 1 ;;
esac

OUT_ABS="$(realpath -m "$OUT")"
PROJECT_ABS="$(realpath -m "$PROJECT_DIR")"
case "$OUT_ABS" in
  "$PROJECT_ABS"|"$PROJECT_ABS"/*)
    echo "CAPTURE_DIR must be outside the project source: $PROJECT_ABS" >&2
    exit 1
    ;;
esac

run test -x "$(command -v node)"
run test -f "$RUNTIME_DIR/scripts/default-capture.mjs"
run mkdir -p "$OUT_ABS"

export CAPTURE_URL="$URL"
export CAPTURE_DIR="$OUT_ABS"
export CAPTURE_READY_SELECTOR="${CAPTURE_READY_SELECTOR:-body}"

set +e
/usr/bin/time -p node "$RUNTIME_DIR/scripts/default-capture.mjs"
code=$?
set -e

if [[ "$code" -ne 0 ]]; then
  exit "$code"
fi

run test -s "$OUT_ABS/final-desktop.png"
run test -s "$OUT_ABS/final-mobile.png"
stamp "captured desktop and mobile screenshots in $OUT_ABS"
