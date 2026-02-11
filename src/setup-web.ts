import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  FAL_ELEVEN_APPLY_TEXT_NORMALIZATION_OPTIONS,
  FAL_MINIMAX_LANGUAGE_BOOST_OPTIONS,
  OPENAI_RESPONSE_FORMATS,
  OPENAI_TTS_MODELS,
  OPENAI_TTS_VOICES,
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

type SubmittedSetupConfig = {
  token?: string;
  provider?: string;
  openaiModel?: string;
  openaiVoice?: string;
  openaiSpeed?: string;
  openaiResponseFormat?: string;
  openaiInstructions?: string;
  falMinimaxVoiceId?: string;
  falMinimaxSpeed?: string;
  falMinimaxVol?: string;
  falMinimaxPitch?: string;
  falMinimaxEnglishNormalization?: string;
  falMinimaxLanguageBoost?: string;
  falMinimaxOutputFormat?: string;
  falElevenVoice?: string;
  falElevenStability?: string;
  falElevenSimilarityBoost?: string;
  falElevenStyle?: string;
  falElevenSpeed?: string;
  falElevenLanguageCode?: string;
  falElevenApplyTextNormalization?: string;
  openaiApiKey?: string;
  falApiKey?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  ttsAsyncByDefault?: string;
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

function parseBooleanString(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function normalizeProvider(value: string | undefined): TtsProvider | undefined {
  if (value === "openai" || value === "fal-minimax" || value === "fal-elevenlabs") {
    return value;
  }
  return undefined;
}

function normalizeOpenAiFormat(value: string | undefined): RuntimeConfig["tts"]["params"]["openai"]["responseFormat"] {
  if (!value) {
    return undefined;
  }
  return OPENAI_RESPONSE_FORMATS.includes(value as typeof OPENAI_RESPONSE_FORMATS[number])
    ? value as RuntimeConfig["tts"]["params"]["openai"]["responseFormat"]
    : undefined;
}

function normalizeFalMinimaxOutputFormat(value: string | undefined): "url" | "hex" | undefined {
  if (value === "url" || value === "hex") {
    return value;
  }
  return undefined;
}

function normalizeFalElevenApplyTextNormalization(value: string | undefined): "auto" | "on" | "off" | undefined {
  if (!value) {
    return undefined;
  }
  return FAL_ELEVEN_APPLY_TEXT_NORMALIZATION_OPTIONS.includes(
    value as typeof FAL_ELEVEN_APPLY_TEXT_NORMALIZATION_OPTIONS[number]
  )
    ? value as "auto" | "on" | "off"
    : undefined;
}

function boolToString(value: boolean | undefined): string {
  return value ? "true" : "false";
}

function buildOptions(options: readonly string[], selected: string | undefined): string {
  return options.map(option => {
    const isSelected = option === selected ? " selected" : "";
    return `<option value="${escapeHtml(option)}"${isSelected}>${escapeHtml(option)}</option>`;
  }).join("");
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
  const provider = normalizeProvider(getString(incoming.provider)) ?? current.tts.provider;

  const openaiModel = getString(incoming.openaiModel) ?? current.tts.params.openai.model;
  const openaiVoice = getString(incoming.openaiVoice) ?? current.tts.params.openai.voice;
  const openaiSpeed = getNumber(incoming.openaiSpeed) ?? current.tts.params.openai.speed;
  const openaiResponseFormat = normalizeOpenAiFormat(getString(incoming.openaiResponseFormat)) ??
    current.tts.params.openai.responseFormat;
  const openaiInstructions = getString(incoming.openaiInstructions) ?? current.tts.params.openai.instructions;

  const falMinimaxVoiceId = getString(incoming.falMinimaxVoiceId) ?? current.tts.params.falMinimax.voiceId;
  const falMinimaxSpeed = getNumber(incoming.falMinimaxSpeed) ?? current.tts.params.falMinimax.speed;
  const falMinimaxVol = getNumber(incoming.falMinimaxVol) ?? current.tts.params.falMinimax.vol;
  const falMinimaxPitch = getNumber(incoming.falMinimaxPitch) ?? current.tts.params.falMinimax.pitch;
  const falMinimaxEnglishNormalization = parseBooleanString(getString(incoming.falMinimaxEnglishNormalization)) ??
    current.tts.params.falMinimax.englishNormalization;
  const falMinimaxLanguageBoost = getString(incoming.falMinimaxLanguageBoost) ??
    current.tts.params.falMinimax.languageBoost;
  const falMinimaxOutputFormat = normalizeFalMinimaxOutputFormat(getString(incoming.falMinimaxOutputFormat)) ??
    current.tts.params.falMinimax.outputFormat;

  const falElevenVoice = getString(incoming.falElevenVoice) ?? current.tts.params.falElevenlabs.voice;
  const falElevenStability = getNumber(incoming.falElevenStability) ?? current.tts.params.falElevenlabs.stability;
  const falElevenSimilarityBoost = getNumber(incoming.falElevenSimilarityBoost) ??
    current.tts.params.falElevenlabs.similarityBoost;
  const falElevenStyle = getNumber(incoming.falElevenStyle) ?? current.tts.params.falElevenlabs.style;
  const falElevenSpeed = getNumber(incoming.falElevenSpeed) ?? current.tts.params.falElevenlabs.speed;
  const falElevenLanguageCode = getString(incoming.falElevenLanguageCode) ??
    current.tts.params.falElevenlabs.languageCode;
  const falElevenApplyTextNormalization = normalizeFalElevenApplyTextNormalization(
    getString(incoming.falElevenApplyTextNormalization)
  ) ?? current.tts.params.falElevenlabs.applyTextNormalization;

  // Empty secret fields keep existing values.
  const openaiApiKey = getString(incoming.openaiApiKey) ?? current.keys.openai?.apiKey;
  const falApiKey = getString(incoming.falApiKey) ?? current.keys.fal?.apiKey;
  const telegramBotToken = getString(incoming.telegramBotToken) ?? current.keys.telegram?.botToken;
  const telegramChatId = getString(incoming.telegramChatId) ?? current.telegram.chatId;
  const ttsAsyncByDefault = parseBooleanString(getString(incoming.ttsAsyncByDefault)) ??
    current.misc.ttsAsyncByDefault;

  return {
    tts: {
      provider,
      params: {
        openai: {
          model: openaiModel,
          voice: openaiVoice,
          speed: openaiSpeed,
          responseFormat: openaiResponseFormat,
          instructions: openaiInstructions
        },
        falMinimax: {
          voiceId: falMinimaxVoiceId,
          speed: falMinimaxSpeed,
          vol: falMinimaxVol,
          pitch: falMinimaxPitch,
          englishNormalization: falMinimaxEnglishNormalization,
          languageBoost: falMinimaxLanguageBoost,
          outputFormat: falMinimaxOutputFormat
        },
        falElevenlabs: {
          voice: falElevenVoice,
          stability: falElevenStability,
          similarityBoost: falElevenSimilarityBoost,
          style: falElevenStyle,
          speed: falElevenSpeed,
          languageCode: falElevenLanguageCode,
          applyTextNormalization: falElevenApplyTextNormalization
        }
      }
    },
    telegram: {
      chatId: telegramChatId
    },
    keys: {
      openai: {
        apiKey: openaiApiKey
      },
      fal: {
        apiKey: falApiKey
      },
      telegram: {
        botToken: telegramBotToken
      }
    },
    misc: {
      ttsAsyncByDefault
    }
  };
}

function buildSetupPage(configPath: string, token: string, runtime: RuntimeConfig): string {
  const missing = getMissingConfigFields(runtime);
  const missingText = missing.length > 0 ? missing.join(", ") : "none";

  const provider = escapeHtml(runtime.tts.provider);
  const openaiModel = escapeHtml(runtime.tts.params.openai.model ?? OPENAI_TTS_MODELS[0]);
  const openaiVoice = escapeHtml(runtime.tts.params.openai.voice ?? OPENAI_TTS_VOICES[0]);
  const openaiSpeed = escapeHtml(String(runtime.tts.params.openai.speed ?? 1.0));
  const openaiResponseFormat = escapeHtml(runtime.tts.params.openai.responseFormat ?? "mp3");
  const openaiInstructions = escapeHtml(runtime.tts.params.openai.instructions ?? "");

  const falMinimaxVoiceId = escapeHtml(runtime.tts.params.falMinimax.voiceId ?? "Wise_Woman");
  const falMinimaxSpeed = escapeHtml(String(runtime.tts.params.falMinimax.speed ?? 1.0));
  const falMinimaxVol = escapeHtml(String(runtime.tts.params.falMinimax.vol ?? 1.0));
  const falMinimaxPitch = escapeHtml(String(runtime.tts.params.falMinimax.pitch ?? 0));
  const falMinimaxEnglishNormalization = escapeHtml(boolToString(runtime.tts.params.falMinimax.englishNormalization));
  const falMinimaxLanguageBoost = escapeHtml(runtime.tts.params.falMinimax.languageBoost ?? "auto");
  const falMinimaxOutputFormat = escapeHtml(runtime.tts.params.falMinimax.outputFormat ?? "url");

  const falElevenVoice = escapeHtml(runtime.tts.params.falElevenlabs.voice ?? "Rachel");
  const falElevenStability = escapeHtml(String(runtime.tts.params.falElevenlabs.stability ?? 0.5));
  const falElevenSimilarityBoost = escapeHtml(String(runtime.tts.params.falElevenlabs.similarityBoost ?? 0.75));
  const falElevenStyle = escapeHtml(String(runtime.tts.params.falElevenlabs.style ?? 0));
  const falElevenSpeed = escapeHtml(String(runtime.tts.params.falElevenlabs.speed ?? 1));
  const falElevenLanguageCode = escapeHtml(runtime.tts.params.falElevenlabs.languageCode ?? "");
  const falElevenApplyTextNormalization = escapeHtml(runtime.tts.params.falElevenlabs.applyTextNormalization ?? "auto");
  const ttsAsyncByDefault = escapeHtml(boolToString(runtime.misc.ttsAsyncByDefault));

  const chatId = escapeHtml(runtime.telegram.chatId ?? "");

  const openaiModelOptions = buildOptions(OPENAI_TTS_MODELS, openaiModel);
  const openaiVoiceOptions = buildOptions(OPENAI_TTS_VOICES, openaiVoice);
  const openaiFormatOptions = buildOptions(OPENAI_RESPONSE_FORMATS, openaiResponseFormat);
  const minimaxLanguageBoostOptions = buildOptions(FAL_MINIMAX_LANGUAGE_BOOST_OPTIONS, falMinimaxLanguageBoost);
  const minimaxOutputFormatOptions = buildOptions(["url", "hex"], falMinimaxOutputFormat);
  const falElevenNormalizationOptions = buildOptions(
    FAL_ELEVEN_APPLY_TEXT_NORMALIZATION_OPTIONS,
    falElevenApplyTextNormalization
  );
  const minimaxEnglishNormalizationOptions = buildOptions(["false", "true"], falMinimaxEnglishNormalization);
  const ttsAsyncByDefaultOptions = buildOptions(["true", "false"], ttsAsyncByDefault);

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
        max-width: 1040px;
        margin: 28px auto;
        padding: 0 16px 24px;
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
      .grid.three {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        align-items: start;
      }
      label {
        display: grid;
        gap: 6px;
        font-size: 13px;
        color: var(--muted);
      }
      input, select, textarea {
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 14px;
        color: var(--ink);
        background: #fff;
      }
      textarea {
        min-height: 84px;
        resize: vertical;
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
      .section p {
        margin: 0 0 10px;
        color: #6b7280;
        font-size: 12px;
      }
      .provider-card {
        display: none;
      }
      .provider-card.active {
        display: block;
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
      @media (max-width: 960px) {
        .grid.two, .grid.three { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hero">
        <h1>simple-notify-mcp control panel</h1>
        <p>Configure TTS provider settings, Telegram destination, and API keys for this local MCP server.</p>
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
            <button class="tab" type="button" data-tab="misc">Misc</button>
          </div>

          <div class="panel active" data-panel="tts">
            <div class="grid">
              <div class="section stack">
                <h3>Provider</h3>
                <p>Pick one provider. The matching params block appears below.</p>
                <label>
                  Provider
                  <select name="provider" id="provider">
                    <option value="openai" ${provider === "openai" ? "selected" : ""}>openai</option>
                    <option value="fal-minimax" ${provider === "fal-minimax" ? "selected" : ""}>fal-minimax</option>
                    <option value="fal-elevenlabs" ${provider === "fal-elevenlabs" ? "selected" : ""}>fal-elevenlabs</option>
                  </select>
                </label>
              </div>

              <div class="provider-card section stack" data-provider="openai">
                <h3>OpenAI params</h3>
                <div class="grid two">
                  <label>
                    Model
                    <select name="openaiModel">
                      ${openaiModelOptions}
                    </select>
                  </label>
                  <label>
                    Voice
                    <select name="openaiVoice">
                      ${openaiVoiceOptions}
                    </select>
                  </label>
                </div>
                <div class="grid two">
                  <label>
                    Speed (0.25 - 4.0)
                    <input name="openaiSpeed" value="${openaiSpeed}" type="number" min="0.25" max="4" step="0.05" />
                  </label>
                  <label>
                    Response format
                    <select name="openaiResponseFormat">
                      ${openaiFormatOptions}
                    </select>
                  </label>
                </div>
                <label>
                  Instructions (optional)
                  <textarea name="openaiInstructions" placeholder="Speak in a calm, concise style">${openaiInstructions}</textarea>
                </label>
              </div>

              <div class="provider-card section stack" data-provider="fal-minimax">
                <h3>FAL MiniMax Speech 2.8 Turbo params</h3>
                <div class="grid two">
                  <label>
                    Voice ID
                    <input name="falMinimaxVoiceId" value="${falMinimaxVoiceId}" />
                  </label>
                  <label>
                    Language boost
                    <select name="falMinimaxLanguageBoost">
                      ${minimaxLanguageBoostOptions}
                    </select>
                  </label>
                </div>
                <div class="grid three">
                  <label>
                    Speed
                    <input name="falMinimaxSpeed" value="${falMinimaxSpeed}" type="number" step="0.05" />
                  </label>
                  <label>
                    Volume
                    <input name="falMinimaxVol" value="${falMinimaxVol}" type="number" step="0.05" />
                  </label>
                  <label>
                    Pitch
                    <input name="falMinimaxPitch" value="${falMinimaxPitch}" type="number" step="0.05" />
                  </label>
                </div>
                <div class="grid two">
                  <label>
                    English normalization
                    <select name="falMinimaxEnglishNormalization">
                      ${minimaxEnglishNormalizationOptions}
                    </select>
                  </label>
                  <label>
                    Output format
                    <select name="falMinimaxOutputFormat">
                      ${minimaxOutputFormatOptions}
                    </select>
                  </label>
                </div>
              </div>

              <div class="provider-card section stack" data-provider="fal-elevenlabs">
                <h3>FAL ElevenLabs Eleven-v3 params</h3>
                <div class="grid two">
                  <label>
                    Voice
                    <input name="falElevenVoice" value="${falElevenVoice}" list="fal-eleven-voices" />
                  </label>
                  <label>
                    Language code (optional)
                    <input name="falElevenLanguageCode" value="${falElevenLanguageCode}" placeholder="en" />
                  </label>
                </div>
                <datalist id="fal-eleven-voices">
                  <option value="Rachel"></option>
                  <option value="Aria"></option>
                  <option value="Roger"></option>
                  <option value="Sarah"></option>
                  <option value="Laura"></option>
                  <option value="Charlie"></option>
                  <option value="George"></option>
                  <option value="Callum"></option>
                  <option value="River"></option>
                </datalist>
                <div class="grid two">
                  <label>
                    Speed (0.7 - 1.2)
                    <input name="falElevenSpeed" value="${falElevenSpeed}" type="number" min="0.7" max="1.2" step="0.05" />
                  </label>
                  <label>
                    Text normalization
                    <select name="falElevenApplyTextNormalization">
                      ${falElevenNormalizationOptions}
                    </select>
                  </label>
                </div>
                <div class="grid three">
                  <label>
                    Stability (0 - 1)
                    <input name="falElevenStability" value="${falElevenStability}" type="number" min="0" max="1" step="0.05" />
                  </label>
                  <label>
                    Similarity boost (0 - 1)
                    <input name="falElevenSimilarityBoost" value="${falElevenSimilarityBoost}" type="number" min="0" max="1" step="0.05" />
                  </label>
                  <label>
                    Style (0 - 1)
                    <input name="falElevenStyle" value="${falElevenStyle}" type="number" min="0" max="1" step="0.05" />
                  </label>
                </div>
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
            <div class="grid three">
              <div class="section stack">
                <h3>OpenAI</h3>
                <label>
                  API key
                  <input name="openaiApiKey" type="password" placeholder="sk-..." autocomplete="off" />
                </label>
              </div>

              <div class="section stack">
                <h3>FAL</h3>
                <label>
                  API key
                  <input name="falApiKey" type="password" placeholder="fal_..." autocomplete="off" />
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

          <div class="panel" data-panel="misc">
            <div class="grid">
              <div class="section stack">
                <h3>Runtime behavior</h3>
                <label>
                  <code>tts_say</code> async by default
                  <select name="ttsAsyncByDefault">
                    ${ttsAsyncByDefaultOptions}
                  </select>
                </label>
                <p>If true, <code>tts_say</code> returns immediately and runs speech generation in background.</p>
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
      const providerSelect = document.getElementById("provider");
      const providerCards = Array.from(document.querySelectorAll(".provider-card"));

      const queryToken = new URLSearchParams(window.location.search).get("token");
      if (queryToken) {
        tokenInput.value = queryToken;
      }

      function syncProviderCards() {
        const selected = providerSelect.value;
        for (const card of providerCards) {
          card.classList.toggle("active", card.getAttribute("data-provider") === selected);
        }
      }

      syncProviderCards();
      providerSelect.addEventListener("change", syncProviderCards);

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
