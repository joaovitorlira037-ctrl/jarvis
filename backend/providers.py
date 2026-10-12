"""Groq OpenAI-compatible streaming and Fish Audio MP3. No voice fallback."""
import json
import re
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
        402: "Créditos de API insuficientes ou pagamento necessário. Confira o saldo de API da conta.",
        403: "Acesso recusado. Verifique a permissão da conta e a política de rede.",
        422: "O provedor não aceitou o modelo, a voz ou os parâmetros configurados.",
        429: "Limite de uso atingido. Aguarde antes de tentar novamente.",
    }
    if response.status_code == 404:
        message = "O modelo configurado não está disponível. Verifique GROQ_MODEL e os modelos liberados na conta." if provider == "groq" else "O modelo de síntese ou o acesso à voz configurada não está disponível. Verifique FISH_AUDIO_MODEL e FISH_AUDIO_VOICE_ID."
    else:
        message = messages.get(response.status_code, "O provedor não concluiu a solicitação. Verifique o modelo e tente novamente.")
    label = "Groq" if provider == "groq" else "Fish Audio"
    raise ProviderError(provider, response.status_code, f"{label}: {message}")


class Providers:
    def __init__(self, config: Config, client: httpx.AsyncClient):
        self.config, self.client = config, client

    async def check_voice(self):
        if not self.config.fish_key:
            raise ProviderError("fish", 503, "Fish Audio: configure FISH_AUDIO_API_KEY no .env e reinicie o terminal.")
        if not re.fullmatch(r"[a-fA-F0-9]{32}", self.config.fish_voice):
            raise ProviderError("fish", 422, "Fish Audio: FISH_AUDIO_VOICE_ID precisa conter os 32 caracteres do ID da voz, sem URL.")
        try:
            # Official SDK voices.get() uses GET /model/{voice_id}. This is a
            # metadata lookup, not speech generation; synthesis is verified separately.
            response = await self.client.get(f"https://api.fish.audio/model/{self.config.fish_voice}", headers={"Authorization": f"Bearer {self.config.fish_key}"})
            if response.status_code == 404:
                raise ProviderError("fish", 404, "Fish Audio: a referência de voz não foi encontrada ou não está acessível nesta conta. Confira o ID e a permissão de uso dessa voz na Fish Audio.")
            check_status(response, "fish")
            data = response.json()
            if data.get("_id", data.get("id")) != self.config.fish_voice:
                raise ProviderError("fish", 502, "Fish Audio: não foi possível confirmar a identidade da referência de voz.")
            if data.get("type") != "tts" or data.get("state") != "ready":
                raise ProviderError("fish", 422, "Fish Audio: a voz existe, mas ainda não está pronta para síntese de fala.")
            return {"status": "accessible", "voice_id": self.config.fish_voice, "message": "Fish Audio: referência de voz encontrada e pronta. Use Testar voz para verificar o modelo de síntese e o acesso à API de áudio."}
        except (httpx.HTTPError, ValueError, AttributeError) as exc:
            raise ProviderError("fish", 502, "Fish Audio: não foi possível verificar a referência. Confira a conexão e tente novamente.") from exc

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
