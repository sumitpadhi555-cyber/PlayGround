#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
WEB_META_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
PORT="${PORT:-3000}"
WEB_SRC="$PROJECT_DIR/web"
DIST="$PROJECT_DIR/dist"
META_FILE="$WEB_META_DIR/deployment-output.json"

stamp() { printf '[start] %s\n' "$*"; }
run() { stamp "$*"; /usr/bin/time -p "$@"; }

run test -d "$PROJECT_DIR"
run test -f "$WEB_SRC/index.html"

if [[ -f "$PROJECT_DIR/package.json" ]]; then
  if [[ -f "$PROJECT_DIR/package-lock.json" ]]; then
    run npm ci --no-audit --no-fund
  else
    run npm install --no-audit --no-fund
  fi
  run npm run build
fi

run rm -rf "$DIST"
run mkdir -p "$DIST"
run cp -R "$WEB_SRC/." "$DIST/"
run test -f "$DIST/index.html"

run mkdir -p "$WEB_META_DIR"
stamp "write $META_FILE"
/usr/bin/time -p node -e 'const fs = require("fs"); fs.writeFileSync(process.argv[1], JSON.stringify({ project: process.argv[2], directory: process.argv[3] }))' "$META_FILE" "$PROJECT_DIR" "$DIST"
run test -s "$META_FILE"

stamp "serving $DIST on 0.0.0.0:$PORT"
exec /usr/bin/time -p python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$DIST"
