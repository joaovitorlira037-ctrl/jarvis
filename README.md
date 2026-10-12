# J.A.R.V.I.S.

Uma central pessoal de inteligência com interface holográfica, React/TypeScript e FastAPI. OpenRouter alimenta a conversa; o Chrome/Edge reconhece a fala; Fish Audio fornece a voz JARVIS. Este repositório foi iniciado do zero, pois o remoto selecionado estava vazio.

## Abrir no Windows

1. Na branch `jarvis-app` do GitHub, use **Code → Download ZIP** e extraia o ZIP inteiro. Não execute o iniciador dentro da pasta compactada.
2. Com Python 3.15 e Node.js 24 instalados, dê dois cliques em **`INICIAR_JARVIS.bat`**. Python e Node precisam estar no PATH; abra uma nova janela depois de instalá-los.
3. Na primeira execução, aguarde a instalação das dependências e a compilação. Depois, o painel abre no navegador. Mantenha a janela do terminal aberta.
4. Para ativar conversa e voz, use **`CONFIGURAR_CHAVES.bat`**, preencha `OPENROUTER_API_KEY` e `FISH_AUDIO_API_KEY` no arquivo `.env`, salve e reinicie o JARVIS.

Obtenha suas próprias chaves em [OpenRouter](https://openrouter.ai/settings/keys) e [Fish Audio](https://fish.audio/app/api-keys). As contas podem exigir créditos para chamadas de API. Não envie as chaves pelo chat ou ao GitHub. Sem chaves, tarefas, memória, configurações e diagnóstico do servidor continuam disponíveis. O atalho não habilita microfone nem controla aplicativos automaticamente.

O iniciador usa `scripts/launch.py`, que foi verificado no Linux; os arquivos `.bat` foram preparados para Windows, mas não foram executados em Windows neste ambiente. Se o iniciador não abrir, mantenha a janela com a mensagem de erro visível e consulte os comandos manuais abaixo.

Se a chave já estiver preenchida mas o painel ainda pedir configuração:

- Salve a chave no arquivo **`.env`** aberto pelo atalho, na mesma pasta de `INICIAR_JARVIS.bat`. `.env.example`, `.env.txt` e o próprio `.bat` não substituem esse arquivo.
- Encerre a janela do **terminal** com Ctrl+C, execute o iniciador novamente e atualize a página. Fechar apenas o navegador não reinicia o servidor.
- Execute `DIAGNOSTICAR_JARVIS.bat` para conferir a pasta, a presença das chaves e o estado do servidor. O diagnóstico não imprime valores secretos. Uma variável de ambiente já definida prevalece sobre o `.env`, inclusive quando está vazia.
- Configurações de chaves do ambiente na nuvem não são copiadas automaticamente para o `.env` do seu computador.

Se aparecer “modelo ou referência de voz indisponível”, abra Configurações:

1. Use **Verificar conexão OpenRouter** para verificar a chave e a disponibilidade de `OPENROUTER_MODEL`.
2. Use **Verificar referência Fish Audio** para consultar a voz configurada, sem gerar áudio. Uma referência inexistente, privada ou inacessível precisa ser liberada para sua conta. Os erros dessa consulta identificam Fish Audio explicitamente.
3. Se a referência estiver pronta, use **Testar voz** para verificar a geração com `FISH_AUDIO_MODEL`. Encontrar a referência não comprova que o modelo de síntese ou os créditos de API estejam disponíveis.

A referência solicitada permanece `82d13948027e4be69892dd3d0104e681`, com modelo preferido `s2.1-pro`. Não há troca automática de voz/modelo. Confira permissões, modelo disponível e saldo de API dentro da sua conta. Se essa voz tiver sido removida ou não puder ser liberada, a escolha de uma nova voz precisa ser feita explicitamente pelo usuário.

## O que funciona neste MVP

- Dashboard responsivo com núcleo animado em SVG/Three.js, Framer Motion e Tailwind CSS.
- CPU, memória, disco, rede e uptime reais do **servidor**, atualizados por WebSocket. Sensores ausentes aparecem como N/D.
- Conversa com OpenRouter em streaming, contexto de conversa e memórias explicitamente autorizadas.
- Microfone com permissão explícita, redução de ruído, reconhecimento de fala do navegador e reprodução Fish Audio. Web Audio analisa o áudio real do microfone e da saída separadamente.
- Interrupção de reprodução, transcrição e conversa, com prevenção de sobreposição de voz. O áudio MP3 é transmitido pelo backend e **bufferizado integralmente no navegador antes da reprodução**.
- Tarefas e lembretes persistentes, notas/preferências editáveis e removíveis, histórico apagável e registro pesquisável de atividade.
- Configurações persistentes de nome, idioma das respostas, formalidade, dispositivos, velocidade da fala, animação, cor e permissões.
- Ativação opcional por frase via reconhecimento do navegador, iniciada explicitamente. A escuta termina ao detectar a frase; depois, uma nova fala é reconhecida pelo navegador. Não há escuta contínua automática após a resposta.
- Agente local separado para diagnósticos, aplicativos permitidos e sites HTTPS permitidos. Aplicativos e sites exigem aprovação no painel e passam por uma segunda lista de permissões no agente.

**Sem credenciais, conversa, transcrição e voz ficam indisponíveis com mensagens claras. Não há respostas de IA, voz ou métricas fictícias apresentadas como reais.** Tarefas, memória, configurações e diagnóstico do servidor continuam funcionando.

## Instalação

Pré-requisitos: Python 3.11+ (validado com 3.12.14 e 3.15.0rc3 no Linux), Node 22.12+ (validado com 24.19.0), npm e um navegador atual. As dependências incluem pacotes binários para Windows x64 com Python 3.15; a execução em Windows não foi testada nesta máquina Linux. As versões padrão da nuvem estão em `.python-version` e `.node-version`; não é necessário trocar seu Python 3.15 para executar localmente. Cada tarefa da nuvem já é isolada: use o checkout existente; não crie worktrees para o setup.

Na raiz do projeto:

```bash
bash scripts/install.sh
```

No Windows, abra o PowerShell na pasta `jarvis` e use seu Python instalado (inclusive 3.15):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm --prefix frontend ci
npm --prefix frontend run build
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --port 8000
```

Mantenha o terminal aberto e acesse a porta 8000 no navegador do mesmo computador. Use o ZIP atualizado: as versões de `msgpack` e `psutil` foram ajustadas para Python 3.15. Se já existir uma `.venv`, ela será reutilizada; o comando de instalação atualiza as dependências indicadas. Preserve seu `.env` e o diretório `data/` ao substituir arquivos do projeto.

O script cria/reutiliza `.venv`, instala versões fixadas em `backend/requirements.txt`, usa `npm ci` com o lockfile, compila o frontend e executa testes locais do backend. Não altera código, manifests ou lockfiles. Dependências e saídas geradas estão no `.gitignore`.

Configure variáveis **no servidor** usando as configurações seguras do ambiente na nuvem ou um arquivo `.env` local, baseado em `.env.example`. Nunca use `VITE_*` para segredos, nunca inclua chaves no Git, e nunca envie valores secretos pelo chat.

| Variável | Uso / padrão |
| --- | --- |
| `LLM_PROVIDER` | `openrouter` (padrão); `groq` opcional |
| `OPENROUTER_API_KEY` | Chave necessária para conversa com OpenRouter |
| `STT_PROVIDER` | `browser` (padrão); `groq` opcional com chave Groq |
| `GROQ_API_KEY` | Opcional, somente se selecionar Groq |
| `OPENROUTER_MODEL` | `openrouter/free`; disponibilidade e limites dependem da conta |
| `GROQ_MODEL` | `llama-3.3-70b-versatile`, opcional |
| `GROQ_TRANSCRIPTION_MODEL` | `whisper-large-v3-turbo` |
| `FISH_AUDIO_API_KEY` | Chave Fish Audio; necessária para voz |
| `FISH_AUDIO_VOICE_ID` | `82d13948027e4be69892dd3d0104e681` |
| `FISH_AUDIO_MODEL` | `s2.1-pro`, sujeito à disponibilidade da conta |
| `JARVIS_DATA_DIR` | Diretório SQLite; padrão `data/` na raiz |
| `JARVIS_ACCESS_TOKEN` | Senha opcional da instância; configure antes de expor o serviço |
| `JARVIS_PUBLIC_ORIGIN` | Origem HTTPS exata do proxy de produção, se utilizado |
| `DESKTOP_AGENT_URL` | `http://127.0.0.1:8765`; em nuvem precisa apontar ao agente por uma rota HTTPS acessível |
| `DESKTOP_AGENT_TOKEN` | Token exclusivo de pareamento, igual no backend e no agente |

Rede necessária: `openrouter.ai` e `api.fish.audio` (Groq opcional: `api.groq.com`) (HTTPS), além dos registries Python/npm para instalar dependências. As chaves podem ser bindings do proxy da plataforma; não precisam ser credenciais brutas. Modelos e permissões de conta são verificados pelas chamadas reais. A aplicação não substitui silenciosamente modelos ou vozes.

## Executar

Interface compilada + API em um único processo:

```bash
bash scripts/start.sh
```

Para editar com hot reload em dois processos:

```bash
.venv/bin/python scripts/dev.py
```

O backend usa a porta 8000; o Vite usa 5173 e encaminha `/api` e `/ws` ao backend. `GET /api/health` confirma disponibilidade; uma leitura de `/api/telemetry` verifica a coleta real. As páginas de tarefas e memória exercitam o banco. O botão “Verificar conexão OpenRouter” consulta os modelos da conta; o botão de voz em Configurações chama Fish Audio e pode consumir créditos.

O servidor compilado fica limitado a loopback por padrão. O Vite aceita conexões para desenvolvimento; não o publique como servidor de produção. Em produção, use proxy HTTPS autenticado, defina a origem e a senha da instância. O login usa cookie HttpOnly/SameSite, há validação de origem, e o backend nunca devolve chaves de provedores. O aplicativo é **single-user**, sem isolamento de contas ou OAuth multiusuário.

Microfone requer HTTPS ou execução local. A reprodução só começa após interação do usuário; nenhum som ou captura é iniciado automaticamente. Ao recusar acesso ao microfone, texto continua disponível. Não há fallback para síntese de voz do navegador.

## Agente no computador do usuário

O backend da nuvem não consegue alcançar o loopback do seu computador. Instale o agente na máquina que deseja controlar. Uma conexão remota exige um proxy HTTPS privado/autenticado que seja acessível ao backend; configurar apenas um token não cria essa conexão.

1. Instale as dependências Python neste computador.
2. Copie `desktop_agent/agent.example.json` para `desktop_agent/agent.json` e adapte os comandos à sua plataforma. A política local inicia **sem permissões** se o arquivo não existir.
3. Gere um token aleatório de pelo menos 24 caracteres e configure `DESKTOP_AGENT_TOKEN` com o mesmo valor nos dois servidores, por meios seguros. O token é de pareamento entre processos; não é uma chave proxy Groq/Fish.
4. Inicie o agente:

```bash
.venv/bin/python -m uvicorn desktop_agent.app:create_agent --factory --host 127.0.0.1 --port 8765
```

5. Configure `DESKTOP_AGENT_URL` no backend e habilite “Permitir agente de desktop” em Configurações.

Comandos de aplicativos são arrays definidos pelo próprio usuário na política, executados com `shell=False`; o modelo só pode escolher um nome permitido. Sites exigem HTTPS, host exato da lista e ausência de credenciais na URL. O agente bloqueia chamadas diretas do navegador e exige token em todas as operações. Uma ação aprovada só é executada uma vez, expira após cinco minutos e respeita permissões novamente na execução. “Processo iniciado” ou “solicitação aceita pelo navegador” não significa que uma janela ou página foi carregada com sucesso.

## Testes

```bash
.venv/bin/python -m pytest -q
npm --prefix frontend run build
npm --prefix frontend run test:e2e
```

Os testes de backend usam transports simulados para validar contratos, contexto, streaming, referência de voz, erros, persistência, autenticação e permissões. Os testes Playwright usam Chromium instalado em `/usr/bin/chromium`; use `CHROMIUM_PATH` para outro caminho. Eles iniciam servidores isolados nas portas 8001/5174, usam `data/e2e/` e mantêm credenciais de provedores vazias para impedir chamadas pagas acidentais. Eles verificam fluxos reais de tarefas/memória/configurações e um pipeline de voz com microfone sintético e respostas simuladas. Os testes não atribuem essas respostas a chamadas reais dos provedores.

`tests/test_live.py` faz uma conversa real OpenRouter e solicita um MP3 Fish Audio quando as duas chaves estão presentes; pode consumir créditos. Para executá-lo isoladamente, configure as variáveis no processo e use:

```bash
.venv/bin/python -m pytest -q -m live
```

Na ausência das chaves, o teste real é marcado como **skipped**, não como aprovado. A validação completa da voz também exige um microfone e saída de áudio reais no navegador: teste as seis frases fornecidas no briefing, interrupção, reentrada do microfone e troca de idioma. Inglês e português são aceitos pelo pipeline; disponibilidade e qualidade da voz dependem da conta Fish Audio.

## Arquitetura e limites

```text
frontend/src/        Dashboard, páginas, streaming e pipeline Web Audio
backend/app.py      HTTP, WebSocket, autenticação e frontend compilado
backend/providers.py OpenRouter/Groq e Fish Audio; erros sanitizados e sem fallback
backend/tools.py    Registro permitido, validação e aprovações descartáveis
backend/storage.py SQLite e schema versionado no código
desktop_agent/     Ponte local autenticada com política própria
tests/             Contratos, permissões, persistência e teste real opcional
scripts/           Instalação reproduzível e inicialização
```

Tabelas SQLite: `settings`, `messages`, `tasks`, `memories`, `activity`. Consultas usam parâmetros. O diretório de dados tem permissão 0700 e o banco 0600; os dados **não são criptografados em repouso pela aplicação**. Proteja o volume/backups do sistema operacional. Memórias só são salvas diretamente pelo usuário ou após aprovação; conteúdo autorizado e histórico habilitado são enviados ao provedor de conversa como contexto. Por padrão, o reconhecimento de fala do Chrome/Edge pode enviar áudio ao serviço do navegador e usa o microfone padrão do sistema. Exige internet e permissões; se indisponível, use texto. Com STT_PROVIDER=groq, áudio gravado é enviado ao Groq e não é persistido pela aplicação. Texto de resposta vai ao Fish Audio para síntese.

Lembretes aparecem no painel aberto; não há notificações em segundo plano após fechar o navegador. Clima, calendários, notificações externas, pesquisa web, visão, smart home, busca vetorial, rotinas personalizadas, operações de arquivos, troca/fechamento de janelas e controles de volume do sistema não estão implementados neste MVP. O registro é limitado aos últimos 500 eventos e exibe até 200. A lista de ferramentas é extensível, mas essas capacidades não são anunciadas como disponíveis. PostgreSQL, OAuth e migrações formais são próximos passos, não funcionalidades concluídas.

## Ambiente na nuvem

O setup prepara a máquina atual; salvar `install_script`/`start_skill` preserva instruções e não publica o ambiente. Revise os requisitos nas configurações, forneça as chaves de forma segura, salve e publique pela interface da plataforma. Processos precisam ser reiniciados em uma nova tarefa; não se pressupõe que sobrevivam ao snapshot. Os arquivos locais ainda precisam ser adicionados/commitados ao repositório pelo fluxo de desenvolvimento antes de depender apenas de um novo clone remoto.

## Trocar uma instalação anterior para OpenRouter

Encerre o terminal antigo com Ctrl+C. Baixe a versão atual, preserve sua pasta `data` e seu `.env`, e acrescente/atualize estas linhas no `.env` (nunca no arquivo `.bat`):

```dotenv
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=cole_sua_chave_aqui
OPENROUTER_MODEL=openrouter/free
STT_PROVIDER=browser
```

Abra `INICIAR_JARVIS.bat` novamente e use Configurações → Verificar conexão OpenRouter. O verificador autentica a chave em `/key` antes de consultar o catálogo público. A rota gratuita pode ser confirmada somente na conversa; limites, créditos e suporte a ferramentas variam. Para escolher outro modelo, use o ID exato do catálogo OpenRouter em `OPENROUTER_MODEL`. Não há troca automática silenciosa de provedor.

A troca do provedor de conversa não altera as permissões da voz Fish Audio. Se a voz falhar, silencie o alto-falante e continue em texto.
