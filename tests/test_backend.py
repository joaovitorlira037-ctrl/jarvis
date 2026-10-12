import json
import time

import httpx
import msgpack
import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import Config
from backend.models import Preferences
from backend.providers import ProviderError
from backend.storage import Store
from backend.tools import Tools


def config(tmp_path, **kwargs):
    return Config(data_dir=tmp_path, groq_key="", fish_key="", agent_token="", access_token="", public_origin="", **kwargs)


def sse(*deltas):
    return ''.join('data: ' + json.dumps({"choices": [{"delta": delta}]}) + '\n\n' for delta in deltas) + 'data: [DONE]\n\n'


def test_real_telemetry_and_no_fake_connections(tmp_path):
    with TestClient(create_app(config(tmp_path))) as client:
        assert client.get('/api/health').json()['status'] == 'ok'
        readings = client.get('/api/telemetry').json()
        assert readings['source'] == 'backend_host'
        assert readings['memory_total'] > 0
        assert 0 <= readings['cpu_percent'] <= 100
        assert readings['gpu_percent'] is None
        assert client.get('/api/status').json()['groq']['status'] == 'missing'
        with client.websocket_connect('/ws/telemetry') as ws:
            assert ws.receive_json()['source'] == 'backend_host'


def test_tasks_memories_settings_persist_and_delete(tmp_path):
    app = create_app(config(tmp_path))
    with TestClient(app) as client:
        task = client.post('/api/tasks', json={'title': 'Revisar projeto', 'due_at': '2026-10-13T09:00:00-03:00'}).json()
        memory = client.post('/api/memories', json={'content': 'Prefiro respostas curtas', 'category': 'preference'}).json()
        preferences = client.get('/api/settings').json()
        preferences['language'] = 'pt-BR'
        assert client.put('/api/settings', json=preferences).status_code == 200
    with TestClient(create_app(config(tmp_path))) as client:
        assert client.get('/api/settings').json()['language'] == 'pt-BR'
        assert client.get('/api/tasks').json()[0]['id'] == task['id']
        assert client.patch(f"/api/tasks/{task['id']}", json={'done': True}).status_code == 200
        assert client.get('/api/tasks').json()[0]['done'] is True
        assert client.put(f"/api/memories/{memory['id']}", json={'content': 'Prefiro respostas detalhadas', 'category': 'preference'}).status_code == 200
        assert client.get('/api/memories').json()[0]['content'] == 'Prefiro respostas detalhadas'
        assert client.delete(f"/api/memories/{memory['id']}").status_code == 200
        assert client.get('/api/memories').json() == []
        assert client.delete(f"/api/tasks/{task['id']}").status_code == 200
        assert client.get('/api/tasks').json() == []


@pytest.mark.parametrize('path,payload', [('/api/tasks', {'title': ' '}), ('/api/tasks', {'title': 'x', 'due_at': '2026-10-13T09:00:00'}), ('/api/memories', {'content': ' '}), ('/api/chat', {'message': 'x', 'shell': 'rm -rf /'}), ('/api/settings', {'groq_key': 'secret'})])
def test_invalid_inputs_rejected(tmp_path, path, payload):
    with TestClient(create_app(config(tmp_path))) as client:
        method = client.put if path.endswith('settings') else client.post
        assert method(path, json=payload).status_code == 422


def test_missing_credentials_fail_clearly(tmp_path):
    with TestClient(create_app(config(tmp_path))) as client:
        assert client.post('/api/chat', json={'message': 'Olá'}).status_code == 503
        assert 'FISH_AUDIO_API_KEY' in client.post('/api/speech', json={'text': 'Olá'}).json()['detail']
        assert client.get('/api/messages').json() == []


def test_cookie_auth_origin_and_logout(tmp_path):
    cfg = config(tmp_path)
    cfg.access_token = 'a-password-not-a-provider-key'
    with TestClient(create_app(cfg)) as client:
        assert client.get('/api/settings').status_code == 401
        assert client.post('/api/login', json={'token': 'incorrect'}).status_code == 401
        response = client.post('/api/login', json={'token': cfg.access_token})
        assert response.status_code == 200
        assert 'HttpOnly' in response.headers['set-cookie']
        assert 'SameSite=strict' in response.headers['set-cookie']
        assert client.get('/api/settings').status_code == 200
        assert client.post('/api/tasks', json={'title': 'bad'}, headers={'Origin': 'https://evil.example'}).status_code == 403
        client.post('/api/logout')
        assert client.get('/api/settings').status_code == 401


def test_public_status_contains_no_secrets(tmp_path):
    cfg = config(tmp_path); cfg.groq_key = 'private-groq-key'; cfg.fish_key = 'private-fish-key'
    with TestClient(create_app(cfg)) as client:
        output = client.get('/api/status').text + client.get('/api/settings').text
        assert cfg.groq_key not in output and cfg.fish_key not in output
        assert client.get('/api/status').json()['groq']['status'] == 'configured'


def test_streaming_chat_with_context_and_no_invented_reply(tmp_path):
    cfg = config(tmp_path); cfg.groq_key = 'test-key'
    captured = []
    def handler(request):
        captured.append(json.loads(request.content))
        assert request.headers['authorization'] == 'Bearer test-key'
        return httpx.Response(200, text=sse({'content': 'Olá, '}, {'content': 'senhor.'}))
    with TestClient(create_app(cfg, httpx.MockTransport(handler))) as client:
        client.post('/api/memories', json={'content': 'Prefiro português', 'category': 'preference'})
        response = client.post('/api/chat', json={'message': 'Olá'})
        events = [json.loads(line) for line in response.text.splitlines()]
        assert [e['text'] for e in events if e['type'] == 'delta'] == ['Olá, ', 'senhor.']
        assert events[-1] == {'type': 'done', 'text': 'Olá, senhor.'}
        assert 'Prefiro português' in captured[0]['messages'][0]['content']
        client.post('/api/chat', json={'message': 'Quem é você?'})
        assert captured[1]['messages'][1]['content'] == 'Olá'
        assert captured[1]['messages'][2]['content'] == 'Olá, senhor.'
        assert len(client.get('/api/messages').json()) == 4


def test_tool_call_confirmation_is_pending_until_user_approves(tmp_path):
    cfg = config(tmp_path); cfg.groq_key = 'test-key'; count = 0
    def handler(request):
        nonlocal count
        count += 1
        if count == 1:
            return httpx.Response(200, text=sse({'tool_calls': [{'index': 0, 'id': 'call_1', 'function': {'name': 'save_memory', 'arguments': '{"content":"Meu idioma é português",'}}]}, {'tool_calls': [{'index': 0, 'function': {'arguments': '"category":"preference"}'}}]}))
        payload = json.loads(request.content)
        assert json.loads(payload['messages'][-1]['content'])['status'] == 'pending'
        return httpx.Response(200, text=sse({'content': 'Aprove a memória no painel.'}))
    with TestClient(create_app(cfg, httpx.MockTransport(handler))) as client:
        events = [json.loads(line) for line in client.post('/api/chat', json={'message': 'Lembre meu idioma'}).text.splitlines()]
        pending = next(e['result'] for e in events if e['type'] == 'tool')
        assert client.get('/api/memories').json() == []
        response = client.post(f"/api/actions/{pending['id']}/decision", json={'approved': True})
        assert response.json()['status'] == 'success'
        assert len(client.get('/api/memories').json()) == 1
        assert client.post(f"/api/actions/{pending['id']}/decision", json={'approved': True}).json()['status'] == 'expired'


@pytest.mark.asyncio
async def test_allowlist_validation_rejection_expiration_and_permission_revocation(tmp_path):
    cfg = config(tmp_path); store = Store(tmp_path)
    async with httpx.AsyncClient() as client:
        tools = Tools(store, cfg, client)
        assert (await tools.run('shell', '{"command":"ls"}'))['status'] == 'denied'
        assert (await tools.run('get_time', '{"command":"ls"}'))['status'] == 'denied'
        assert (await tools.run('launch_application', '{"application":"spotify"}'))['status'] == 'denied'
        pending = await tools.run('save_memory', '{"content":"test","category":"note"}')
        assert (await tools.decide(pending['id'], False))['status'] == 'denied'
        assert store.memories() == []
        pending = await tools.run('save_memory', '{"content":"test","category":"note"}')
        tools.pending[pending['id']]['expires'] = time.time() - 1
        assert (await tools.decide(pending['id'], True))['status'] == 'expired'
        pending = await tools.run('save_memory', '{"content":"test","category":"note"}')
        store.set_preferences(Preferences(tools_enabled=False))
        assert (await tools.decide(pending['id'], True))['status'] == 'denied'
        assert store.memories() == []


def test_fish_audio_uses_exact_reference_model_and_mp3(tmp_path):
    cfg = config(tmp_path); cfg.fish_key = 'fish-private-test'
    def handler(request):
        assert str(request.url) == 'https://api.fish.audio/v1/tts'
        assert request.headers['model'] == 's2.1-pro'
        assert request.headers['content-type'] == 'application/msgpack'
        payload = msgpack.unpackb(request.content, raw=False)
        assert payload['reference_id'] == '82d13948027e4be69892dd3d0104e681'
        assert payload['format'] == 'mp3' and payload['text'] == 'Olá.'
        assert payload['prosody']['speed'] == 1.0
        return httpx.Response(200, content=b'ID3-test-audio', headers={'content-type': 'audio/mpeg'})
    with TestClient(create_app(cfg, httpx.MockTransport(handler))) as client:
        response = client.post('/api/speech', json={'text': 'Olá.'})
        assert response.headers['content-type'] == 'audio/mpeg'
        assert response.content == b'ID3-test-audio'
        assert cfg.fish_key not in response.text


@pytest.mark.parametrize('status', [401, 403, 404, 422, 429, 500])
def test_fish_errors_are_explicit_and_never_use_fallback(tmp_path, status):
    cfg = config(tmp_path); cfg.fish_key = 'never-leak-this'
    def handler(request):
        return httpx.Response(status, json={'detail': 'unsafe provider body never-leak-this'})
    with TestClient(create_app(cfg, httpx.MockTransport(handler))) as client:
        response = client.post('/api/speech', json={'text': 'Olá'})
        assert response.status_code == (status if status != 500 else 502)
        assert cfg.fish_key not in response.text
        assert response.json()['provider'] == 'fish'


def test_groq_errors_release_lock_and_do_not_expose_provider_body(tmp_path):
    cfg = config(tmp_path); cfg.groq_key = 'private-key'
    def handler(request):
        return httpx.Response(429, json={'error': 'private-key'})
    with TestClient(create_app(cfg, httpx.MockTransport(handler))) as client:
        for _ in range(2):
            response = client.post('/api/chat', json={'message': 'Olá'})
            assert json.loads(response.text)['type'] == 'error'
            assert cfg.groq_key not in response.text
        assert len(client.get('/api/messages').json()) == 2


def test_transcription_multipart_language_and_validation(tmp_path):
    cfg = config(tmp_path); cfg.groq_key = 'test-key'
    def handler(request):
        assert request.url.path == '/openai/v1/audio/transcriptions'
        assert b'whisper-large-v3-turbo' in request.content
        assert b'recording.webm' in request.content
        assert b'\r\npt\r\n' in request.content
        return httpx.Response(200, json={'text': 'Jarvis, que horas são?'})
    with TestClient(create_app(cfg, httpx.MockTransport(handler))) as client:
        client.put('/api/settings', json={**Preferences().model_dump(), 'language': 'pt-BR'})
        response = client.post('/api/transcribe', files={'file': ('x.webm', b'audio-test', 'audio/webm')})
        assert response.json()['text'] == 'Jarvis, que horas são?'
        assert client.post('/api/transcribe', files={'file': ('bad.txt', b'not audio', 'text/plain')}).status_code == 415
        assert client.post('/api/transcribe', files={'file': ('empty.webm', b'', 'audio/webm')}).status_code == 413


def test_history_can_be_disabled_and_deleted(tmp_path):
    cfg = config(tmp_path); cfg.groq_key = 'test-key'
    def handler(request):
        assert len(json.loads(request.content)['messages']) == 2
        return httpx.Response(200, text=sse({'content': 'Olá.'}))
    with TestClient(create_app(cfg, httpx.MockTransport(handler))) as client:
        client.put('/api/settings', json={**Preferences().model_dump(), 'save_history': False})
        client.post('/api/chat', json={'message': 'Olá'})
        assert client.get('/api/messages').json() == []
        assert client.app.state.store.messages() == []
        assert client.delete('/api/messages').status_code == 200


def test_static_frontend_does_not_serve_secret_files(tmp_path):
    with TestClient(create_app(config(tmp_path))) as client:
        assert client.get('/.env').status_code == 404
        assert client.get('/backend/config.py').status_code == 404
        assert client.get('/api/nonexistent').status_code == 404


@pytest.mark.asyncio
async def test_remote_desktop_requires_https_and_checks_actual_agent_result(tmp_path):
    cfg = config(tmp_path); cfg.agent_token = 'test-pairing-token'; cfg.agent_url = 'http://192.0.2.1:8765'
    store = Store(tmp_path); store.set_preferences(Preferences(desktop_enabled=True))
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={'cpu_percent': 15, 'source': 'desktop_agent'}))) as client:
        tools = Tools(store, cfg, client)
        assert (await tools.run('desktop_diagnostics', '{}'))['status'] == 'denied'
        cfg.agent_url = 'https://agent.example'
        result = await tools.run('desktop_diagnostics', '{}')
        assert result['status'] == 'success' and result['result']['source'] == 'desktop_agent'
