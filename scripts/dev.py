"""Foreground supervisor. Ctrl+C stops only the processes started by this script."""
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
commands = [
    ([str(root / '.venv/bin/python'), '-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', '8000', '--reload'], root),
    (['npm', 'run', 'dev'], root / 'frontend'),
]
children = []


def stop(_signal=None, _frame=None, *, exit_code=0):
    for process in children:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
    for process in children:
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
    sys.exit(exit_code)


signal.signal(signal.SIGINT, stop)
signal.signal(signal.SIGTERM, stop)
try:
    for command, directory in commands:
        children.append(subprocess.Popen(command, cwd=directory, start_new_session=True))
    while all(process.poll() is None for process in children):
        time.sleep(.5)
    failed = next(process.returncode for process in children if process.poll() is not None)
    stop(exit_code=failed)
except OSError as exc:
    print(f'Could not start development services: {exc}', file=sys.stderr)
    stop(exit_code=1)
