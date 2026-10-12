import asyncio
import hmac
import json
import logging
import secrets
import time
from contextlib import asynccontextmanager
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Request, Response, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from .config import Config, ROOT
from .models import ChatRequest, Decision, Login, MemoryInput, Preferences, SpeechRequest, TaskInput, TaskUpdate
from .orchestrator import conversation
from .providers import ProviderError, Providers, check_status
from .storage import Store
from .telemetry import snapshot
from .tools import Tools

log = logging.getLogger("jarvis")


def create_app(config=None, transport=None):
    config = config or Config()
    store = Store(config.data_dir)
    session = secrets.token_urlsafe(32)
    attempts = {}

    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(timeout=httpx.Timeout(90, connect=15), transport=transport) as client:
            app.state.providers = Providers(config, client)
            app.state.tools = Tools(store, config, client)
            app.state.client = client
            app.state.chat_lock = asyncio.Lock()
            app.state.verified = set()
            yield

    app = FastAPI(title="J.A.R.V.I.S.", version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store, app.state.config = store, config

    def trusted_origin(origin, host):
        if not origin:
            return True  # Native local clients do not send an Origin header.
        parsed = urlparse(origin)
        return (parsed.scheme in {"http", "https"} and parsed.netloc == host) or (bool(config.public_origin) and origin == config.public_origin)

    @app.middleware("http")
    async def boundaries(request: Request, call_next):
        if not trusted_origin(request.headers.get("origin"), request.headers.get("host")):
            return JSONResponse({"detail": "Origem não autorizada."}, status_code=403)
        length = request.headers.get("content-length", "0")
        if not length.isdigit() or int(length) > 24 * 1024 * 1024:
            return JSONResponse({"detail": "Solicitação muito grande."}, status_code=413)
        if config.access_token and request.url.path.startswith('/api/') and request.url.path not in {"/api/login", "/api/health"}:
            if not hmac.compare_digest(request.cookies.get("jarvis_session", ""), session):
                return JSONResponse({"detail": "Entre com a senha desta instância."}, status_code=401)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(ProviderError)
    async def provider_error(request, exc):
        store.audit(f"provider_{exc.provider}", "error", exc.message)
        return JSONResponse({"detail": exc.message, "provider": exc.provider}, status_code=exc.status if exc.status in {401, 403, 404, 422, 429, 503} else 502)

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "version": "1.0.0"}

    @app.post("/api/login")
    async def login(payload: Login, request: Request, response: Response):
        ip = request.client.host if request.client else "unknown"
        recent = [t for t in attempts.get(ip, []) if t > time.time() - 60]
        if len(recent) >= 6:
            raise HTTPException(429, "Aguarde um minuto antes de tentar novamente.")
        attempts[ip] = recent + [time.time()]
        if not config.access_token or not hmac.compare_digest(payload.token, config.access_token):
            raise HTTPException(401, "Senha inválida.")
        response.set_cookie("jarvis_session", session, httponly=True, samesite="strict", secure=config.public_origin.startswith("https://"), max_age=86400)
        return {"status": "ok"}

    @app.post("/api/logout")
    async def logout(response: Response):
        response.delete_cookie("jarvis_session")
        return {"status": "ok"}

    @app.get("/api/status")
    async def status():
        def state(name, key):
            return "verified" if name in app.state.verified else "configured" if key else "missing"
        return {"groq": {"status": state("groq", config.groq_key), "model": config.groq_model}, "fish": {"status": state("fish", config.fish_key), "model": config.fish_model, "voice_id": config.fish_voice}, "desktop": {"configured": bool(config.agent_token), "enabled": store.preferences().desktop_enabled}, "telemetry_source": "backend_host", "authenticated": bool(config.access_token)}

    @app.post("/api/providers/groq/check")
    async def verify_groq():
        if not config.groq_key:
            raise ProviderError("groq", 503, "Configure GROQ_API_KEY no servidor.")
        try:
            response = await app.state.client.get("https://api.groq.com/openai/v1/models", headers={"Authorization": f"Bearer {config.groq_key}"})
            check_status(response, "groq")
            ids = {m["id"] for m in response.json().get("data", [])}
            if config.groq_model not in ids:
                raise ProviderError("groq", 404, "O modelo Groq configurado não está disponível nesta conta.")
            app.state.verified.add("groq")
            return {"status": "verified", "model": config.groq_model}
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderError("groq", 502, "Falha ao verificar a conexão com Groq.") from exc

    @app.get("/api/telemetry")
    async def telemetry():
        return snapshot()

    @app.websocket("/ws/telemetry")
    async def telemetry_ws(websocket: WebSocket):
        if not trusted_origin(websocket.headers.get("origin"), websocket.headers.get("host")) or (config.access_token and not hmac.compare_digest(websocket.cookies.get("jarvis_session", ""), session)):
            await websocket.close(code=1008)
            return
        await websocket.accept()
        try:
            while True:
                await websocket.send_json(snapshot())
                await asyncio.sleep(2)
        except (WebSocketDisconnect, RuntimeError):
            pass

    @app.get("/api/settings")
    async def get_settings():
        return store.preferences()

    @app.put("/api/settings")
    async def put_settings(value: Preferences):
        if value.desktop_enabled and not config.agent_token:
            raise HTTPException(422, "Configure o pareamento do agente no servidor antes de habilitá-lo.")
        store.set_preferences(value)
        store.audit("settings", "success", "Preferências atualizadas")
        return value

    @app.get("/api/messages")
    async def messages():
        return store.messages() if store.preferences().save_history else []

    @app.delete("/api/messages")
    async def clear_messages():
        if app.state.chat_lock.locked():
            raise HTTPException(409, "Interrompa a resposta antes de apagar o histórico.")
        store.clear_messages()
        store.audit("clear_history", "success", "Histórico apagado pelo usuário")
        return {"status": "ok"}

    @app.post("/api/chat")
    async def chat(payload: ChatRequest):
        if not config.groq_key:
            raise ProviderError("groq", 503, "Configure GROQ_API_KEY nas configurações do ambiente para conversar com JARVIS.")
        if app.state.chat_lock.locked():
            raise HTTPException(409, "Uma resposta já está em andamento. Interrompa-a primeiro.")
        await app.state.chat_lock.acquire()

        async def events():
            try:
                async for event in conversation(store, app.state.providers, app.state.tools, payload.message):
                    if event["type"] == "done":
                        app.state.verified.add("groq")
                    yield json.dumps(event, ensure_ascii=False) + "\n"
            except ProviderError as exc:
                store.audit(f"provider_{exc.provider}", "error", exc.message)
                yield json.dumps({"type": "error", "message": exc.message}, ensure_ascii=False) + "\n"
            except Exception:
                # Do not log provider bodies, headers, keys or user conversation contents.
                log.error(json.dumps({"event": "conversation_failure", "status": "error"}))
                store.audit("conversation", "error", "Falha interna na conversa")
                yield json.dumps({"type": "error", "message": "Não foi possível concluir a conversa. Tente novamente."}) + "\n"
            finally:
                app.state.chat_lock.release()

        return StreamingResponse(events(), media_type="application/x-ndjson", headers={"X-Accel-Buffering": "no"})

    @app.post("/api/transcribe")
    async def transcribe(file: UploadFile):
        allowed = {"audio/webm", "audio/ogg", "audio/wav", "audio/mpeg", "audio/mp4", "audio/x-wav", "video/webm"}
        media = (file.content_type or "").split(";")[0]
        if media not in allowed:
            raise HTTPException(415, "Formato de áudio não suportado.")
        audio = await file.read(20 * 1024 * 1024 + 1)
        await file.close()
        if not audio or len(audio) > 20 * 1024 * 1024:
            raise HTTPException(413, "Envie um áudio de até 20 MB.")
        text = await app.state.providers.transcribe(audio, "recording." + {"audio/ogg": "ogg", "audio/mp4": "mp4", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3"}.get(media, "webm"), media, store.preferences().language)
        return {"text": text}

    @app.post("/api/speech")
    async def speech(payload: SpeechRequest):
        remote = await app.state.providers.speech(payload.text, store.preferences().speech_speed)

        async def audio():
            try:
                async for chunk in remote.aiter_bytes():
                    yield chunk
            finally:
                await remote.aclose()
        app.state.verified.add("fish")
        return StreamingResponse(audio(), media_type="audio/mpeg")

    @app.get("/api/tasks")
    async def tasks():
        return store.tasks()

    @app.post("/api/tasks", status_code=201)
    async def create_task(payload: TaskInput):
        return store.add_task(payload.title, payload.due_at.isoformat() if payload.due_at else None)

    @app.patch("/api/tasks/{id}")
    async def update_task(id: str, payload: TaskUpdate):
        if not store.update_task(id, payload.done):
            raise HTTPException(404, "Tarefa não encontrada.")
        store.audit("update_task", "success", "Tarefa atualizada")
        return {"status": "ok"}

    @app.delete("/api/tasks/{id}")
    async def delete_task(id: str):
        if not store.delete("tasks", id):
            raise HTTPException(404, "Tarefa não encontrada.")
        store.audit("delete_task", "success", "Tarefa removida pelo usuário")
        return {"status": "ok"}

    @app.get("/api/memories")
    async def memories():
        return store.memories()

    @app.post("/api/memories", status_code=201)
    async def create_memory(payload: MemoryInput):
        return store.add_memory(payload.content, payload.category)

    @app.put("/api/memories/{id}")
    async def update_memory(id: str, payload: MemoryInput):
        if not store.update_memory(id, payload.content, payload.category):
            raise HTTPException(404, "Memória não encontrada.")
        return {"status": "ok"}

    @app.delete("/api/memories/{id}")
    async def delete_memory(id: str):
        if not store.delete("memories", id):
            raise HTTPException(404, "Memória não encontrada.")
        store.audit("delete_memory", "success", "Memória removida pelo usuário")
        return {"status": "ok"}

    @app.get("/api/activity")
    async def activity():
        return store.activity()

    @app.post("/api/actions/{id}/decision")
    async def action_decision(id: str, payload: Decision):
        return await app.state.tools.decide(id, payload.approved)

    @app.get('/{path:path}', include_in_schema=False)
    async def frontend(path: str):
        if path.startswith(('api/', 'ws/')):
            raise HTTPException(404, 'Rota não encontrada.')
        dist = (ROOT / 'frontend' / 'dist').resolve()
        candidate = (dist / path).resolve()
        if not candidate.is_relative_to(dist) or any(part.startswith('.') for part in path.split('/') if part):
            raise HTTPException(404, 'Arquivo não encontrado.')
        if candidate.is_file():
            return FileResponse(candidate)
        if path in {'', 'memory', 'activity', 'tasks', 'settings'} and (dist / 'index.html').is_file():
            return FileResponse(dist / 'index.html')
        raise HTTPException(404, 'Execute o build do frontend ou use o servidor Vite de desenvolvimento.')

    return app


app = create_app()
