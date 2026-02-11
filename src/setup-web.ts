import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  getMissingConfigFields,
  getNumber,
  getString,
  saveRuntimeConfig,
  type RuntimeConfig,
  type TtsProvider
} from "./runtime.js";

export type SetupWebOptions = {
  host: string;
  port: number;
  token?: string;
  configPath: string;
};

export type SetupWebState = {
  running: boolean;
  host: string;
  port: number;
  token: string;
  baseUrl: string;
  url: string;
  error?: string;
};

export type SetupWebController = {
  state: SetupWebState;
  close: () => Promise<void>;
};

type SetupWebHandlers = {
  getRuntime: () => RuntimeConfig;
  onRuntimeSaved: (runtime: RuntimeConfig) => Promise<void> | void;
};

function isErrnoException(value: unknown): value is NodeJS.ErrnoException {
  return typeof value === "object" && value !== null && "code" in value;
}

async function listenOnFirstAvailablePort(server: Server, host: string, startPort: number): Promise<number> {
  let port = startPort;

  while (port <= 65535) {
    const result = await new Promise<{ ok: true } | { ok: false; error: unknown }>(resolve => {
      const onError = (error: unknown) => {
        server.off("listening", onListening);
        resolve({ ok: false, error });
      };
      const onListening = () => {
        server.off("error", onError);
        resolve({ ok: true });
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });

    if (result.ok) {
      return port;
    }

    if (isErrnoException(result.error) && result.error.code === "EADDRINUSE") {
      port += 1;
      continue;
    }

    throw result.error instanceof Error ? result.error : new Error(String(result.error));
  }

  throw new Error(`No available port from ${startPort} to 65535`);
}

function normalizeHost(host: string): string {
  const normalized = host.trim();
  const allowed = new Set(["127.0.0.1", "localhost", "::1"]);
  return allowed.has(normalized) ? normalized : "127.0.0.1";
}

function parsePort(value: number): number {
  if (Number.isInteger(value) && value > 0 && value <= 65535) {
    return value;
  }
  return 21420;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 1_000_000) {
      throw new Error("Request body too large");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

type SubmittedSetupConfig = {
  token?: string;
  provider?: string;
  model?: string;
  voice?: string;
  speed?: string;
  openaiApiKey?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
};

function parseBodyByContentType(contentType: string | undefined, rawBody: string): SubmittedSetupConfig {
  if (contentType?.includes("application/json")) {
    return JSON.parse(rawBody) as SubmittedSetupConfig;
  }

  const params = new URLSearchParams(rawBody);
  const payload: SubmittedSetupConfig = {};
  for (const [key, value] of params.entries()) {
    payload[key as keyof SubmittedSetupConfig] = value;
  }
  return payload;
}

function getSubmittedToken(
  req: IncomingMessage,
  url: URL,
  parsedBody: SubmittedSetupConfig
): string | undefined {
  const headerToken = getString(req.headers["x-setup-token"] as string | undefined);
  const bodyToken = getString(parsedBody.token);
  const queryToken = getString(url.searchParams.get("token") ?? undefined);
  return headerToken ?? bodyToken ?? queryToken;
}

function mergeRuntimeConfig(current: RuntimeConfig, incoming: SubmittedSetupConfig): RuntimeConfig {
  const providerRaw = getString(incoming.provider);
  const provider: TtsProvider = providerRaw === "openai" ? "openai" : current.tts.provider;

  const model = getString(incoming.model) ?? current.tts.params.model;
  const voice = getString(incoming.voice) ?? current.tts.params.voice;
  const speed = getNumber(incoming.speed) ?? current.tts.params.speed;

  // Empty secret fields keep existing values.
  const openaiApiKey = getString(incoming.openaiApiKey) ?? current.keys.openai?.apiKey;
  const telegramBotToken = getString(incoming.telegramBotToken) ?? current.keys.telegram?.botToken;
  const telegramChatId = getString(incoming.telegramChatId) ?? current.telegram.chatId;

  return {
    tts: {
      provider,
      params: {
        model,
        voice,
        speed
      }
    },
    telegram: {
      chatId: telegramChatId
    },
    keys: {
      openai: {
        apiKey: openaiApiKey
      },
      telegram: {
        botToken: telegramBotToken
      }
    }
  };
}

function buildSetupPage(configPath: string, token: string, runtime: RuntimeConfig): string {
  const missing = getMissingConfigFields(runtime);
  const missingText = missing.length > 0 ? missing.join(", ") : "none";

  const provider = escapeHtml(runtime.tts.provider ?? "openai");
  const model = escapeHtml(runtime.tts.params.model ?? "gpt-4o-mini-tts");
  const voice = escapeHtml(runtime.tts.params.voice ?? "alloy");
  const speed = escapeHtml(String(runtime.tts.params.speed ?? 1.0));
  const chatId = escapeHtml(runtime.telegram.chatId ?? "");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>simple-notify-mcp setup</title>
    <style>
      :root {
        --bg: #f5f6f8;
        --card: #ffffff;
        --ink: #111827;
        --muted: #6b7280;
        --line: #d1d5db;
        --accent: #0f766e;
        --accent-ink: #ffffff;
        --danger: #991b1b;
        --ok: #14532d;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background:
          radial-gradient(circle at 20% -10%, #d1fae5 0, transparent 30%),
          radial-gradient(circle at 100% 0%, #e0f2fe 0, transparent 35%),
          var(--bg);
        color: var(--ink);
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .wrap {
        max-width: 980px;
        margin: 28px auto;
        padding: 0 16px;
      }
      .hero {
        background: linear-gradient(135deg, #0f766e, #065f46);
        color: var(--accent-ink);
        border-radius: 14px;
        padding: 18px 20px;
        box-shadow: 0 16px 28px rgba(0, 0, 0, 0.08);
      }
      .hero h1 { margin: 0; font-size: 24px; }
      .hero p { margin: 8px 0 0; opacity: 0.9; }
      .card {
        background: var(--card);
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 16px;
        margin-top: 16px;
      }
      .meta {
        display: grid;
        grid-template-columns: 1fr;
        gap: 8px;
        font-size: 13px;
        color: var(--muted);
      }
      code {
        background: #f3f4f6;
        padding: 2px 6px;
        border-radius: 6px;
        color: #111827;
      }
      .tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 14px;
      }
      .tab {
        border: 1px solid var(--line);
        border-radius: 999px;
        background: #fff;
        color: var(--ink);
        padding: 8px 14px;
        cursor: pointer;
        font-size: 14px;
      }
      .tab.active {
        background: var(--accent);
        color: #fff;
        border-color: var(--accent);
      }
      .panel {
        display: none;
        margin-top: 14px;
      }
      .panel.active { display: block; }
      .grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .grid.two {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        align-items: start;
      }
      label {
        display: grid;
        gap: 6px;
        font-size: 13px;
        color: var(--muted);
      }
      input, select {
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 14px;
        color: var(--ink);
        background: #fff;
      }
      .stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .section {
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 12px;
        background: #fafafa;
      }
      .section h3 {
        margin: 0 0 10px;
        font-size: 14px;
        color: #1f2937;
      }
      .actions {
        margin-top: 16px;
        display: flex;
        gap: 10px;
        align-items: center;
      }
      button.save {
        border: none;
        border-radius: 10px;
        background: var(--accent);
        color: #fff;
        padding: 10px 16px;
        font-size: 14px;
        cursor: pointer;
      }
      #result { font-size: 13px; color: var(--muted); }
      #result.ok { color: var(--ok); }
      #result.err { color: var(--danger); }
      @media (max-width: 720px) {
        .grid.two { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hero">
        <h1>simple-notify-mcp control panel</h1>
        <p>Configure TTS, Telegram, and secrets for this local MCP server.</p>
      </div>

      <div class="card">
        <div class="meta">
          <div>Config path: <code>${escapeHtml(configPath)}</code></div>
          <div>Missing config: <code id="missing">${escapeHtml(missingText)}</code></div>
        </div>

        <form id="setup-form">
          <input type="hidden" id="token" name="token" value="${escapeHtml(token)}" />

          <div class="tabs">
            <button class="tab active" type="button" data-tab="tts">TTS</button>
            <button class="tab" type="button" data-tab="telegram">Telegram</button>
            <button class="tab" type="button" data-tab="keys">Keys</button>
          </div>

          <div class="panel active" data-panel="tts">
            <div class="grid two">
              <div class="section stack">
                <h3>Provider</h3>
                <label>
                  Provider
                  <select name="provider" id="provider">
                    <option value="openai" ${provider === "openai" ? "selected" : ""}>openai</option>
                  </select>
                </label>
              </div>

              <div class="section stack">
                <h3>Provider params</h3>
                <label>
                  Model
                  <input name="model" value="${model}" />
                </label>
                <label>
                  Voice
                  <input name="voice" value="${voice}" />
                </label>
                <label>
                  Speed
                  <input name="speed" value="${speed}" />
                </label>
              </div>
            </div>
          </div>

          <div class="panel" data-panel="telegram">
            <div class="grid">
              <div class="section stack">
                <h3>Destination</h3>
                <label>
                  Chat ID
                  <input name="telegramChatId" value="${chatId}" placeholder="123456789" />
                </label>
              </div>
            </div>
          </div>

          <div class="panel" data-panel="keys">
            <div class="grid two">
              <div class="section stack">
                <h3>OpenAI</h3>
                <label>
                  API key
                  <input name="openaiApiKey" type="password" placeholder="sk-..." autocomplete="off" />
                </label>
              </div>

              <div class="section stack">
                <h3>Telegram</h3>
                <label>
                  Bot token
                  <input name="telegramBotToken" type="password" placeholder="123:ABC" autocomplete="off" />
                </label>
              </div>
            </div>
          </div>

          <div class="actions">
            <button class="save" type="submit">Save configuration</button>
            <span id="result">Empty secret fields keep existing values.</span>
          </div>
        </form>
      </div>
    </div>

    <script>
      const tabs = Array.from(document.querySelectorAll(".tab"));
      const panels = Array.from(document.querySelectorAll(".panel"));
      const form = document.getElementById("setup-form");
      const result = document.getElementById("result");
      const missingNode = document.getElementById("missing");
      const tokenInput = document.getElementById("token");

      const queryToken = new URLSearchParams(window.location.search).get("token");
      if (queryToken) {
        tokenInput.value = queryToken;
      }

      for (const tab of tabs) {
        tab.addEventListener("click", () => {
          const name = tab.getAttribute("data-tab");
          for (const t of tabs) {
            t.classList.toggle("active", t === tab);
          }
          for (const panel of panels) {
            panel.classList.toggle("active", panel.getAttribute("data-panel") === name);
          }
        });
      }

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const body = Object.fromEntries(formData.entries());

        try {
          const response = await fetch("/api/config", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Setup-Token": String(body.token || "")
            },
            body: JSON.stringify(body)
          });

          const payload = await response.json();
          if (!response.ok || !payload.ok) {
            throw new Error(payload.error || "Save failed");
          }

          const missing = payload.missingConfig || [];
          missingNode.textContent = missing.length ? missing.join(", ") : "none";
          result.textContent = "Saved";
          result.className = "ok";
        } catch (error) {
          result.textContent = String(error);
          result.className = "err";
        }
      });
    </script>
  </body>
</html>`;
}

export async function startSetupWebServer(
  options: SetupWebOptions,
  handlers: SetupWebHandlers
): Promise<SetupWebController> {
  const host = normalizeHost(options.host);
  const requestedPort = parsePort(options.port);
  const token = getString(options.token) ?? randomBytes(16).toString("hex");
  let port = requestedPort;
  let baseUrl = `http://${host}:${port}/`;
  let setupUrl = `${baseUrl}?token=${encodeURIComponent(token)}`;

  let server: Server | null = null;

  const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (!req.url || !req.method) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Invalid request" }));
        return;
      }

      const url = new URL(req.url, baseUrl);
      const runtime = handlers.getRuntime();

      if (req.method === "GET" && url.pathname === "/") {
        const html = buildSetupPage(options.configPath, token, runtime);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/status") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          setupUrl,
          configPath: options.configPath,
          missingConfig: getMissingConfigFields(runtime)
        }));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/config") {
        const rawBody = await readRequestBody(req);
        const body = parseBodyByContentType(req.headers["content-type"], rawBody);

        const submittedToken = getSubmittedToken(req, url, body);
        if (submittedToken !== token) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Invalid setup token" }));
          return;
        }

        const nextRuntime = mergeRuntimeConfig(runtime, body);
        await saveRuntimeConfig(options.configPath, nextRuntime);
        await handlers.onRuntimeSaved(nextRuntime);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok: true,
          missingConfig: getMissingConfigFields(nextRuntime)
        }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Not found" }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  };

  server = createServer((req, res) => {
    void handleRequest(req, res);
  });

  port = await listenOnFirstAvailablePort(server, host, requestedPort);
  baseUrl = `http://${host}:${port}/`;
  setupUrl = `${baseUrl}?token=${encodeURIComponent(token)}`;

  const state: SetupWebState = {
    running: true,
    host,
    port,
    token,
    baseUrl,
    url: setupUrl
  };

  return {
    state,
    close: async () => {
      if (!server) {
        return;
      }
      await new Promise<void>((resolve, reject) => {
        server?.close(err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
  };
}
