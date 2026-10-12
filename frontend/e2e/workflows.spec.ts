import { test, expect } from "@playwright/test";

test("dashboard shows real telemetry and responsive layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("SISTEMA ONLINE", { exact: true })).toBeVisible();
  await expect(page.getByText("Telemetria conectada")).toBeVisible();
  await page.getByRole("button", { name: "Ver diagnóstico completo" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Leituras reais do servidor",
  );
  await expect(page.getByRole("dialog")).toContainText("núcleos");
  await page.getByRole("button", { name: "Fechar janela" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Iniciar escuta" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: "/tmp/jarvis-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("tasks can be created, persisted, completed and deleted", async ({
  page,
  request,
}) => {
  const title = `Teste navegador ${Date.now()}`;
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Adicionar tarefa", exact: true })
      .click();
    await page.getByLabel("O que você precisa fazer?").fill(title);
    await page
      .getByRole("button", { name: "Adicionar tarefa", exact: true })
      .last()
      .click();
    await expect(
      page.locator(".compact-task-list").getByText(title, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.locator(".compact-task-list").getByText(title, { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: `Concluir ${title}`, exact: true })
      .click();
    await expect(
      page.locator(".compact-task-list").getByText(title, { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Ver todas as tarefas" }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Excluir tarefa ${title}` }).click();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  } finally {
    const tasks = await (await request.get("/api/tasks")).json();
    for (const task of tasks)
      if (task.title === title) await request.delete(`/api/tasks/${task.id}`);
  }
});

test("memory can be explicitly saved, edited, searched and deleted", async ({
  page,
  request,
}) => {
  const content = `Nota teste ${Date.now()}`;
  const edited = `${content} editada`;
  try {
    await page.goto("/memory");
    await page
      .getByRole("button", { name: "Salvar memória", exact: true })
      .first()
      .click();
    await page.getByLabel("O que JARVIS deve lembrar?").fill(content);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Salvar memória", exact: true })
      .click();
    await expect(page.getByText(content, { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Editar memória", exact: true })
      .click();
    await page.getByLabel("O que JARVIS deve lembrar?").fill(edited);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Salvar memória", exact: true })
      .click();
    await expect(page.getByText(edited, { exact: true })).toBeVisible();
    await page
      .getByRole("textbox", { name: "Buscar memórias" })
      .fill("termo que não existe");
    await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Buscar memórias" }).fill(content);
    await page
      .getByRole("button", { name: "Excluir memória", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Excluir memória", exact: true })
      .click();
    await expect(page.getByText(edited, { exact: true })).toHaveCount(0);
  } finally {
    const memories = await (await request.get("/api/memories")).json();
    for (const memory of memories)
      if (memory.content === content || memory.content === edited)
        await request.delete(`/api/memories/${memory.id}`);
  }
});

test("settings persist and clear history requires confirmation", async ({
  page,
  request,
}) => {
  const original = await (await request.get("/api/settings")).json();
  try {
    await page.goto("/settings");
    await page.getByLabel("Como deseja ser chamado?").fill("Comandante");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(
      page.getByRole("button", { name: "Preferências salvas" }),
    ).toBeVisible();
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Bem-vindo, Comandante." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Apagar histórico de conversa" })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Memórias e tarefas serão preservadas",
    );
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  } finally {
    await request.put("/api/settings", { data: original });
  }
});

test("missing provider credentials show actionable error without fake AI response", async ({
  page,
}) => {
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Configure GROQ_API_KEY no servidor." }),
    }),
  );
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Digite um comando para JARVIS" })
    .fill("Jarvis, você está online?");
  await page.getByRole("button", { name: "Enviar comando" }).click();
  await expect(page.getByRole("alert")).toContainText("Configure GROQ_API_KEY");
  await expect(
    page.getByText("Não foi possível gerar a resposta.", { exact: true }),
  ).toBeVisible();
});

// The following test uses simulated provider responses, a real browser recorder,
// and a generated audio fixture. It does NOT validate actual Groq/Fish credentials.
function syntheticWav(seconds = 8) {
  const sampleRate = 22050,
    samples = sampleRate * seconds;
  const result = Buffer.alloc(44 + samples * 2);
  result.write("RIFF", 0);
  result.writeUInt32LE(36 + samples * 2, 4);
  result.write("WAVEfmt ", 8);
  result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20);
  result.writeUInt16LE(1, 22);
  result.writeUInt32LE(sampleRate, 24);
  result.writeUInt32LE(sampleRate * 2, 28);
  result.writeUInt16LE(2, 32);
  result.writeUInt16LE(16, 34);
  result.write("data", 36);
  result.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    result.writeInt16LE(
      Math.round(Math.sin((i * 440 * 2 * Math.PI) / sampleRate) * 8000),
      44 + i * 2,
    );
  return result;
}

test("simulated voice pipeline records, transcribes, streams, plays, reacts and accepts another turn", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "GET") {
      const response = await route.fetch();
      const settings = await response.json();
      await route.fulfill({ json: { ...settings, speech_enabled: true } });
    } else await route.continue();
  });
  let transcriptions = 0,
    speechCalls = 0;
  await page.route("**/api/transcribe", (route) => {
    transcriptions++;
    return route.fulfill({ json: { text: "Jarvis, que horas são?" } });
  });
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body: [
        '{"type":"delta","text":"Estou à sua disposição."}',
        '{"type":"done","text":"Estou à sua disposição."}',
        "",
      ].join("\n"),
    }),
  );
  await page.route("**/api/speech", (route) => {
    speechCalls++;
    return route.fulfill({ contentType: "audio/wav", body: syntheticWav() });
  });
  await page.goto("/");
  await expect(page.getByText("SISTEMA ONLINE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Iniciar escuta" }).click();
  await expect(
    page.getByText("MICROFONE ATIVO · silêncio encerra a gravação"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finalizar fala" }).click();
  await expect(page.locator(".core-status")).toContainText(
    "JARVIS está falando",
  );
  await expect
    .poll(async () =>
      page
        .locator(".ai-core")
        .evaluate((el) =>
          Number((el as HTMLElement).style.getPropertyValue("--amplitude")),
        ),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Interromper", exact: true }).click();
  await expect(page.locator(".core-status")).toContainText(
    "Pronto para ajudar",
  );
  await page.getByRole("button", { name: "Iniciar escuta" }).click();
  await page.getByRole("button", { name: "Finalizar fala" }).click();
  await expect.poll(() => speechCalls).toBe(2);
  expect(transcriptions).toBe(2);
  await page.getByRole("button", { name: "Interromper", exact: true }).click();
});

test("Fish Audio failure preserves the text and displays a voice warning", async ({
  page,
}) => {
  await page.route("**/api/settings", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), speech_enabled: true },
    });
  });
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body: '{"type":"delta","text":"A resposta permanece aqui."}\n{"type":"done","text":"A resposta permanece aqui."}\n',
    }),
  );
  await page.route("**/api/speech", (route) =>
    route.fulfill({ status: 429, json: { detail: "Limite de uso atingido." } }),
  );
  await page.goto("/");
  await expect(page.getByText("SISTEMA ONLINE", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Digite um comando para JARVIS" })
    .fill("Olá");
  await page.getByRole("button", { name: "Enviar comando" }).click();
  await expect(page.getByRole("alert")).toContainText("Voz indisponível");
  await expect(
    page.getByText("A resposta permanece aqui.", { exact: true }),
  ).toBeVisible();
});

test("microphone permission denial remains visible and text input works", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Permission denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await expect(page.getByText("SISTEMA ONLINE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Iniciar escuta" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Acesso ao microfone recusado",
  );
  await expect(
    page.getByRole("textbox", { name: "Digite um comando para JARVIS" }),
  ).toBeEnabled();
  await expect(
    page.getByText("MICROFONE ATIVO · silêncio encerra a gravação"),
  ).toHaveCount(0);
});

for (const speechEnabled of [false, true]) {
  test(`text still works when audio initialization fails (speech enabled: ${speechEnabled})`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "AudioContext", {
        value: class {
          constructor() {
            throw new DOMException(
              "Audio initialization unavailable",
              "NotSupportedError",
            );
          }
        },
      });
    });
    await page.route("**/api/settings", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        json: { ...(await response.json()), speech_enabled: speechEnabled },
      });
    });
    let calls = 0;
    await page.route("**/api/chat", (route) => {
      calls++;
      return route.fulfill({
        contentType: "application/x-ndjson",
        body: '{"type":"delta","text":"Texto funciona mesmo sem áudio."}\n{"type":"done","text":"Texto funciona mesmo sem áudio."}\n',
      });
    });
    await page.goto("/");
    await expect(
      page.getByText("SISTEMA ONLINE", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Digite um comando para JARVIS" })
      .fill("oi");
    await page.getByRole("button", { name: "Enviar comando" }).click();
    await expect(
      page.getByText("Texto funciona mesmo sem áudio.", { exact: true }),
    ).toBeVisible();
    expect(calls).toBe(1);
    if (speechEnabled)
      await expect(page.getByRole("alert")).toContainText("Voz indisponível");
    else await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

test("settings distinguishes a missing voice reference from a successful OpenRouter connection", async ({
  page,
}) => {
  await page.route("**/api/providers/chat/check", (route) =>
    route.fulfill({ json: { status: "verified", message: "OpenRouter: conexão verificada e modelo disponível." } }),
  );
  await page.route("**/api/providers/fish/voice/check", (route) =>
    route.fulfill({
      status: 404,
      json: {
        provider: "fish",
        detail:
          "Fish Audio: a referência de voz não foi encontrada ou não está acessível nesta conta.",
      },
    }),
  );
  await page.goto("/settings");
  await page
    .getByRole("button", { name: "Verificar conexão OpenRouter", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "OpenRouter: conexão verificada e modelo disponível.",
  );
  await page
    .getByRole("button", {
      name: "Verificar referência Fish Audio",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Fish Audio: a referência de voz",
  );
  await expect(page.getByRole("alert")).not.toContainText("Groq:");
});

// Simulated native recognition events; actual browser service availability is account/network dependent.
test("browser recognition sends text to OpenRouter without a Groq transcription request", async ({ page, context }) => {
  await context.grantPermissions(["microphone"]);
  await page.addInitScript(() => {
    class Recognition {
      continuous = false; interimResults = true; lang = "pt-BR";
      onresult: ((event: unknown) => void) | null = null;
      onerror = null; onend: (() => void) | null = null;
      timer: ReturnType<typeof setTimeout> | undefined;
      start() {
        this.timer = setTimeout(() => {
          this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: "Olá pelo microfone" }, isFinal: true }] });
          this.onend?.();
        }, 500);
      }
      stop() { clearTimeout(this.timer); this.onend?.(); }
      abort() { clearTimeout(this.timer); }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: Recognition });
  });
  await page.route("**/api/status", async route => {
    const response = await route.fetch();
    const status = await response.json();
    await route.fulfill({ json: { ...status, transcription: {provider: "browser"} } });
  });
  await page.route("**/api/settings", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    await route.fulfill({json: {...await response.json(), speech_enabled: false}});
  });
  let transcriptions = 0, chats = 0;
  await page.route("**/api/transcribe", route => { transcriptions++; return route.abort(); });
  await page.route("**/api/chat", route => {
    chats++;
    expect(route.request().postDataJSON().message).toBe("Olá pelo microfone");
    return route.fulfill({contentType: "application/x-ndjson", body: '{"type":"delta","text":"Resposta OpenRouter."}\n{"type":"done","text":"Resposta OpenRouter."}\n'});
  });
  await page.goto("/");
  await expect(page.getByText("SISTEMA ONLINE", {exact: true})).toBeVisible();
  await page.getByRole("button", {name: "Iniciar escuta"}).click();
  await expect(page.getByText("Resposta OpenRouter.", {exact: true})).toBeVisible();
  expect(chats).toBe(1);
  expect(transcriptions).toBe(0);
  await expect(page.getByRole("button", {name: "Iniciar escuta"})).toBeVisible();
});
