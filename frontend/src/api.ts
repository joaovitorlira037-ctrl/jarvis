export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function checked(response: Response): Promise<Response> {
  if (!response.ok) {
    let message = `Solicitação não concluída (${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail))
        message = "Confira os campos preenchidos e tente novamente.";
    } catch {
      /* response may not be JSON */
    }
    if (response.status === 401 && !message.includes("Credencial"))
      window.dispatchEvent(new Event("jarvis-auth"));
    throw new ApiError(message, response.status);
  }
  return response;
}

export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await checked(
    await fetch(`/api${path}`, {
      method,
      headers:
        data === undefined ? undefined : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  );
  return response.json();
}

export async function streamChat(
  message: string,
  signal: AbortSignal,
  onEvent: (event: Record<string, unknown>) => void,
) {
  const response = await checked(
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal,
    }),
  );
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop()!;
      for (const line of lines) if (line.trim()) onEvent(JSON.parse(line));
      if (done) break;
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer));
  } finally {
    reader.releaseLock();
  }
}
