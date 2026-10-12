"""Check local configuration presence and live server state without showing keys."""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    try:
        from dotenv import dotenv_values
    except ImportError:
        print('Dependencias ausentes. Execute INICIAR_JARVIS.bat primeiro.')
        return 1
    path = ROOT / '.env'
    print('Pasta do JARVIS:', ROOT)
    print('Arquivo .env:', 'encontrado' if path.is_file() else 'nao encontrado')
    if not path.is_file() and (ROOT / '.env.txt').is_file():
        print('ATENCAO: existe .env.txt. Renomeie-o para .env, sem a extensao .txt.')
    if not path.is_file():
        print('Use CONFIGURAR_CHAVES.bat nesta mesma pasta. .env.example nao e carregado como configuracao.')
    values = dotenv_values(path, encoding='utf-8-sig') if path.is_file() else {}
    for name in ('GROQ_API_KEY', 'FISH_AUDIO_API_KEY'):
        value = values.get(name)
        present = isinstance(value, str) and bool(value.strip())
        placeholder = present and value.strip() in {'sua_chave_groq', 'sua_chave_fish_audio', 'cole_sua_chave_aqui'}
        print(f'{name} no arquivo:', 'preencha com sua chave real (ainda e um exemplo)' if placeholder else 'preenchida' if present else 'ausente ou vazia')
        exported = os.getenv(name)
        if exported is not None:
            print(f'{name} no ambiente do Windows:', 'preenchida' if exported.strip() else 'vazia')
    # Config reports the same presence the backend would observe on a new start.
    from backend.config import Config
    config = Config()
    print('Groq em uma nova inicializacao:', 'chave encontrada' if config.groq_key else 'chave ausente')
    print('Fish Audio em uma nova inicializacao:', 'chave encontrada' if config.fish_key else 'chave ausente')
    try:
        port = int(os.getenv('JARVIS_PORT', '8000'))
        if not 1 <= port <= 65535:
            raise ValueError
        local = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with local.open(f'http://127.0.0.1:{port}/api/status', timeout=3) as response:
            status = json.load(response)
        groq = status.get('groq', {}).get('status')
        fish = status.get('fish', {}).get('status')
        print('Groq no servidor que esta aberto:', {'missing': 'chave ausente', 'configured': 'chave encontrada; ainda nao verificada', 'verified': 'conexao verificada'}.get(groq, 'estado desconhecido'))
        print('Fish Audio no servidor que esta aberto:', {'missing': 'chave ausente', 'configured': 'chave encontrada; ainda nao verificada', 'verified': 'conexao verificada'}.get(fish, 'estado desconhecido'))
        if config.groq_key and groq == 'missing':
            print('ACAO: encerre o terminal antigo com Ctrl+C e abra INICIAR_JARVIS.bat desta pasta.')
        elif config.groq_key and groq == 'configured':
            print('ACAO: use Configuracoes > Verificar conexao Groq no painel. Presenca nao garante que a chave e valida.')
    except urllib.error.HTTPError as exc:
        print('Nao foi possivel consultar o servidor protegido. Confira a conexao pelo painel.' if exc.code == 401 else 'O servidor nao respondeu ao diagnostico.')
    except (OSError, ValueError, urllib.error.URLError):
        print('Servidor local nao acessivel. Abra INICIAR_JARVIS.bat para iniciar.')
    print('Este diagnostico nao mostra as chaves. Nunca envie o arquivo .env pelo chat.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
