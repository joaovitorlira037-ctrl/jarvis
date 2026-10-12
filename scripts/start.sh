#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
if [ ! -f frontend/dist/index.html ]; then
  printf '%s\n' 'Run bash scripts/install.sh first.' >&2
  exit 1
fi
# Compiled UI and APIs share one origin. Keep loopback binding; use a secured
# reverse proxy and JARVIS_ACCESS_TOKEN for access beyond this machine.
exec .venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port "${JARVIS_PORT:-8000}"
