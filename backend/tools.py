"""Strict registry. The LLM cannot execute shell commands or bypass confirmations."""
import asyncio
import json
import time
from datetime import datetime
from urllib.parse import urlparse
from uuid import uuid4

import httpx
from pydantic import Field

from .models import MemoryInput, StrictModel, TaskInput
from .telemetry import snapshot


class Empty(StrictModel):
    pass


class Launch(StrictModel):
    application: str = Field(min_length=1, max_length=60)


class Website(StrictModel):
    url: str = Field(min_length=1, max_length=2000)


REGISTRY = {
    "get_time": ("Get the current server time, including UTC offset. Never invent a time.", Empty, False),
    "system_diagnostics": ("Get real telemetry for the backend host, NOT the user's personal computer.", Empty, False),
    "list_tasks": ("List the user's saved tasks and reminders.", Empty, False),
    "create_task": ("Create a task/reminder. due_at must be ISO 8601 with an explicit timezone, or null.", TaskInput, False),
    "save_memory": ("Propose saving a note or preference. Always requires the user's explicit confirmation.", MemoryInput, True),
    "launch_application": ("Propose launching a named application on the paired desktop agent. Requires confirmation.", Launch, True),
    "open_website": ("Propose opening an HTTPS website on the paired desktop agent. Requires confirmation.", Website, True),
    "desktop_diagnostics": ("Read the user's actual computer diagnostics from the paired local agent. Use only when desktop permissions are enabled.", Empty, False),
}


class Tools:
    def __init__(self, store, config, client):
        self.store, self.config, self.client = store, config, client
        self.pending = {}
        self.decision_lock = asyncio.Lock()

    def schemas(self):
        if not self.store.preferences().tools_enabled:
            return []
        desktop = self.store.preferences().desktop_enabled and bool(self.config.agent_token)
        return [{"type": "function", "function": {"name": name, "description": description, "parameters": model.model_json_schema()}} for name, (description, model, _) in REGISTRY.items() if desktop or name not in {"launch_application", "open_website", "desktop_diagnostics"}]

    async def run(self, name, arguments):
        if not self.store.preferences().tools_enabled:
            return {"status": "denied", "message": "As ferramentas estão desativadas nas preferências."}
        if name not in REGISTRY:
            self.store.audit("unknown_tool", "denied", "Ferramenta fora da lista permitida")
            return {"status": "denied", "message": "Ferramenta não permitida."}
        _, model, confirmation = REGISTRY[name]
        try:
            args = model.model_validate_json(arguments).model_dump(mode="json")
        except ValueError:
            self.store.audit(name, "denied", "Parâmetros inválidos")
            return {"status": "denied", "message": "Parâmetros inválidos."}
        if name in {"launch_application", "open_website", "desktop_diagnostics"} and not self.store.preferences().desktop_enabled:
            return {"status": "denied", "message": "O agente de desktop está desativado."}
        if confirmation:
            self.pending = {key: value for key, value in self.pending.items() if value["expires"] > time.time()}
            if len(self.pending) >= 20:
                return {"status": "denied", "message": "Há muitas ações pendentes. Revise-as primeiro."}
            id = uuid4().hex
            self.pending[id] = {"name": name, "arguments": args, "expires": time.time() + 300}
            self.store.audit(name, "pending", "Aguardando autorização explícita")
            return {"status": "pending", "id": id, "name": name, "arguments": args, "message": "Ação proposta. Ainda não executada; requer aprovação no painel."}
        return await self.execute(name, args)

    async def decide(self, id, approved):
        async with self.decision_lock:
            action = self.pending.pop(id, None)
            if not action or action["expires"] < time.time():
                return {"status": "expired", "message": "Esta autorização expirou ou já foi usada."}
            if not approved:
                self.store.audit(action["name"], "denied", "Usuário recusou a ação")
                return {"status": "denied", "message": "Ação recusada."}
            if not self.store.preferences().tools_enabled:
                return {"status": "denied", "message": "As ferramentas foram desativadas."}
            return await self.execute(action["name"], action["arguments"])

    async def execute(self, name, args):
        if name == "get_time":
            result = {"time": datetime.now().astimezone().isoformat(), "source": "backend_host"}
        elif name == "system_diagnostics":
            result = snapshot()
        elif name == "list_tasks":
            result = self.store.tasks()
        elif name == "create_task":
            result = self.store.add_task(args["title"], args["due_at"])
        elif name == "save_memory":
            result = self.store.add_memory(args["content"], args["category"])
        elif name in {"launch_application", "open_website", "desktop_diagnostics"}:
            if not self.config.agent_token or not self.store.preferences().desktop_enabled:
                return {"status": "denied", "message": "Conecte e habilite o agente de desktop."}
            parsed = urlparse(self.config.agent_url)
            if parsed.scheme != "https" and not (parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}):
                return {"status": "denied", "message": "O agente remoto exige HTTPS."}
            try:
                if name == 'desktop_diagnostics':
                    response = await self.client.get(f"{self.config.agent_url.rstrip('/')}/diagnostics", headers={"Authorization": f"Bearer {self.config.agent_token}"}, timeout=10)
                else:
                    response = await self.client.post(f"{self.config.agent_url.rstrip('/')}/execute", headers={"Authorization": f"Bearer {self.config.agent_token}"}, json={"name": name, "arguments": args}, timeout=10)
                if not response.is_success:
                    self.store.audit(name, "error", "O agente recusou a operação")
                    return {"status": "error", "message": "O agente recusou a operação. Verifique sua lista de permissões."}
                result = response.json()
                if name != 'desktop_diagnostics' and result.get("status") != "success":
                    return result
            except (httpx.HTTPError, ValueError):
                self.store.audit(name, "error", "Agente indisponível")
                return {"status": "error", "message": "O agente local não está acessível. Nenhuma ação foi confirmada."}
        else:
            return {"status": "denied", "message": "Ferramenta não permitida."}
        self.store.audit(name, "success", "Operação concluída pela ferramenta")
        return {"status": "success", "result": result}
