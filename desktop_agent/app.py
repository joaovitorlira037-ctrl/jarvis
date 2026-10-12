"""Run on the user's computer, not the cloud machine. No arbitrary shell or file deletion."""
import hmac
import json
import os
import shutil
import subprocess
import webbrowser
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

from backend.telemetry import snapshot


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    arguments: dict


def create_agent(token=None, policy=None):
    token = token if token is not None else os.getenv("DESKTOP_AGENT_TOKEN", "")
    if len(token) < 24:
        raise RuntimeError("Set a unique DESKTOP_AGENT_TOKEN of at least 24 characters on both servers.")
    if policy is None:
        path = Path(os.getenv("DESKTOP_AGENT_POLICY", "desktop_agent/agent.json"))
        policy = json.loads(path.read_text()) if path.exists() else {"applications": {}, "allowed_website_hosts": []}
    app = FastAPI(title="JARVIS local agent", docs_url=None, redoc_url=None)

    @app.middleware("http")
    async def no_browser(request: Request, call_next):
        # Browser callers are never allowed to invoke the local agent directly.
        if request.headers.get("origin"):
            return JSONResponse({"detail": "Only a paired backend may access the agent."}, status_code=403)
        return await call_next(request)

    def authenticate(authorization):
        if not hmac.compare_digest(authorization or "", f"Bearer {token}"):
            raise HTTPException(401, "Pairing token required.")

    @app.get("/diagnostics")
    async def diagnostics(authorization: str | None = Header(default=None)):
        authenticate(authorization)
        return {**snapshot(), "source": "desktop_agent"}

    @app.post("/execute")
    async def execute(command: Command, authorization: str | None = Header(default=None)):
        authenticate(authorization)
        if command.name == "launch_application":
            if set(command.arguments) != {"application"}:
                raise HTTPException(422, "Invalid arguments.")
            name = command.arguments["application"]
            if not isinstance(name, str):
                raise HTTPException(422, "Invalid application.")
            argv = policy.get("applications", {}).get(name)
            if not isinstance(argv, list) or not argv or not all(isinstance(x, str) for x in argv):
                raise HTTPException(403, "Application not allowed in the local policy.")
            executable = shutil.which(argv[0])
            if not executable:
                raise HTTPException(404, "Application is not installed.")
            try:
                process = subprocess.Popen([executable, *argv[1:]], shell=False, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except OSError as exc:
                raise HTTPException(502, "Application launch failed.") from exc
            return {"status": "success", "result": {"application": name, "pid": process.pid, "message": "Process started. Window readiness has not been verified."}}
        if command.name == "open_website":
            if set(command.arguments) != {"url"} or not isinstance(command.arguments["url"], str):
                raise HTTPException(422, "Invalid arguments.")
            url = command.arguments["url"]
            try:
                parsed = urlparse(url)
                port = parsed.port
            except ValueError as exc:
                raise HTTPException(422, "Invalid URL.") from exc
            if parsed.scheme != "https" or parsed.username or parsed.password or port not in {None, 443} or parsed.hostname not in policy.get("allowed_website_hosts", []):
                raise HTTPException(403, "Website not allowed by the local policy.")
            if not webbrowser.open(url):
                raise HTTPException(502, "Browser did not accept the request.")
            return {"status": "success", "result": {"url": url, "message": "OS browser accepted the request; page load has not been verified."}}
        raise HTTPException(403, "Command is not on the allowlist.")

    return app
