import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export type TtsProvider = "openai";

export type TtsParams = {
  model?: string;
  voice?: string;
  speed?: number;
};

export type TtsConfig = {
  provider: TtsProvider;
  params: TtsParams;
};

export type TelegramConfig = {
  chatId?: string;
};

export type KeysConfig = {
  openai?: {
    apiKey?: string;
  };
  telegram?: {
    botToken?: string;
  };
};

export type FileConfig = {
  tts?: {
    provider?: TtsProvider;
    params?: TtsParams;
  };
  telegram?: TelegramConfig;
  keys?: KeysConfig;
};

export type CliArgs = Record<string, string | boolean>;

export type RuntimeConfig = {
  tts: TtsConfig;
  telegram: TelegramConfig;
  keys: KeysConfig;
};

export type RuntimeState = {
  args: CliArgs;
  runtime: RuntimeConfig;
  configPath: string;
  configArgProvided: boolean;
};

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) {
      continue;
    }

    const arg = raw.slice(2);
    if (arg.startsWith("no-")) {
      out[arg.slice(3)] = false;
      continue;
    }

    const eqIndex = arg.indexOf("=");
    if (eqIndex >= 0) {
      const key = arg.slice(0, eqIndex);
      const value = arg.slice(eqIndex + 1);
      out[key] = value;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[arg] = next;
      i++;
    } else {
      out[arg] = true;
    }
  }

  return out;
}

export function getString(value: string | boolean | undefined): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed !== "") {
      return trimmed;
    }
  }
  return undefined;
}

export function getNumber(value: string | boolean | undefined): number | undefined {
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function isEnabledFlag(value: string | boolean | undefined): boolean {
  if (value === true) {
    return true;
  }
  if (value === false || value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function defaultConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.trim() !== "") {
    return path.join(xdg, "simple-notify-mcp", "config.json");
  }
  return path.join(os.homedir(), ".config", "simple-notify-mcp", "config.json");
}

export async function loadConfig(configPath: string, explicit: boolean): Promise<FileConfig> {
  if (!existsSync(configPath)) {
    if (explicit) {
      console.error(`[simple-notify-mcp] config not found: ${configPath}`);
    }
    return {};
  }

  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as FileConfig;
    return parsed ?? {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[simple-notify-mcp] failed to parse config ${configPath}: ${message}`);
  }
}

function normalizeProvider(value: string | undefined): TtsProvider {
  if (value === "openai") {
    return "openai";
  }
  return "openai";
}

export function buildRuntimeConfig(args: CliArgs, fileConfig: FileConfig): RuntimeConfig {
  const providerRaw = getString(args["tts-provider"]) ?? fileConfig.tts?.provider;
  const provider = normalizeProvider(providerRaw);

  const tts: TtsConfig = {
    provider,
    params: {
      model: getString(args["model"]) ?? fileConfig.tts?.params?.model ?? "gpt-4o-mini-tts",
      voice: getString(args["voice"]) ?? fileConfig.tts?.params?.voice ?? "alloy",
      speed: getNumber(args["speed"]) ?? fileConfig.tts?.params?.speed ?? 1.0
    }
  };

  const telegram: TelegramConfig = {
    chatId: getString(args["telegram-chat-id"]) ?? fileConfig.telegram?.chatId
  };

  const keys: KeysConfig = {
    openai: {
      apiKey: getString(args["openai-api-key"]) ?? fileConfig.keys?.openai?.apiKey
    },
    telegram: {
      botToken: getString(args["telegram-bot-token"]) ?? fileConfig.keys?.telegram?.botToken
    }
  };

  return { tts, telegram, keys };
}

export async function loadRuntime(argv: string[]): Promise<RuntimeState> {
  const args = parseArgs(argv);
  const configArgProvided = argv.some(arg => arg === "--config" || arg.startsWith("--config="));
  const configPath = getString(args["config"]) ?? defaultConfigPath();
  const fileConfig = await loadConfig(configPath, configArgProvided);
  const runtime = buildRuntimeConfig(args, fileConfig);
  return { args, runtime, configPath, configArgProvided };
}

function hasNonEmptyText(value: string): boolean {
  return value.trim().length > 0;
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? "null"}`));
      }
    });
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export function hasSystemTtsSupport(): boolean {
  return process.platform === "darwin";
}

export function getOpenAIKey(runtime: RuntimeConfig): string | undefined {
  const envKey = getString(process.env.OPENAI_API_KEY);
  if (envKey) {
    return envKey;
  }
  return getString(runtime.keys.openai?.apiKey);
}

export function getTelegramBotToken(runtime: RuntimeConfig): string | undefined {
  return getString(runtime.keys.telegram?.botToken);
}

export function isTtsAvailable(runtime: RuntimeConfig): boolean {
  return Boolean(getOpenAIKey(runtime)) || hasSystemTtsSupport();
}

export function isTelegramConfigured(runtime: RuntimeConfig): boolean {
  return Boolean(getTelegramBotToken(runtime) && getString(runtime.telegram.chatId));
}

export function getMissingConfigFields(runtime: RuntimeConfig): string[] {
  const missing: string[] = [];

  if (!getOpenAIKey(runtime)) {
    missing.push("keys.openai.apiKey");
  }
  if (!getTelegramBotToken(runtime)) {
    missing.push("keys.telegram.botToken");
  }
  if (!getString(runtime.telegram.chatId)) {
    missing.push("telegram.chatId");
  }

  return missing;
}

async function playAudioFile(filePath: string): Promise<void> {
  await runCommand("afplay", [filePath]);
}

async function speakSystem(text: string, config: TtsConfig): Promise<void> {
  const trimmed = text.trim();
  if (!hasNonEmptyText(trimmed)) {
    return;
  }

  const args: string[] = [];
  const voice = getString(config.params.voice);
  if (voice) {
    args.push("-v", voice);
  }
  args.push(trimmed);

  await runCommand("say", args);
}

async function speakOpenAI(text: string, config: TtsConfig, apiKey: string): Promise<void> {
  const trimmed = text.trim();
  if (!hasNonEmptyText(trimmed)) {
    return;
  }

  const model = config.params.model ?? "gpt-4o-mini-tts";
  const voice = config.params.voice ?? "alloy";
  const speed = config.params.speed ?? 1.0;
  const format = "mp3";

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/audio/speech",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        voice,
        input: trimmed,
        response_format: format,
        speed
      })
    },
    20_000
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI TTS error (${response.status}): ${errorText}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "simple-notify-mcp-"));
  const filePath = path.join(tmpDir, `speech.${format}`);

  try {
    await writeFile(filePath, data);
    await playAudioFile(filePath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export async function speakText(text: string, runtime: RuntimeConfig): Promise<void> {
  const openAIKey = getOpenAIKey(runtime);
  const hasSystem = hasSystemTtsSupport();

  if (openAIKey) {
    try {
      await speakOpenAI(text, runtime.tts, openAIKey);
      return;
    } catch (err) {
      if (!hasSystem) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[simple-notify-mcp] OpenAI TTS failed, falling back to system TTS: ${message}`);
    }
  }

  if (hasSystem) {
    await speakSystem(text, runtime.tts);
    return;
  }

  throw new Error("No TTS backend available (OPENAI_API_KEY/keys.openai.apiKey missing and system TTS unsupported)");
}

export async function sendTelegram(text: string, runtime: RuntimeConfig): Promise<void> {
  const botToken = getTelegramBotToken(runtime);
  const chatId = getString(runtime.telegram.chatId);
  if (!botToken || !chatId) {
    throw new Error("Telegram config missing");
  }

  const response = await fetchWithTimeout(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    },
    15_000
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram error (${response.status}): ${errorText}`);
  }
}

function withDefinedProps<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") {
      out[key as keyof T] = value as T[keyof T];
    }
  }
  return out;
}

export async function saveRuntimeConfig(configPath: string, runtime: RuntimeConfig): Promise<void> {
  const ttsParams = withDefinedProps({
    model: runtime.tts.params.model,
    voice: runtime.tts.params.voice,
    speed: runtime.tts.params.speed
  });

  const keysOpenAI = withDefinedProps({
    apiKey: runtime.keys.openai?.apiKey
  });

  const keysTelegram = withDefinedProps({
    botToken: runtime.keys.telegram?.botToken
  });

  const telegram = withDefinedProps({
    chatId: runtime.telegram.chatId
  });

  const payload: FileConfig = {
    tts: {
      provider: runtime.tts.provider,
      params: ttsParams as TtsParams
    },
    ...(Object.keys(telegram).length > 0 ? { telegram: telegram as TelegramConfig } : {}),
    keys: {
      ...(Object.keys(keysOpenAI).length > 0 ? { openai: keysOpenAI as { apiKey?: string } } : {}),
      ...(Object.keys(keysTelegram).length > 0 ? { telegram: keysTelegram as { botToken?: string } } : {})
    }
  };

  const configDir = path.dirname(configPath);
  const tmpPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;

  await mkdir(configDir, { recursive: true });
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600, encoding: "utf8" });
  try {
    await chmod(tmpPath, 0o600);
  } catch {
    // Best effort; chmod may not be supported on all platforms.
  }

  try {
    await rename(tmpPath, configPath);
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }
}
