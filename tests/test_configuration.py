import importlib.util
from pathlib import Path

from backend.config import load_environment


def test_windows_bom_env_is_loaded(monkeypatch, tmp_path):
    monkeypatch.delenv('GROQ_API_KEY', raising=False)
    path = tmp_path / '.env'
    path.write_text('GROQ_API_KEY=not-a-real-test-key\n', encoding='utf-8-sig')
    load_environment(path)
    import os
    assert os.getenv('GROQ_API_KEY') == 'not-a-real-test-key'
    monkeypatch.delenv('GROQ_API_KEY')


def test_env_file_never_replaces_existing_proxy_binding(monkeypatch, tmp_path):
    monkeypatch.setenv('GROQ_API_KEY', 'existing-test-binding')
    path = tmp_path / '.env'
    path.write_text('GROQ_API_KEY=file-test-value\n')
    load_environment(path)
    import os
    assert os.getenv('GROQ_API_KEY') == 'existing-test-binding'


def test_diagnostic_never_displays_key_values(monkeypatch, tmp_path, capsys):
    path = Path(__file__).resolve().parents[1] / 'scripts' / 'diagnose.py'
    spec = importlib.util.spec_from_file_location('jarvis_diagnose', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, 'ROOT', tmp_path)
    monkeypatch.setenv('LLM_PROVIDER', 'groq')
    monkeypatch.setenv('GROQ_API_KEY', 'test-value-must-never-be-printed')
    monkeypatch.setenv('FISH_AUDIO_API_KEY', 'another-test-value-never-print')
    (tmp_path / '.env').write_text('GROQ_API_KEY=test-value-must-never-be-printed\nFISH_AUDIO_API_KEY=another-test-value-never-print\n')
    class Offline:
        def open(self, *args, **kwargs):
            raise OSError('offline')
    monkeypatch.setattr(module.urllib.request, 'build_opener', lambda *args: Offline())
    assert module.main() == 0
    output = capsys.readouterr().out
    assert 'test-value-must-never-be-printed' not in output
    assert 'another-test-value-never-print' not in output
    assert 'Groq em uma nova inicializacao: chave encontrada' in output
