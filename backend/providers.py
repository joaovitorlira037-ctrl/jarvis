"""Groq OpenAI-compatible streaming and Fish Audio MP3. No voice fallback."""
import json
from collections.abc import AsyncIterator

import httpx
import msgpack

from .config import Config


class ProviderError(Exception):
    def __init__(self, provider: str, status: int, message: str):
        self.provider, self.status, self.message = provider, status, message
        super().__init__(message)


def check_status(response: httpx.Response, provider: str):
    if response.is_success:
        return
    messages = {
        401: "Credencial inválida. Verifique a chave nas configurações do servidor.",
        403: "Acesso recusado. Verifique a permissão da conta e a política de rede.",
        404: "Modelo ou referência de voz indisponível para esta conta.",
        422: "O provedor não aceitou o modelo, a voz ou os parâmetros configurados.",
        429: "Limite de uso atingido. Aguarde antes de tentar novamente.",
    }
    raise ProviderError(provider, response.status_code, messages.get(response.status_code, "O provedor não concluiu a solicitação. Verifique o modelo e tente novamente."))


class Providers:
    def __init__(self, config: Config, client: httpx.AsyncClient):
        self.config, self.client = config, client

    async def groq(self, messages: list, tools: list) -> AsyncIterator[dict]:
        if not self.config.groq_key:
            raise ProviderError("groq", 503, "Configure GROQ_API_KEY no servidor para ativar a conversa e a transcrição.")
        payload = {"model": self.config.groq_model, "messages": messages, "stream": True, "temperature": 0.65, "max_tokens": 1800}
        if tools:
            payload.update(tools=tools, tool_choice="auto")
        try:
            async with self.client.stream("POST", "https://api.groq.com/openai/v1/chat/completions", headers={"Authorization": f"Bearer {self.config.groq_key}"}, json=payload) as response:
                check_status(response, "groq")
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            event = json.loads(data)
                            if event.get("error"):
                                raise ProviderError("groq", 502, "Groq interrompeu a resposta. Tente novamente.")
                            choices = event.get("choices", [])
                            if choices:
                                yield choices[0].get("delta", {})
                        except json.JSONDecodeError as exc:
                            raise ProviderError("groq", 502, "O fluxo de resposta do Groq foi interrompido.") from exc
        except httpx.HTTPError as exc:
            raise ProviderError("groq", 502, "Falha de conexão com Groq. Verifique a rede e tente novamente.") from exc

    async def transcribe(self, audio: bytes, filename: str, content_type: str, language: str):
        if not self.config.groq_key:
            raise ProviderError("groq", 503, "Configure GROQ_API_KEY no servidor para transcrever áudio.")
        data = {"model": self.config.transcription_model, "response_format": "json"}
        if language != "auto":
            data["language"] = language.split("-")[0]
        try:
            response = await self.client.post("https://api.groq.com/openai/v1/audio/transcriptions", headers={"Authorization": f"Bearer {self.config.groq_key}"}, data=data, files={"file": (filename, audio, content_type)})
            check_status(response, "groq")
            text = response.json().get("text", "").strip()
            if not text:
                raise ProviderError("groq", 422, "Nenhuma fala foi identificada. Tente novamente.")
            return text
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderError("groq", 502, "Não foi possível transcrever o áudio.") from exc

    async def speech(self, text: str, speed: float):
        if not self.config.fish_key:
            raise ProviderError("fish", 503, "Configure FISH_AUDIO_API_KEY para ativar a voz JARVIS.")
        request = self.client.build_request(
            "POST", "https://api.fish.audio/v1/tts",
            headers={"Authorization": f"Bearer {self.config.fish_key}", "model": self.config.fish_model, "Accept": "audio/mpeg", "Content-Type": "application/msgpack"},
            content=msgpack.packb({"text": text, "reference_id": self.config.fish_voice, "format": "mp3", "latency": "balanced", "prosody": {"speed": speed, "volume": 0}}, use_bin_type=True),
        )
        try:
            response = await self.client.send(request, stream=True)
            try:
                check_status(response, "fish")
                media = response.headers.get("content-type", "").split(";")[0]
                if media not in {"audio/mpeg", "audio/mp3", "application/octet-stream"}:
                    raise ProviderError("fish", 502, "Fish Audio não retornou áudio MP3 válido.")
            except Exception:
                await response.aclose()
                raise
            return response
        except httpx.HTTPError as exc:
            raise ProviderError("fish", 502, "Falha de conexão com Fish Audio. A resposta em texto permanece disponível.") from exc
