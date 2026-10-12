"""Server configuration. Provider credentials never enter browser responses."""
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]


def load_environment(path: Path):
    # Windows editors may prefix UTF-8 files with a BOM. Preserve injected
    # environment bindings; an existing binding always takes precedence.
    load_dotenv(path, encoding="utf-8-sig", override=False)


load_environment(ROOT / ".env")


@dataclass
class Config:
    llm_provider: str = field(default_factory=lambda: os.getenv("LLM_PROVIDER", "openrouter").strip().lower())
    openrouter_key: str = field(default_factory=lambda: os.getenv("OPENROUTER_API_KEY", ""))
    openrouter_model: str = field(default_factory=lambda: os.getenv("OPENROUTER_MODEL", "openrouter/free"))
    stt_provider: str = field(default_factory=lambda: os.getenv("STT_PROVIDER", "browser").strip().lower())
    groq_key: str = field(default_factory=lambda: os.getenv("GROQ_API_KEY", ""))
    groq_model: str = field(default_factory=lambda: os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"))
    transcription_model: str = field(default_factory=lambda: os.getenv("GROQ_TRANSCRIPTION_MODEL", "whisper-large-v3-turbo"))
    fish_key: str = field(default_factory=lambda: os.getenv("FISH_AUDIO_API_KEY", ""))
    fish_voice: str = field(default_factory=lambda: os.getenv("FISH_AUDIO_VOICE_ID", "82d13948027e4be69892dd3d0104e681"))
    fish_model: str = field(default_factory=lambda: os.getenv("FISH_AUDIO_MODEL", "s2.1-pro"))
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("JARVIS_DATA_DIR", str(ROOT / "data"))).resolve())
    access_token: str = field(default_factory=lambda: os.getenv("JARVIS_ACCESS_TOKEN", ""))
    public_origin: str = field(default_factory=lambda: os.getenv("JARVIS_PUBLIC_ORIGIN", "").rstrip("/"))
    agent_url: str = field(default_factory=lambda: os.getenv("DESKTOP_AGENT_URL", "http://127.0.0.1:8765"))
    agent_token: str = field(default_factory=lambda: os.getenv("DESKTOP_AGENT_TOKEN", ""))

    def __post_init__(self):
        if self.llm_provider not in {"openrouter", "groq"}:
            raise ValueError("LLM_PROVIDER precisa ser openrouter ou groq.")
        if self.stt_provider not in {"browser", "groq"}:
            raise ValueError("STT_PROVIDER precisa ser browser ou groq.")

    @property
    def chat_key(self):
        return self.openrouter_key if self.llm_provider == "openrouter" else self.groq_key

    @property
    def chat_key_name(self):
        return "OPENROUTER_API_KEY" if self.llm_provider == "openrouter" else "GROQ_API_KEY"

    @property
    def chat_model(self):
        return self.openrouter_model if self.llm_provider == "openrouter" else self.groq_model

    @property
    def chat_label(self):
        return "OpenRouter" if self.llm_provider == "openrouter" else "Groq"

    @property
    def chat_base(self):
        return "https://openrouter.ai/api/v1" if self.llm_provider == "openrouter" else "https://api.groq.com/openai/v1"
