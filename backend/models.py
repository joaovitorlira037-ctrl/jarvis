from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Preferences(StrictModel):
    assistant_name: str = Field(default="J.A.R.V.I.S.", min_length=1, max_length=40)
    preferred_name: str = Field(default="", max_length=60)
    language: Literal["auto", "pt-BR", "en-US"] = "auto"
    formality: Literal["polite", "casual", "formal"] = "polite"
    speech_enabled: bool = True
    speech_speed: float = Field(default=1.0, ge=0.5, le=1.5)
    animation: Literal["full", "reduced"] = "full"
    accent: Literal["cyan", "blue", "amber"] = "cyan"
    save_history: bool = True
    wake_enabled: bool = False
    wake_phrase: str = Field(default="Hey Jarvis", min_length=1, max_length=60)
    input_device: str = Field(default="", max_length=200)
    output_device: str = Field(default="", max_length=200)
    desktop_enabled: bool = False
    tools_enabled: bool = True


class ChatRequest(StrictModel):
    message: str = Field(min_length=1, max_length=8000)

    @field_validator("message")
    @classmethod
    def nonempty(cls, value: str):
        if not value.strip():
            raise ValueError("Message cannot be blank")
        return value.strip()


class SpeechRequest(StrictModel):
    text: str = Field(min_length=1, max_length=8000)


class TaskInput(StrictModel):
    title: str = Field(min_length=1, max_length=240)
    due_at: datetime | None = None

    @field_validator("due_at")
    @classmethod
    def timezone_required(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("Use a timezone-aware datetime")
        return value

    @field_validator("title")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("Title cannot be blank")
        return value.strip()


class TaskUpdate(StrictModel):
    done: bool


class MemoryInput(StrictModel):
    content: str = Field(min_length=1, max_length=2000)
    category: Literal["note", "preference"] = "note"

    @field_validator("content")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("Memory cannot be blank")
        return value.strip()


class Decision(StrictModel):
    approved: bool


class Login(StrictModel):
    token: str = Field(min_length=1, max_length=512)
