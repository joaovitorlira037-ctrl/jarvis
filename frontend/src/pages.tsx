import { useEffect, useState } from "react";
import {
  Brain,
  Plus,
  Trash2,
  Search,
  Check,
  ShieldCheck,
  AudioLines,
  SlidersHorizontal,
  Link2,
  Mic,
  Eye,
  RefreshCw,
  LockKeyhole,
  Monitor,
  ListChecks,
  Pencil,
} from "lucide-react";
import { api } from "./api";
import { Panel, date, Modal } from "./components";
import type { Activity, Memory, Preferences, Status, Task } from "./types";

export function TaskForm({
  onSaved,
  onError,
}: {
  onSaved: () => void;
  onError: (s: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="task-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await api("/tasks", "POST", {
            title,
            due_at: due ? new Date(`${due}:00-03:00`).toISOString() : null,
          });
          setTitle("");
          setDue("");
          onSaved();
        } catch (e) {
          onError((e as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <label>
        O que você precisa fazer?
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: revisar proposta do projeto"
          maxLength={240}
          required
          autoFocus
        />
      </label>
      <label>
        Lembrete · São Paulo <span className="optional">opcional</span>
        <input
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </label>
      <button className="primary-button" disabled={saving}>
        <Plus size={16} />
        {saving ? "Salvando…" : "Adicionar tarefa"}
      </button>
      <p className="field-help">
        Lembretes são destacados no painel enquanto a aplicação está aberta.
      </p>
    </form>
  );
}

export function TasksPage({
  tasks,
  refresh,
  onError,
}: {
  tasks: Task[];
  refresh: () => void;
  onError: (s: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">INTELLIGENCE HUB / PRODUTIVIDADE</span>
          <h1>Seu próximo movimento.</h1>
          <p>Tarefas e lembretes, organizados no seu ritmo.</p>
        </div>
        <button className="primary-button" onClick={() => setAdding(true)}>
          <Plus size={16} />
          Nova tarefa
        </button>
      </div>
      <div className="search-field">
        <Search size={16} />
        <input
          placeholder="Buscar tarefas"
          aria-label="Buscar tarefas"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <Panel
        title="Tarefas e lembretes"
        icon={ListChecks}
        tag={`${tasks.length} REGISTROS`}
      >
        <div className="full-task-list">
          {tasks
            .filter((t) => t.title.toLowerCase().includes(filter.toLowerCase()))
            .map((task) => (
              <div
                key={task.id}
                className={`task-row ${task.done ? "task-done" : ""}`}
              >
                <button
                  className="task-check"
                  aria-label={task.done ? "Reabrir tarefa" : "Concluir tarefa"}
                  onClick={async () => {
                    try {
                      await api(`/tasks/${task.id}`, "PATCH", {
                        done: !task.done,
                      });
                      refresh();
                    } catch (e) {
                      onError((e as Error).message);
                    }
                  }}
                >
                  {task.done && <Check size={12} />}
                </button>
                <div>
                  <strong>{task.title}</strong>
                  <span>
                    {task.due_at ? date(task.due_at) : "Sem prazo definido"}
                  </span>
                </div>
                <button
                  className="icon-button danger-hover"
                  aria-label={`Excluir tarefa ${task.title}`}
                  onClick={async () => {
                    try {
                      await api(`/tasks/${task.id}`, "DELETE");
                      refresh();
                    } catch (e) {
                      onError((e as Error).message);
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          {tasks.length === 0 && (
            <div className="empty-state">
              <ListChecks size={28} />
              <h3>Um novo espaço para suas ideias.</h3>
              <p>Comece com sua primeira tarefa.</p>
            </div>
          )}
        </div>
      </Panel>
      {adding && (
        <Modal title="Nova tarefa" onClose={() => setAdding(false)}>
          <TaskForm
            onSaved={() => {
              refresh();
              setAdding(false);
            }}
            onError={onError}
          />
        </Modal>
      )}
    </div>
  );
}

export function MemoryPage({ onError }: { onError: (s: string) => void }) {
  const [items, setItems] = useState<Memory[]>([]);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("note");
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Memory | null>(null);
  const [saving, setSaving] = useState(false);
  const refresh = async () => {
    try {
      setItems(await api<Memory[]>("/memories"));
    } catch (e) {
      onError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">NEURAL ARCHIVE / MEMÓRIA</span>
          <h1>Contexto que permanece.</h1>
          <p>JARVIS lembra apenas o que você escolhe guardar.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setEditing(null);
            setContent("");
            setCategory("note");
            setAdding(true);
          }}
        >
          <Plus size={16} />
          Salvar memória
        </button>
      </div>
      <div className="search-field">
        <Search size={16} />
        <input
          aria-label="Buscar memórias"
          placeholder="Buscar nas suas memórias"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span>{items.length} REGISTROS</span>
      </div>
      <div className="memory-grid">
        {items
          .filter((item) =>
            item.content.toLowerCase().includes(search.toLowerCase()),
          )
          .map((item) => (
            <Panel
              key={item.id}
              title={
                item.category === "preference" ? "Preferência" : "Nota pessoal"
              }
              icon={Brain}
              action={
                <div>
                  <button
                    className="icon-button"
                    aria-label="Editar memória"
                    onClick={() => {
                      setEditing(item.id);
                      setContent(item.content);
                      setCategory(item.category);
                      setAdding(true);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-button danger-hover"
                    aria-label="Excluir memória"
                    onClick={() => setDeleting(item)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              }
            >
              <p className="memory-content">{item.content}</p>
              <div className="memory-footer">
                <ShieldCheck size={12} /> SALVA POR VOCÊ
                <span>{date(item.created_at)}</span>
              </div>
            </Panel>
          ))}
      </div>
      {items.length === 0 && (
        <div className="empty-state large-empty">
          <Brain size={36} />
          <h3>Sua memória começa aqui.</h3>
          <p>
            Guarde uma preferência, uma ideia ou algo que JARVIS
            <br />
            deve considerar nas próximas conversas.
          </p>
          <button className="text-button" onClick={() => setAdding(true)}>
            Criar primeira memória <Plus size={14} />
          </button>
        </div>
      )}
      {items.length > 0 &&
        !items.some((item) =>
          item.content.toLowerCase().includes(search.toLowerCase()),
        ) && (
          <p className="empty-state">Nenhuma memória corresponde à busca.</p>
        )}
      {adding && (
        <Modal
          title={editing ? "Editar memória" : "Salvar uma memória"}
          onClose={() => setAdding(false)}
        >
          <form
            className="task-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await api(
                  editing ? `/memories/${editing}` : "/memories",
                  editing ? "PUT" : "POST",
                  { content, category },
                );
                await refresh();
                setAdding(false);
                setContent("");
                setEditing(null);
              } catch (error) {
                onError((error as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            <label>
              Categoria
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="note">Nota pessoal</option>
                <option value="preference">Preferência</option>
              </select>
            </label>
            <label>
              O que JARVIS deve lembrar?
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={2000}
                rows={4}
                required
              />
            </label>
            <p className="field-help">
              Esta informação será incluída no contexto enviado ao Groq. Evite
              senhas e dados sensíveis.
            </p>
            <button className="primary-button" disabled={saving}>
              <Check size={16} />
              Salvar memória
            </button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Excluir memória?" onClose={() => setDeleting(null)}>
          <p className="modal-text">
            Esta memória será removida do contexto de futuras conversas.
          </p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              onClick={() => setDeleting(null)}
            >
              Cancelar
            </button>
            <button
              className="danger-button"
              onClick={async () => {
                try {
                  await api(`/memories/${deleting.id}`, "DELETE");
                  await refresh();
                  setDeleting(null);
                } catch (e) {
                  onError((e as Error).message);
                }
              }}
            >
              Excluir memória
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const actionNames: Record<string, string> = {
  create_task: "Tarefa criada",
  update_task: "Tarefa atualizada",
  delete_task: "Tarefa removida",
  save_memory: "Memória salva",
  delete_memory: "Memória removida",
  settings: "Preferências atualizadas",
  conversation: "Conversa com Groq",
  system_diagnostics: "Diagnóstico do servidor",
  clear_history: "Histórico apagado",
  get_time: "Consulta de horário",
  launch_application: "Abrir aplicativo",
  open_website: "Abrir site",
  provider_groq: "Conexão Groq",
  provider_fish: "Conexão Fish Audio",
};
export function ActivityPage({ onError }: { onError: (s: string) => void }) {
  const [items, setItems] = useState<Activity[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const refresh = async () => {
    try {
      setItems(await api<Activity[]>("/activity"));
    } catch (e) {
      onError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">SYSTEM LOG / ATIVIDADE</span>
          <h1>Cada ação, à vista.</h1>
          <p>
            Acompanhe o que aconteceu, o que falhou e o que aguarda sua
            autorização.
          </p>
        </div>
        <button className="secondary-button" onClick={() => void refresh()}>
          <RefreshCw size={15} />
          Atualizar
        </button>
      </div>
      <div className="activity-toolbar">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Buscar atividade"
            placeholder="Buscar no registro de atividade"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar atividade"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Todos os resultados</option>
          <option value="success">Concluídos</option>
          <option value="error">Erros</option>
          <option value="pending">Pendentes</option>
          <option value="denied">Recusados</option>
        </select>
      </div>
      <div className="activity-table">
        <div className="activity-table-head">
          <span>HORÁRIO</span>
          <span>OPERAÇÃO</span>
          <span>DETALHES</span>
          <span>RESULTADO</span>
        </div>
        {items
          .filter(
            (item) =>
              (filter === "all" || item.status === filter) &&
              `${item.action} ${item.detail} ${actionNames[item.action] || ""}`
                .toLowerCase()
                .includes(search.toLowerCase()),
          )
          .map((item) => (
            <div className="activity-table-row" key={item.id}>
              <time>{date(item.created_at)}</time>
              <strong>{actionNames[item.action] || item.action}</strong>
              <span>{item.detail}</span>
              <span className={`result-chip result-${item.status}`}>
                {(
                  {
                    success: "CONCLUÍDO",
                    error: "ERRO",
                    pending: "PENDENTE",
                    denied: "RECUSADO",
                  } as Record<string, string>
                )[item.status] || item.status}
              </span>
            </div>
          ))}
        {items.length === 0 && (
          <div className="empty-state">
            <ShieldCheck size={30} />
            <h3>Seu registro está limpo.</h3>
            <p>As operações aparecerão aqui conforme você usa o assistente.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="toggle-row">
      <div>
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </div>
      <input
        type="checkbox"
        className="toggle"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
    </label>
  );
}

export function SettingsPage({
  prefs,
  status,
  onSaved,
  onError,
  testVoice,
  onRefresh,
}: {
  prefs: Preferences;
  status: Status | null;
  onSaved: (value: Preferences) => void;
  onError: (s: string) => void;
  testVoice: () => void;
  onRefresh: () => void;
}) {
  const [draft, setDraft] = useState(prefs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [checking, setChecking] = useState(false);
  const update = <K extends keyof Preferences>(
    name: K,
    value: Preferences[K],
  ) => {
    setDraft((current) => ({ ...current, [name]: value }));
    setSaved(false);
  };
  useEffect(() => {
    setDraft(prefs);
  }, [prefs]);
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <span className="eyebrow">SYSTEM CONFIG / PREFERÊNCIAS</span>
          <h1>Feito para você.</h1>
          <p>Ajuste a personalidade, a voz e os limites do seu assistente.</p>
        </div>
        <button
          className="primary-button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              const value = await api<Preferences>("/settings", "PUT", draft);
              onSaved(value);
              setSaved(true);
            } catch (e) {
              onError((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <Check size={16} />
          {saving
            ? "Salvando…"
            : saved
              ? "Preferências salvas"
              : "Salvar alterações"}
        </button>
      </div>
      <div className="settings-grid">
        <Panel title="Personalidade" icon={SlidersHorizontal} tag="01">
          <div className="settings-fields">
            <label>
              Nome do assistente
              <input
                value={draft.assistant_name}
                onChange={(e) => update("assistant_name", e.target.value)}
                maxLength={40}
                required
              />
            </label>
            <label>
              Como deseja ser chamado?
              <input
                placeholder="Seu nome ou tratamento preferido"
                value={draft.preferred_name}
                onChange={(e) => update("preferred_name", e.target.value)}
                maxLength={60}
              />
            </label>
            <div className="form-columns">
              <label>
                Idioma
                <select
                  value={draft.language}
                  onChange={(e) =>
                    update(
                      "language",
                      e.target.value as Preferences["language"],
                    )
                  }
                >
                  <option value="auto">Detectar automaticamente</option>
                  <option value="pt-BR">Português brasileiro</option>
                  <option value="en-US">English</option>
                </select>
              </label>
              <label>
                Estilo
                <select
                  value={draft.formality}
                  onChange={(e) =>
                    update(
                      "formality",
                      e.target.value as Preferences["formality"],
                    )
                  }
                >
                  <option value="polite">Cortês e natural</option>
                  <option value="formal">Formal</option>
                  <option value="casual">Casual</option>
                </select>
              </label>
            </div>
          </div>
        </Panel>
        <Panel title="Voz e microfone" icon={AudioLines} tag="02">
          <div className="settings-fields">
            <Toggle
              label="Respostas em voz"
              description="Voz de referência JARVIS, via Fish Audio."
              checked={draft.speech_enabled}
              onChange={(v) => update("speech_enabled", v)}
            />
            <label>
              Velocidade da fala{" "}
              <span className="range-value">
                {draft.speech_speed.toFixed(1)}×
              </span>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={draft.speech_speed}
                onChange={(e) => update("speech_speed", Number(e.target.value))}
              />
            </label>
            <div className="voice-profile">
              <div className="voice-avatar">
                <AudioLines size={24} />
              </div>
              <div>
                <strong>JARVIS · Voz de referência</strong>
                <span>FISH AUDIO / {status?.fish.model || "s2.1-pro"}</span>
              </div>
              <button
                className="icon-button"
                aria-label="Testar voz Fish Audio"
                title="Testar voz (usa a API)"
                onClick={testVoice}
              >
                <Mic size={18} />
              </button>
            </div>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                  });
                  stream.getTracks().forEach((t) => t.stop());
                  setDevices(await navigator.mediaDevices.enumerateDevices());
                } catch {
                  onError("Autorize o microfone para listar os dispositivos.");
                }
              }}
            >
              Selecionar dispositivos de áudio <RefreshCw size={13} />
            </button>
            {devices.length > 0 && (
              <div className="form-columns">
                <label>
                  Entrada
                  <select
                    value={draft.input_device}
                    onChange={(e) => update("input_device", e.target.value)}
                  >
                    <option value="">Padrão do sistema</option>
                    {devices
                      .filter((d) => d.kind === "audioinput" && d.deviceId)
                      .map((d, i) => (
                        <option key={`${d.deviceId}-${i}`} value={d.deviceId}>
                          {d.label || `Microfone ${i + 1}`}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Saída
                  <select
                    value={draft.output_device}
                    onChange={(e) => update("output_device", e.target.value)}
                  >
                    <option value="">Padrão do sistema</option>
                    {devices
                      .filter((d) => d.kind === "audiooutput" && d.deviceId)
                      .map((d, i) => (
                        <option key={`${d.deviceId}-${i}`} value={d.deviceId}>
                          {d.label || `Saída ${i + 1}`}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            )}
            <Toggle
              label="Ativação por frase"
              description="Habilita o botão de escuta da frase. Nunca ativa o microfone automaticamente."
              checked={draft.wake_enabled}
              onChange={(v) => update("wake_enabled", v)}
            />
            {draft.wake_enabled && (
              <>
                <label>
                  Frase de ativação
                  <input
                    value={draft.wake_phrase}
                    onChange={(e) => update("wake_phrase", e.target.value)}
                    maxLength={60}
                  />
                </label>
                <p className="field-help">
                  A detecção usa o reconhecimento do navegador, que pode enviar
                  áudio ao fornecedor do navegador. Inicie a escuta
                  explicitamente no painel.
                </p>
              </>
            )}
          </div>
        </Panel>
        <Panel title="Conexões de inteligência" icon={Link2} tag="03">
          <div className="settings-fields">
            <div className="integration-row">
              <div className="integration-icon groq">g</div>
              <div>
                <strong>Groq Cloud</strong>
                <span>{status?.groq.model || "llama-3.3-70b-versatile"}</span>
              </div>
              <span
                className={`connection-dot ${status?.groq.status === "missing" ? "warning" : ""}`}
              />
            </div>
            <div className="integration-row">
              <div className="integration-icon fish">
                <AudioLines size={19} />
              </div>
              <div>
                <strong>Fish Audio</strong>
                <span>
                  {status?.fish.status === "missing"
                    ? "Chave ainda não configurada"
                    : "Chave configurada no servidor"}
                </span>
              </div>
              <span
                className={`connection-dot ${status?.fish.status === "missing" ? "warning" : ""}`}
              />
            </div>
            <p className="field-help">
              <LockKeyhole size={12} /> As chaves e os modelos são configurados
              no servidor. A voz usa a referência{" "}
              <code>
                {status?.fish.voice_id || "82d13948027e4be69892dd3d0104e681"}
              </code>
              .
            </p>
            <button
              className="secondary-button"
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                try {
                  await api("/providers/groq/check", "POST");
                  onRefresh();
                } catch (e) {
                  onError((e as Error).message);
                } finally {
                  setChecking(false);
                }
              }}
            >
              <RefreshCw size={14} />
              {checking ? "Verificando…" : "Verificar conexão Groq"}
            </button>
          </div>
        </Panel>
        <Panel title="Privacidade e permissões" icon={ShieldCheck} tag="04">
          <div className="settings-fields">
            <Toggle
              label="Salvar histórico de conversa"
              description="Armazena texto localmente e o reutiliza como contexto no Groq. Ao desativar, o histórico anterior é preservado até você apagá-lo."
              checked={draft.save_history}
              onChange={(v) => update("save_history", v)}
            />
            <Toggle
              label="Permitir ferramentas do assistente"
              description="Horário, diagnósticos, tarefas e propostas de memória."
              checked={draft.tools_enabled}
              onChange={(v) => update("tools_enabled", v)}
            />
            <Toggle
              label="Permitir agente de desktop"
              description={
                status?.desktop.configured
                  ? "Aplicativos e sites permitidos; cada ação exige aprovação."
                  : "Configure o token de pareamento no servidor primeiro."
              }
              checked={draft.desktop_enabled}
              onChange={(v) => update("desktop_enabled", v)}
            />
            <div className="privacy-note">
              <Monitor size={18} />
              <p>
                O navegador não controla seu computador. O agente local precisa
                ser instalado separadamente.
              </p>
            </div>
          </div>
        </Panel>
        <Panel title="Interface" icon={Eye} tag="05">
          <div className="settings-fields">
            <div className="form-columns">
              <label>
                Animações
                <select
                  value={draft.animation}
                  onChange={(e) =>
                    update(
                      "animation",
                      e.target.value as Preferences["animation"],
                    )
                  }
                >
                  <option value="full">Completas</option>
                  <option value="reduced">Movimento reduzido</option>
                </select>
              </label>
              <label>
                Cor de destaque
                <select
                  value={draft.accent}
                  onChange={(e) =>
                    update("accent", e.target.value as Preferences["accent"])
                  }
                >
                  <option value="cyan">Ciano holográfico</option>
                  <option value="blue">Azul elétrico</option>
                  <option value="amber">Âmbar</option>
                </select>
              </label>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
