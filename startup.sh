#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

stamp() { printf '[startup] %s\n' "$*"; }
run() { stamp "$*"; /usr/bin/time -p "$@"; }

run test -d "$PROJECT_DIR"
run test -f "$PROJECT_DIR/start.sh"
run test -f "$PROJECT_DIR/web/index.html"
run python3 -c 'import http.server, socketserver'
run node --version
