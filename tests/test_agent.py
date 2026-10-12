from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient

from desktop_agent.app import create_agent

TOKEN = 'local-test-pairing-token-32-characters'
POLICY = {'applications': {'calculator': ['calculator']}, 'allowed_website_hosts': ['www.wikipedia.org']}


def test_agent_requires_pairing_and_refuses_unknown_tools():
    with TestClient(create_agent(TOKEN, POLICY)) as client:
        assert client.get('/diagnostics').status_code == 401
        assert client.post('/execute', json={'name': 'shell', 'arguments': {'command': 'ls'}}, headers={'Authorization': f'Bearer {TOKEN}'}).status_code == 403
        assert client.get('/diagnostics', headers={'Authorization': f'Bearer {TOKEN}'}).json()['source'] == 'desktop_agent'
        assert client.get('/diagnostics', headers={'Authorization': f'Bearer {TOKEN}', 'Origin': 'http://localhost'}).status_code == 403


def test_agent_uses_only_local_allowlist_and_no_shell():
    with TestClient(create_agent(TOKEN, POLICY)) as client, patch('desktop_agent.app.shutil.which', return_value='/usr/bin/calculator'), patch('desktop_agent.app.subprocess.Popen', return_value=Mock(pid=123)) as process:
        headers = {'Authorization': f'Bearer {TOKEN}'}
        assert client.post('/execute', json={'name': 'launch_application', 'arguments': {'application': 'calculator; rm -rf /'}}, headers=headers).status_code == 403
        response = client.post('/execute', json={'name': 'launch_application', 'arguments': {'application': 'calculator'}}, headers=headers)
        assert response.json()['status'] == 'success'
        assert process.call_args.args[0] == ['/usr/bin/calculator']
        assert process.call_args.kwargs['shell'] is False


@pytest.mark.parametrize('url', ['http://www.wikipedia.org', 'https://evil.com', 'file:///etc/passwd', 'https://user:pass@www.wikipedia.org', 'https://www.wikipedia.org:8765'])
def test_agent_refuses_unauthorized_website(url):
    with TestClient(create_agent(TOKEN, POLICY)) as client:
        response = client.post('/execute', json={'name': 'open_website', 'arguments': {'url': url}}, headers={'Authorization': f'Bearer {TOKEN}'})
        assert response.status_code == 403


def test_agent_does_not_claim_failed_browser_open_succeeded():
    with TestClient(create_agent(TOKEN, POLICY)) as client, patch('desktop_agent.app.webbrowser.open', return_value=False):
        response = client.post('/execute', json={'name': 'open_website', 'arguments': {'url': 'https://www.wikipedia.org'}}, headers={'Authorization': f'Bearer {TOKEN}'})
        assert response.status_code == 502


def test_agent_refuses_weak_or_missing_token():
    with pytest.raises(RuntimeError):
        create_agent('', POLICY)
