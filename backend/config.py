"""Server configuration. Provider credentials never enter browser responses."""
import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


@dataclass
class Config:
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
