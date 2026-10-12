#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
python3 -c 'import sys; assert sys.version_info >= (3, 11), "Python 3.11+ is required"'
node -e 'const v=process.versions.node.split(".").map(Number); if(v[0]<22 || (v[0]===22 && v[1]<12))throw Error("Node 22.12+ is required; Node 24 is recommended")'
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
.venv/bin/python -m pip install --cache-dir /tmp/jarvis-pip-cache -r backend/requirements.txt
npm --prefix frontend ci --cache /tmp/jarvis-npm-cache --no-audit --no-fund
npm --prefix frontend run build
.venv/bin/python -m pytest -q -m 'not live'
