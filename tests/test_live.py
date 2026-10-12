"""Real calls are separate from mocked contract tests. No keys in test output."""
import os

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import Config


@pytest.mark.live
@pytest.mark.skipif(not (os.getenv('GROQ_API_KEY') and os.getenv('FISH_AUDIO_API_KEY')), reason='Real Groq/Fish credentials are not configured')
def test_real_groq_reply_and_fish_mp3(tmp_path):
    config = Config(data_dir=tmp_path)
    with TestClient(create_app(config)) as client:
        assert client.post('/api/providers/groq/check').status_code == 200
        response = client.post('/api/chat', json={'message': 'Reply in Portuguese with one short sentence: are you online?'})
        import json
        events = [json.loads(line) for line in response.text.splitlines()]
        answer = next(e['text'] for e in events if e['type'] == 'done')
        speech = client.post('/api/speech', json={'text': answer})
        assert speech.status_code == 200
        assert speech.headers['content-type'] == 'audio/mpeg'
        assert len(speech.content) > 1000
