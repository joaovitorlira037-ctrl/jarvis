import json
import httpx
import pytest
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.config import Config
from test_backend import sse


def config(tmp_path, **kwargs):
    return Config(**dict(dict(data_dir=tmp_path, llm_provider='openrouter', stt_provider='browser', openrouter_key='test-router-secret', groq_key='', fish_key='', access_token='', agent_token='', public_origin=''), **kwargs))


def test_router_stream_context_and_tool_approval_without_groq(tmp_path):
    requests = []
    def handler(req):
        assert str(req.url) == 'https://openrouter.ai/api/v1/chat/completions'
        assert req.headers['authorization'] == 'Bearer test-router-secret'
        body = json.loads(req.content); requests.append(body)
        assert body['model'] == 'openrouter/free'
        assert body['provider'] == {'require_parameters': True}
        if len(requests) == 1:
            return httpx.Response(200, text=sse({'tool_calls': [{'index': 0, 'id': 'call-router', 'function': {'name': 'save_memory', 'arguments': '{"content":"Revisar","category":"note"}'}}]}))
        return httpx.Response(200, text=sse({'content': 'Aguarda sua aprovação.'}))
    cfg = config(tmp_path)
    with TestClient(create_app(cfg, httpx.MockTransport(handler))) as client:
        client.post('/api/memories', json={'content': 'Prefiro português', 'category': 'preference'})
        response = client.post('/api/chat', json={'message': 'Crie uma tarefa'})
        events = [json.loads(line) for line in response.text.splitlines()]
        assert events[-1]['type'] == 'done'
        assert any(e['type'] == 'tool' and e['result']['status'] == 'pending' for e in events)
        assert client.get('/api/tasks').json() == []
        assert 'Prefiro português' in requests[0]['messages'][0]['content']
        assert requests[1]['messages'][-1]['role'] == 'tool'
        status = client.get('/api/status')
        assert status.json()['chat']['status'] == 'verified'
        assert cfg.openrouter_key not in status.text + response.text


def test_key_is_authenticated_before_public_model_catalog(tmp_path):
    paths = []
    def handler(req):
        paths.append(req.url.path)
        return httpx.Response(401, json={'error': {'message': 'private-body-test-router-secret'}})
    with TestClient(create_app(config(tmp_path), httpx.MockTransport(handler))) as client:
        response = client.post('/api/providers/chat/check')
        assert response.status_code == 401
        assert paths == ['/api/v1/key']
        assert 'private-body' not in response.text
        assert 'test-router-secret' not in response.text


@pytest.mark.parametrize('model,listed,expected', [('openrouter/free', [], 'configured'), ('test/model', [{'id': 'test/model'}], 'verified'), ('test/missing', [], None)])
def test_catalog_and_free_route_verification(tmp_path, model, listed, expected):
    def handler(req):
        return httpx.Response(200, json={'data': {'limit_remaining': 1}} if req.url.path.endswith('/key') else {'data': listed})
    with TestClient(create_app(config(tmp_path, openrouter_model=model), httpx.MockTransport(handler))) as client:
        response = client.post('/api/providers/chat/check')
        if expected is None:
            assert response.status_code == 404
        else:
            assert response.json()['status'] == expected
            assert client.get('/api/status').json()['chat']['status'] == expected


@pytest.mark.parametrize('code', [402, 404, 429])
@pytest.mark.parametrize('inline', [False, True])
def test_router_errors_release_lock_and_keep_credentials_private(tmp_path, code, inline):
    def handler(req):
        if inline:
            return httpx.Response(200, text='data: '+json.dumps({'error': {'code': code, 'message': 'private-test-router-secret'}})+'\n\n')
        return httpx.Response(code, json={'error': 'private-test-router-secret'})
    with TestClient(create_app(config(tmp_path), httpx.MockTransport(handler))) as client:
        for _ in range(2):
            response = client.post('/api/chat', json={'message': 'Oi'})
            assert response.status_code == 200
            error = json.loads(response.text)
            assert error['type'] == 'error' and error['message'].startswith('OpenRouter:')
            assert 'private' not in response.text and 'test-router-secret' not in response.text


def test_browser_transcription_never_calls_groq(tmp_path):
    def handler(req):
        pytest.fail('Browser STT must not call a server provider')
    with TestClient(create_app(config(tmp_path), httpx.MockTransport(handler))) as client:
        assert client.get('/api/status').json()['transcription']['provider'] == 'browser'
        assert client.post('/api/transcribe', files={'file': ('test.webm', b'audio', 'audio/webm')}).status_code == 409
        assert client.post('/api/providers/groq/check').status_code == 400
