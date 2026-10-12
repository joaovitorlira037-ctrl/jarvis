import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity as ActivityIcon,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  AudioLines,
  Brain,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Command,
  Cpu,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  Mic,
  MicOff,
  Network,
  Plus,
  Radio,
  Send,
  Settings,
  ShieldCheck,
  Square,
  Terminal,
  Thermometer,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { api, streamChat } from "./api";
import { bytes, date, Modal, Panel, Sparkline } from "./components";
import {
  ActivityPage,
  MemoryPage,
  SettingsPage,
  TaskForm,
  TasksPage,
} from "./pages";
import type {
  Activity,
  Approval,
  CoreState,
  Message,
  Preferences,
  Status,
  Task,
  Telemetry,
} from "./types";
import { useVoice } from "./useVoice";

const stateNames: Record<CoreState, string> = {
  idle: "Pronto para ajudar",
  listening: "Ouvindo você…",
  processing: "Processando seu pedido…",
  generating: "Preparando a voz…",
  speaking: "JARVIS está falando",
  executing: "Consultando ferramentas…",
  error: "Aguardando sua atenção",
};
const Core = lazy(() => import("./Core"));
const connectionNames = {
  missing: "CONFIGURAR",
  configured: "CONFIGURADO",
  verified: "CONECTADO",
};

function App() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [state, setState] = useState<CoreState>("idle");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(false);
  const [auth, setAuth] = useState(false);
  const [password, setPassword] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [now, setNow] = useState(new Date());
  const chatAbort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const conversationRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => {});
  const onError = useCallback((message: string) => setError(message), []);
  const voice = useVoice(
    prefs,
    async (text) => sendRef.current(text),
    setState,
    onError,
    status?.transcription.provider || "browser",
  );
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const notifyTimers = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      api<Status>("/status"),
      api<Task[]>("/tasks"),
      api<Activity[]>("/activity"),
    ]);
    if (results[0].status === "fulfilled") {
      setStatus(results[0].value);
      setOnline(true);
    } else setOnline(false);
    if (results[1].status === "fulfilled") setTasks(results[1].value);
    if (results[2].status === "fulfilled") setActivity(results[2].value);
  }, []);

  const initialize = useCallback(async () => {
    try {
      const [settings, initialMessages] = await Promise.all([
        api<Preferences>("/settings"),
        api<Message[]>("/messages"),
      ]);
      setPrefs(settings);
      setMessages(initialMessages);
      setAuth(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [refresh]);

  useEffect(() => {
    void initialize();
    const authListener = () => setAuth(true);
    window.addEventListener("jarvis-auth", authListener);
    return () => window.removeEventListener("jarvis-auth", authListener);
  }, [initialize]);
  useEffect(() => {
    if (!prefs || auth) return;
    let socket: WebSocket | null = null;
    let retry = 0;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/telemetry`,
      );
      socket.onmessage = (event) => {
        const data: Telemetry = JSON.parse(event.data);
        setTelemetry(data);
        setHistory((current) => [...current.slice(-39), data.cpu_percent]);
      };
      socket.onclose = () => {
        if (!disposed) {
          setTelemetry(null);
          retry = window.setTimeout(connect, 5000);
        }
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    const poll = window.setInterval(() => void refresh(), 15000);
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(poll);
      socket?.close();
    };
  }, [prefs !== null, auth, refresh]);
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    for (const task of tasks) {
      if (
        !task.done &&
        task.due_at &&
        new Date(task.due_at).getTime() <= now.getTime() &&
        !notifyTimers.current.has(task.id)
      ) {
        notifyTimers.current.add(task.id);
        setNotice(`Lembrete: ${task.title}`);
      }
    }
  }, [now, tasks]);
  useEffect(() => {
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: busy ? "instant" : "smooth",
    });
  }, [messages, busy]);
  useEffect(() => () => chatAbort.current?.abort(), []);
  useEffect(() => {
    if (prefs) document.documentElement.dataset.accent = prefs.accent;
  }, [prefs?.accent]);

  const interrupt = () => {
    generation.current++;
    chatAbort.current?.abort();
    chatAbort.current = null;
    voice.stop();
    setBusy(false);
    setState("idle");
    setMessages((current) =>
      current.map((m) =>
        m.partial
          ? {
              ...m,
              partial: false,
              content: m.content
                ? `${m.content}\n[Resposta interrompida]`
                : "[Resposta interrompida]",
            }
          : m,
      ),
    );
  };

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    voice.stop();
    setError("");
    setNotice("");
    setInput("");
    const ticket = ++generation.current;
    const abort = new AbortController();
    chatAbort.current = abort;
    const id = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      },
      {
        id,
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
        partial: true,
      },
    ]);
    setBusy(true);
    setState("processing");
    let result = "";
    let complete = false;
    let failed = false;
    try {
      // Unlock playback while this user gesture is active, but never make a
      // text request depend on audio availability. speak() reports voice errors.
      if (prefs?.speech_enabled) void voice.prepare().catch(() => {});
      await streamChat(text, abort.signal, (event) => {
        if (ticket !== generation.current) return;
        if (event.type === "delta") {
          result += event.text as string;
          setMessages((current) =>
            current.map((m) => (m.id === id ? { ...m, content: result } : m)),
          );
        }
        if (event.type === "status") setState("executing");
        if (event.type === "tool") {
          const toolResult = event.result as {
            status: string;
            id?: string;
            name?: string;
            arguments?: Record<string, unknown>;
          };
          if (toolResult.status === "pending")
            setApprovals((current) => [
              ...current,
              {
                id: toolResult.id!,
                name: toolResult.name!,
                arguments: toolResult.arguments!,
              },
            ]);
          void refresh();
        }
        if (event.type === "done") {
          result = event.text as string;
          complete = true;
        }
        if (event.type === "error") {
          failed = true;
          setError(event.message as string);
        }
      });
      if (ticket !== generation.current) return;
      if (!complete && !failed) {
        failed = true;
        setError(
          "A conexão terminou antes da resposta completa. Tente novamente.",
        );
      }
      setMessages((current) =>
        current.map((m) =>
          m.id === id
            ? {
                ...m,
                content:
                  result ||
                  "Nenhuma resposta gerada. Confira o aviso de conexão.",
                partial: false,
              }
            : m,
        ),
      );
      setBusy(false);
      if (complete && prefs?.speech_enabled) await voice.speak(result);
      else setState(failed ? "error" : "idle");
      await refresh();
    } catch (e) {
      if ((e as Error).name !== "AbortError" && ticket === generation.current) {
        setError((e as Error).message);
        setState("error");
        setMessages((current) =>
          current.map((m) =>
            m.id === id
              ? {
                  ...m,
                  content: result || "Não foi possível gerar a resposta.",
                  partial: false,
                }
              : m,
          ),
        );
      }
    } finally {
      if (ticket === generation.current) {
        setBusy(false);
        chatAbort.current = null;
      }
    }
  };
  sendRef.current = send;

  const toggleSpeech = async () => {
    if (!prefs) return;
    try {
      const updated = await api<Preferences>("/settings", "PUT", {
        ...prefs,
        speech_enabled: !prefs.speech_enabled,
      });
      setPrefs(updated);
      if (!updated.speech_enabled) voice.stop();
    } catch (e) {
      onError((e as Error).message);
    }
  };
  const decide = async (approval: Approval, approved: boolean) => {
    try {
      const result = await api<{ status: string; message?: string }>(
        `/actions/${approval.id}/decision`,
        "POST",
        { approved },
      );
      setApprovals((current) =>
        current.filter((item) => item.id !== approval.id),
      );
      setNotice(
        result.message ||
          (result.status === "success"
            ? "Ação concluída pela ferramenta."
            : "Ação não executada."),
      );
      await refresh();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(now);
  const seconds = new Intl.DateTimeFormat("pt-BR", {
    second: "2-digit",
    timeZone: "America/Sao_Paulo",
  })
    .format(now)
    .padStart(2, "0");
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    timeZone: "America/Sao_Paulo",
  }).format(now);
  const pendingTasks = tasks.filter((task) => !task.done);
  const uptime = telemetry
    ? `${Math.floor(telemetry.uptime_seconds / 86400)}d ${Math.floor((telemetry.uptime_seconds % 86400) / 3600)}h ${Math.floor((telemetry.uptime_seconds % 3600) / 60)}m`
    : "—";

  return (
    <div
      className={`app-shell ${prefs?.animation === "reduced" ? "reduce-motion" : ""}`}
    >
      <div className="ambient-grid" aria-hidden="true" />
      <header className="app-header">
        <Link to="/" className="brand">
          <div className="brand-symbol">
            <Command size={22} />
          </div>
          <div>
            <strong>J.A.R.V.I.S.</strong>
            <span>PERSONAL INTELLIGENCE SYSTEM</span>
          </div>
        </Link>
        <nav aria-label="Navegação principal">
          <NavLink to="/" end>
            <LayoutDashboard size={16} />
            <span>Central de comando</span>
          </NavLink>
          <NavLink to="/memory">
            <Brain size={16} />
            <span>Memória</span>
          </NavLink>
          <NavLink to="/activity">
            <ActivityIcon size={16} />
            <span>Atividade</span>
          </NavLink>
        </nav>
        <div className="header-right">
          <div className={`online-status ${online ? "" : "offline"}`}>
            <span className="status-light" />
            {online ? "SISTEMA ONLINE" : "CONECTANDO"}
          </div>
          <span className="header-separator" />
          <NavLink
            to="/settings"
            className="settings-link"
            aria-label="Configurações"
          >
            <Settings size={19} />
          </NavLink>
          <div className="user-avatar" title="Instância pessoal">
            {prefs?.preferred_name
              ? prefs.preferred_name.slice(0, 2).toUpperCase()
              : "EU"}
          </div>
        </div>
      </header>
      <main className="main-container">
        <AnimatePresence>
          {(error || notice) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`notification-banner ${error ? "error-banner" : ""}`}
              role={error ? "alert" : "status"}
            >
              <Radio size={16} />
              <span>{error || notice}</span>
              <button
                className="icon-button"
                aria-label="Dispensar aviso"
                onClick={() => {
                  setError("");
                  setNotice("");
                  if (state === "error") setState("idle");
                }}
              >
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <div className="dashboard-heading">
                  <div>
                    <span className="eyebrow">
                      <span className="tiny-cross">+</span> COMMAND CENTER{" "}
                      <ChevronRight size={11} /> VISÃO GERAL
                    </span>
                    <h1>
                      Bem-vindo
                      {prefs?.preferred_name
                        ? `, ${prefs.preferred_name}`
                        : " de volta"}
                      <span>.</span>
                    </h1>
                    <p>Todos os seus sistemas. Uma única inteligência.</p>
                  </div>
                  <div className="session-label">
                    <ShieldCheck size={15} />
                    <div>
                      <span>SESSÃO PESSOAL</span>
                      <strong>
                        {online
                          ? "Conexão com o servidor ativa"
                          : "Aguardando conexão com o servidor"}
                      </strong>
                    </div>
                  </div>
                </div>
                <div className="dashboard-grid">
                  <aside className="left-column">
                    <Panel title="Diagnóstico do sistema" icon={Cpu} tag="LIVE">
                      <div className="host-label">
                        <span className="status-light" />
                        HOST NA NUVEM
                        <span>{telemetry?.platform.toUpperCase() || "—"}</span>
                      </div>
                      <div className="cpu-metric">
                        <div>
                          <span>PROCESSADOR</span>
                          <strong>
                            {telemetry ? telemetry.cpu_percent.toFixed(1) : "—"}
                            <small>%</small>
                          </strong>
                        </div>
                        <div className="metric-icon">
                          <Cpu size={25} />
                        </div>
                      </div>
                      <Sparkline values={history} />
                      <div className="chart-labels">
                        <span>ÚLTIMAS AMOSTRAS</span>
                        <span>{telemetry?.cpu_count || "—"} CORES</span>
                      </div>
                      <div className="metric-divider" />
                      <div className="resource-metric">
                        <div>
                          <span>
                            <Brain size={13} />
                            Memória RAM
                          </span>
                          <strong>
                            {telemetry
                              ? `${telemetry.memory_percent.toFixed(1)}%`
                              : "—"}
                          </strong>
                        </div>
                        <div className="meter">
                          <i
                            style={{
                              width: `${telemetry?.memory_percent || 0}%`,
                            }}
                          />
                        </div>
                        <p>
                          {telemetry
                            ? `${bytes(telemetry.memory_used)} de ${bytes(telemetry.memory_total)}`
                            : "Aguardando leitura"}
                        </p>
                      </div>
                      <div className="resource-metric">
                        <div>
                          <span>
                            <HardDrive size={13} />
                            Armazenamento
                          </span>
                          <strong>
                            {telemetry
                              ? `${telemetry.disk_percent.toFixed(1)}%`
                              : "—"}
                          </strong>
                        </div>
                        <div className="meter disk-meter">
                          <i
                            style={{
                              width: `${telemetry?.disk_percent || 0}%`,
                            }}
                          />
                        </div>
                        <p>
                          {telemetry
                            ? `${bytes(telemetry.disk_free)} disponíveis`
                            : "Aguardando leitura"}
                        </p>
                      </div>
                      <div className="hardware-pair">
                        <div>
                          <Thermometer size={14} />
                          <span>TEMPERATURA</span>
                          <strong>
                            {telemetry?.temperature_c != null
                              ? `${telemetry.temperature_c}°C`
                              : "N/D"}
                          </strong>
                        </div>
                        <div>
                          <Zap size={14} />
                          <span>GPU</span>
                          <strong>
                            {telemetry?.gpu_percent != null
                              ? `${telemetry.gpu_percent}%`
                              : "N/D"}
                          </strong>
                        </div>
                      </div>
                      <button
                        className="panel-link"
                        onClick={() => setDiagnostics(true)}
                      >
                        Ver diagnóstico completo
                        <ArrowUpRight size={14} />
                      </button>
                    </Panel>
                    <Panel title="Conectividade" icon={Network} tag="I/O">
                      <div className="network-head">
                        <span className="status-light" />
                        <strong>
                          {telemetry ? "Telemetria conectada" : "Reconectando…"}
                        </strong>
                        <span className="network-protocol">WS</span>
                      </div>
                      <div className="network-stats">
                        <div>
                          <ArrowDown size={14} />
                          <strong>
                            {telemetry
                              ? bytes(telemetry.network_received)
                              : "—"}
                          </strong>
                          <span>RECEBIDOS · TOTAL</span>
                        </div>
                        <div>
                          <ArrowUp size={14} />
                          <strong>
                            {telemetry ? bytes(telemetry.network_sent) : "—"}
                          </strong>
                          <span>ENVIADOS · TOTAL</span>
                        </div>
                      </div>
                      <div className="uptime-row">
                        <Clock3 size={12} />
                        <span>UPTIME</span>
                        <strong>{uptime}</strong>
                      </div>
                    </Panel>
                    <div className="system-footnote">
                      <ShieldCheck size={13} />
                      <span>
                        Métricas reais do servidor.
                        <br />
                        Seu computador requer o agente local.
                      </span>
                    </div>
                  </aside>
                  <section
                    className="center-column"
                    aria-label="Interface do assistente"
                  >
                    <div className="neural-stage">
                      <div className="stage-top">
                        <span>
                          <i />
                          NEURAL CORE
                        </span>
                        <span>JARVIS / V.1.0</span>
                      </div>
                      <div className="stage-cross top-left">+</div>
                      <div className="stage-cross top-right">+</div>
                      <Suspense
                        fallback={
                          <div className="core-loading">
                            <LoaderCircle className="spinning" />
                          </div>
                        }
                      >
                        <Core
                          state={state}
                          amplitude={voice.amplitude}
                          reduced={prefs?.animation === "reduced"}
                        />
                      </Suspense>
                      <div className="core-status">
                        <span
                          className={`status-light ${state === "error" ? "warning" : ""}`}
                        />
                        {stateNames[state]}
                        <span className="status-sequence">
                          {state === "idle" ? "STANDBY" : "ACTIVE"}
                        </span>
                      </div>
                      <div className="voice-controls">
                        <button
                          className={`voice-button ${voice.recording ? "recording" : ""}`}
                          disabled={!prefs}
                          onClick={() => {
                            if (voice.recording) voice.finishRecording();
                            else {
                              interrupt();
                              void voice.startRecording();
                            }
                          }}
                        >
                          <Mic size={19} />
                          {voice.recording
                            ? "Finalizar fala"
                            : "Iniciar escuta"}
                          <span className="key-hint">MIC</span>
                        </button>
                        <button
                          className={`round-button ${prefs?.speech_enabled ? "enabled" : ""}`}
                          aria-label={
                            prefs?.speech_enabled
                              ? "Silenciar voz"
                              : "Ativar voz"
                          }
                          onClick={() => void toggleSpeech()}
                        >
                          {prefs?.speech_enabled ? (
                            <Volume2 size={18} />
                          ) : (
                            <VolumeX size={18} />
                          )}
                        </button>
                        {(busy ||
                          state === "speaking" ||
                          state === "generating" ||
                          voice.recording ||
                          voice.wakeListening) && (
                          <button
                            className="round-button interrupt-button"
                            aria-label="Interromper"
                            onClick={interrupt}
                          >
                            <Square size={15} />
                          </button>
                        )}
                        {prefs?.wake_enabled && (
                          <button
                            className={`round-button ${voice.wakeListening ? "enabled" : ""}`}
                            aria-label={
                              voice.wakeListening
                                ? "Parar escuta da frase"
                                : "Escutar frase de ativação"
                            }
                            onClick={() =>
                              voice.wakeListening
                                ? voice.stop()
                                : voice.startWake()
                            }
                          >
                            <Radio size={18} />
                          </button>
                        )}
                      </div>
                      <p className="mic-hint">
                        {voice.recording
                          ? (status?.transcription.provider === "browser" ? "MICROFONE ATIVO · reconhecimento do navegador" : "MICROFONE ATIVO · silêncio encerra a gravação")
                          : voice.wakeListening
                            ? `MICROFONE ATIVO · aguardando “${prefs?.wake_phrase}”`
                            : "Ative o microfone ou digite um comando abaixo"}
                      </p>
                      <div className="stage-bottom">
                        <span>
                          <Brain size={11} /> {status?.chat.label || "OpenRouter"}
                        </span>
                        <span>
                          <AudioLines size={11} /> FISH AUDIO VOICE
                        </span>
                      </div>
                    </div>
                    <section className="conversation-panel">
                      <div className="conversation-heading">
                        <span>
                          <AudioLines size={14} /> CANAL DE COMUNICAÇÃO
                        </span>
                        <div>
                          <span className="history-count">
                            {messages.filter((m) => m.role === "user").length}{" "}
                            COMANDOS
                          </span>
                          <button
                            className="icon-button"
                            aria-label="Apagar histórico de conversa"
                            disabled={busy}
                            onClick={() => setConfirmClear(true)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <div
                        className="conversation-content"
                        ref={conversationRef}
                        aria-live="polite"
                        aria-relevant="additions text"
                      >
                        {messages.length === 0 ? (
                          <div className="conversation-welcome">
                            <div className="assistant-mark">
                              <AudioLines size={17} />
                            </div>
                            <div>
                              <div className="message-author">
                                J.A.R.V.I.S. <span>INTERFACE</span>
                              </div>
                              <p>À sua disposição.</p>
                              <span>O que vamos fazer hoje?</span>
                              {status?.chat.status === "missing" && (
                                <Link to="/settings" className="setup-inline">
                                  Configure as conexões para começar
                                  <ArrowUpRight size={11} />
                                </Link>
                              )}
                            </div>
                          </div>
                        ) : (
                          messages.map((message) => (
                            <div
                              key={message.id}
                              className={`message message-${message.role}`}
                            >
                              <div className="message-author">
                                {message.role === "user"
                                  ? "VOCÊ"
                                  : prefs?.assistant_name || "J.A.R.V.I.S."}
                                <time>
                                  {new Intl.DateTimeFormat("pt-BR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    timeZone: "America/Sao_Paulo",
                                  }).format(new Date(message.created_at))}
                                </time>
                              </div>
                              <p>
                                {message.content || (
                                  <span className="thinking-dots">
                                    <i />
                                    <i />
                                    <i />
                                  </span>
                                )}
                                {message.partial && message.content && (
                                  <span className="typing-cursor" />
                                )}
                              </p>
                              {message.role === "assistant" &&
                                message.content &&
                                !message.partial && (
                                  <button
                                    className="text-button replay-button"
                                    onClick={() => {
                                      void voice.prepare();
                                      void voice.speak(message.content);
                                    }}
                                    aria-label="Ouvir resposta com Fish Audio"
                                  >
                                    <Volume2 size={12} />
                                    Ouvir
                                  </button>
                                )}
                            </div>
                          ))
                        )}
                      </div>
                      {approvals.map((approval) => (
                        <div className="approval-card" key={approval.id}>
                          <ShieldCheck size={18} />
                          <div>
                            <strong>Autorização necessária</strong>
                            <span>
                              {approval.name === "save_memory"
                                ? "Salvar memória"
                                : approval.name === "launch_application"
                                  ? "Abrir aplicativo"
                                  : "Abrir site"}
                              :{" "}
                              {String(
                                approval.arguments.content ||
                                  approval.arguments.application ||
                                  approval.arguments.url,
                              )}
                            </span>
                            <p>
                              A ação ainda não foi executada. A proposta expira
                              em 5 minutos.
                            </p>
                            <div>
                              <button
                                className="primary-button"
                                onClick={() => void decide(approval, true)}
                              >
                                <Check size={13} />
                                Aprovar
                              </button>
                              <button
                                className="secondary-button"
                                onClick={() => void decide(approval, false)}
                              >
                                Recusar
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </section>
                  </section>
                  <aside className="right-column">
                    <Panel
                      title="Intelligence hub"
                      icon={Radio}
                      tag="LOCAL TIME"
                    >
                      <div className="clock-top">
                        <span>{weekday.toUpperCase()}</span>
                        <span>
                          <span className="tiny-cross">+</span>
                        </span>
                      </div>
                      <div className="clock-display">
                        {time}
                        <small>{seconds}</small>
                      </div>
                      <div className="clock-date">{dateLabel}</div>
                      <div className="timezone">
                        SÃO PAULO <i /> UTC−03:00
                      </div>
                      <div className="hub-status">
                        <span className="status-light" />
                        FOCO NO QUE IMPORTA
                        <Clock3 size={13} />
                      </div>
                    </Panel>
                    <Panel
                      title="Tarefas e lembretes"
                      icon={ListChecks}
                      action={
                        <button
                          className="icon-button"
                          aria-label="Adicionar tarefa"
                          onClick={() => setAddingTask(true)}
                        >
                          <Plus size={17} />
                        </button>
                      }
                    >
                      <div className="task-summary">
                        <span>SEU PRÓXIMO MOVIMENTO</span>
                        <strong>
                          {pendingTasks.length.toString().padStart(2, "0")}
                        </strong>
                      </div>
                      {pendingTasks.length === 0 ? (
                        <div className="tasks-empty">
                          <CircleCheck size={27} />
                          <strong>Tudo em seu tempo.</strong>
                          <p>
                            Um espaço livre para organizar
                            <br />o que vem a seguir.
                          </p>
                          <button
                            className="text-button"
                            onClick={() => setAddingTask(true)}
                          >
                            <Plus size={13} />
                            Adicionar uma tarefa
                          </button>
                        </div>
                      ) : (
                        <div className="compact-task-list">
                          {pendingTasks.slice(0, 4).map((task) => (
                            <div className="task-row" key={task.id}>
                              <button
                                className="task-check"
                                aria-label={`Concluir ${task.title}`}
                                onClick={async () => {
                                  try {
                                    await api(`/tasks/${task.id}`, "PATCH", {
                                      done: true,
                                    });
                                    await refresh();
                                  } catch (e) {
                                    onError((e as Error).message);
                                  }
                                }}
                              />
                              <div>
                                <strong>{task.title}</strong>
                                <span
                                  className={
                                    task.due_at && new Date(task.due_at) < now
                                      ? "overdue"
                                      : ""
                                  }
                                >
                                  {task.due_at
                                    ? date(task.due_at)
                                    : "Sem prazo definido"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <Link className="panel-link" to="/tasks">
                        Ver todas as tarefas
                        <ChevronRight size={14} />
                      </Link>
                    </Panel>
                    <Panel title="Acesso rápido" icon={Zap} tag="TOOLS">
                      <div className="quick-commands">
                        <button onClick={() => setDiagnostics(true)}>
                          <span>
                            <Cpu size={16} />
                            Analisar sistema
                          </span>
                          <ArrowUpRight size={13} />
                        </button>
                        <button onClick={() => setAddingTask(true)}>
                          <span>
                            <Plus size={16} />
                            Criar um lembrete
                          </span>
                          <ArrowUpRight size={13} />
                        </button>
                        <Link to="/memory">
                          <span>
                            <Brain size={16} />
                            Consultar memórias
                          </span>
                          <ArrowUpRight size={13} />
                        </Link>
                      </div>
                    </Panel>
                  </aside>
                </div>
                <div className="terminal-panel">
                  <div className="terminal-label">
                    <Terminal size={17} />
                    <span>
                      COMMAND
                      <br />
                      <strong>TERMINAL</strong>
                    </span>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send(input);
                    }}
                  >
                    <span className="terminal-prompt">❯</span>
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Diga o que precisa. JARVIS cuida do próximo passo."
                      aria-label="Digite um comando para JARVIS"
                      maxLength={8000}
                      disabled={busy}
                    />
                    <span className="terminal-enter">ENTER ↵</span>
                    <button
                      className="send-button"
                      disabled={busy || !input.trim()}
                      aria-label="Enviar comando"
                    >
                      {busy ? (
                        <LoaderCircle size={18} className="spinning" />
                      ) : (
                        <Send size={18} />
                      )}
                    </button>
                  </form>
                  <button
                    className="terminal-mic"
                    aria-label={
                      voice.recording ? "Finalizar gravação" : "Gravar comando"
                    }
                    onClick={() => {
                      if (voice.recording) voice.finishRecording();
                      else {
                        interrupt();
                        void voice.startRecording();
                      }
                    }}
                  >
                    {voice.recording ? <MicOff size={19} /> : <Mic size={19} />}
                  </button>
                </div>
                <div className="dashboard-lower">
                  <div className="recent-heading">
                    <span>
                      <ActivityIcon size={13} /> ATIVIDADE RECENTE
                    </span>
                    <Link to="/activity">
                      VER REGISTRO
                      <ChevronRight size={11} />
                    </Link>
                  </div>
                  <div className="recent-events">
                    {activity.length > 0 ? (
                      activity.slice(0, 3).map((item) => (
                        <div key={item.id}>
                          <span
                            className={`event-dot ${item.status === "error" ? "warning" : ""}`}
                          />
                          <span>{item.detail || item.action}</span>
                          <time>
                            {new Intl.DateTimeFormat("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                              timeZone: "America/Sao_Paulo",
                            }).format(new Date(item.created_at))}
                          </time>
                        </div>
                      ))
                    ) : (
                      <div>
                        <span className="event-dot" />
                        <span>
                          Seu assistente está pronto. As ações serão registradas
                          aqui.
                        </span>
                        <time>—</time>
                      </div>
                    )}
                  </div>
                </div>
              </>
            }
          />
          <Route path="/memory" element={<MemoryPage onError={onError} />} />
          <Route
            path="/tasks"
            element={
              <TasksPage
                tasks={tasks}
                refresh={() => void refresh()}
                onError={onError}
              />
            }
          />
          <Route
            path="/activity"
            element={<ActivityPage onError={onError} />}
          />
          <Route
            path="/settings"
            element={
              prefs ? (
                <SettingsPage
                  onRefresh={() => void refresh()}
                  prefs={prefs}
                  status={status}
                  onSaved={(value) => {
                    setPrefs(value);
                    void refresh();
                  }}
                  onError={onError}
                  testVoice={() => {
                    void voice.prepare();
                    void voice.speak(
                      "Olá. Eu sou JARVIS, seu assistente pessoal. Estou à sua disposição.",
                    );
                  }}
                />
              ) : (
                <div className="empty-state">
                  <LoaderCircle className="spinning" />
                  <p>Aguardando o servidor…</p>
                </div>
              )
            }
          />
          <Route
            path="*"
            element={
              <div className="empty-state">
                <h1>Esta rota não existe.</h1>
                <Link to="/" className="primary-button">
                  Voltar à central
                </Link>
              </div>
            }
          />
        </Routes>
      </main>
      <footer className="app-footer">
        <span>
          <span className="footer-brand">J.A.R.V.I.S.</span>
          <span className="footer-version">SYSTEM V.1.0</span>
        </span>
        <div className="provider-status">
          <Link to="/settings">
            <i className={status?.chat.status === "missing" ? "warning" : ""} />
            {status?.chat.label || "OpenRouter"}{" "}
            <span>{status ? connectionNames[status.chat.status] : "—"}</span>
          </Link>
          <Link to="/settings">
            <i className={status?.fish.status === "missing" ? "warning" : ""} />
            FISH AUDIO{" "}
            <span>{status ? connectionNames[status.fish.status] : "—"}</span>
          </Link>
        </div>
        <span className="footer-signature">
          DESIGNED FOR YOUR NEXT MOVE
          <ArrowUpRight size={11} />
        </span>
      </footer>
      {addingTask && (
        <Modal
          title="Nova tarefa ou lembrete"
          onClose={() => setAddingTask(false)}
        >
          <TaskForm
            onError={onError}
            onSaved={() => {
              setAddingTask(false);
              void refresh();
            }}
          />
        </Modal>
      )}
      {diagnostics && (
        <Modal
          title="Diagnóstico completo"
          onClose={() => setDiagnostics(false)}
        >
          <div className="diagnostics-modal">
            <div className="privacy-note">
              <Cpu size={18} />
              <p>
                Leituras reais do servidor do JARVIS. O computador do usuário
                não está sendo monitorado.
              </p>
            </div>
            {telemetry ? (
              <dl>
                {[
                  [
                    "Processador",
                    `${telemetry.cpu_percent}% · ${telemetry.cpu_count} núcleos`,
                  ],
                  [
                    "Memória",
                    `${bytes(telemetry.memory_used)} / ${bytes(telemetry.memory_total)}`,
                  ],
                  [
                    "Disco disponível",
                    `${bytes(telemetry.disk_free)} / ${bytes(telemetry.disk_total)}`,
                  ],
                  ["Sistema", telemetry.platform],
                  ["Tempo ativo", uptime],
                  [
                    "Bateria",
                    telemetry.battery_percent != null
                      ? `${telemetry.battery_percent}%`
                      : "Não disponível neste host",
                  ],
                  [
                    "GPU",
                    telemetry.gpu_percent != null
                      ? `${telemetry.gpu_percent}%`
                      : "Não disponível neste host",
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>Aguardando telemetria do servidor.</p>
            )}
          </div>
        </Modal>
      )}
      {confirmClear && (
        <Modal
          title="Apagar histórico de conversa?"
          onClose={() => setConfirmClear(false)}
        >
          <p className="modal-text">
            O histórico de texto será removido do banco local. Memórias e
            tarefas serão preservadas.
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              onClick={() => setConfirmClear(false)}
            >
              Cancelar
            </button>
            <button
              className="danger-button"
              onClick={async () => {
                try {
                  await api("/messages", "DELETE");
                  setMessages([]);
                  setConfirmClear(false);
                  await refresh();
                } catch (e) {
                  onError((e as Error).message);
                }
              }}
            >
              Apagar histórico
            </button>
          </div>
        </Modal>
      )}
      {auth && (
        <Modal title="Acesso ao JARVIS" onClose={() => {}}>
          <form
            className="task-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/login", "POST", { token: password });
                setPassword("");
                await initialize();
                setError("");
              } catch (error) {
                onError((error as Error).message);
              }
            }}
          >
            <p className="field-help">
              Digite a senha desta instância. Esta senha não é sua chave de API.
            </p>
            <label>
              Senha de acesso
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="primary-button">
              <ShieldCheck size={16} />
              Entrar
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default App;
