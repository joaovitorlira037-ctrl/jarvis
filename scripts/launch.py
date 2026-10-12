"""User-invoked local launcher: install, build, start, verify, open the browser.

Uses the user's Python, a private venv, and fixed commands. No API credentials
are displayed. Only a server started by this script is stopped on exit.
"""
import argparse
import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fingerprint():
    checksum = hashlib.sha256()
    inputs = [ROOT / 'backend' / 'requirements.txt', ROOT / 'frontend' / 'package-lock.json', ROOT / 'frontend' / 'package.json', ROOT / 'frontend' / 'vite.config.ts', ROOT / 'frontend' / 'index.html']
    inputs += sorted((ROOT / 'frontend' / 'src').rglob('*'))
    inputs += sorted((ROOT / 'frontend' / 'public').rglob('*'))
    for path in inputs:
        if path.is_file():
            checksum.update(str(path.relative_to(ROOT)).encode())
            checksum.update(path.read_bytes())
    return checksum.hexdigest()


def is_ready(url):
    # Explicitly bypass outbound proxies only for our fixed loopback address.
    local = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with local.open(url + '/api/health', timeout=2) as response:
            health = json.load(response)
        with local.open(url + '/', timeout=2) as response:
            interface = response.read(4096)
        return health.get('status') == 'ok' and health.get('version') == '1.0.0' and b'J.A.R.V.I.S.' in interface
    except (OSError, ValueError, urllib.error.URLError):
        return False


def install():
    if sys.version_info < (3, 11):
        raise RuntimeError('Use Python 3.11 ou superior. Python 3.15 e aceito.')
    node = shutil.which('node')
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    if not node or not npm:
        raise RuntimeError('Node.js nao encontrado. Instale Node.js 24 e abra novamente o iniciador.')
    version = subprocess.check_output([node, '-p', 'process.versions.node'], text=True).strip()
    major, minor, *_ = map(int, version.split('.'))
    if major < 22 or (major == 22 and minor < 12):
        raise RuntimeError('Atualize o Node.js para a versao 24 (minimo: 22.12).')
    python = ROOT / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if not python.is_file():
        print('Criando ambiente Python...', flush=True)
        subprocess.run([sys.executable, '-m', 'venv', str(ROOT / '.venv')], check=True, cwd=ROOT)
    expected = fingerprint()
    stamp = ROOT / '.venv' / 'jarvis-install-stamp'
    installed = stamp.read_text().strip() if stamp.exists() else ''
    dependencies = subprocess.run([str(python), '-c', 'import fastapi, uvicorn, httpx, msgpack, psutil'], capture_output=True).returncode == 0
    if installed != expected or not dependencies or not (ROOT / 'frontend' / 'node_modules').is_dir() or not (ROOT / 'frontend' / 'dist' / 'index.html').is_file():
        print('Preparando JARVIS. A primeira execucao pode demorar alguns minutos...', flush=True)
        cache = Path(tempfile.gettempdir())
        subprocess.run([str(python), '-m', 'pip', 'install', '--cache-dir', str(cache / 'jarvis-pip-cache'), '-r', str(ROOT / 'backend' / 'requirements.txt')], cwd=ROOT, check=True)
        subprocess.run([npm, '--prefix', 'frontend', 'ci', '--cache', str(cache / 'jarvis-npm-cache'), '--no-audit', '--no-fund'], cwd=ROOT, check=True)
        subprocess.run([npm, '--prefix', 'frontend', 'run', 'build'], cwd=ROOT, check=True)
        stamp.write_text(expected)
    return python


def main():
    parser = argparse.ArgumentParser(description='Instalar e abrir o JARVIS localmente.')
    parser.add_argument('--no-browser', action='store_true', help='Iniciar sem abrir o navegador (validacao interna).')
    args = parser.parse_args()
    process = None
    try:
        port = int(os.getenv('JARVIS_PORT', '8000'))
        if not 1 <= port <= 65535:
            raise RuntimeError('JARVIS_PORT precisa estar entre 1 e 65535.')
        python = install()
        url = f'http://127.0.0.1:{port}'
        if is_ready(url):
            print(f'JARVIS ja esta ativo: {url}', flush=True)
            print('Se voce alterou o .env, encerre o terminal antigo com Ctrl+C antes de abrir novamente. Reabrir somente o navegador nao recarrega as chaves.', flush=True)
            if not args.no_browser:
                webbrowser.open(url)
            return 0
        print('Iniciando JARVIS...', flush=True)
        process = subprocess.Popen([str(python), '-m', 'uvicorn', 'backend.app:app', '--host', '127.0.0.1', '--port', str(port)], cwd=ROOT)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f'O servidor terminou antes de iniciar (codigo {process.returncode}). Confira o erro acima ou a porta {port}.')
            if is_ready(url):
                break
            time.sleep(.3)
        else:
            raise RuntimeError('O servidor nao ficou pronto em 30 segundos. Confira as mensagens acima.')
        print(f'JARVIS aberto: {url}\nMantenha esta janela aberta. Ctrl+C encerra o servidor.\nPara conversa e voz, configure OPENROUTER_API_KEY e FISH_AUDIO_API_KEY no arquivo .env.', flush=True)
        if not args.no_browser and not webbrowser.open(url):
            print('Abra o endereco acima no navegador deste computador.', flush=True)
        return process.wait()
    except KeyboardInterrupt:
        print('\nEncerrando JARVIS...', flush=True)
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f'Erro: {exc}', file=sys.stderr, flush=True)
        return 1
    finally:
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def shutdown(_signal, _frame):
    raise KeyboardInterrupt


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, shutdown)
    sys.exit(main())
