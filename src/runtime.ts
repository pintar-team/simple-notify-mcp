import { existsSync } from "node:fs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export type TtsConfig = {
  model?: string;
  voice?: string;
  speed?: number;
};

export type TelegramConfig = {
  botToken?: string;
  chatId?: string;
};

export type FileConfig = {
  tts?: TtsConfig;
  telegram?: TelegramConfig;
};

export type CliArgs = Record<string, string | boolean>;

export type RuntimeConfig = {
  tts: TtsConfig;
  telegram: TelegramConfig;
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
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
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

export function buildRuntimeConfig(args: CliArgs, fileConfig: FileConfig): RuntimeConfig {
  const tts: TtsConfig = {
    model: getString(args["model"]) ?? fileConfig.tts?.model ?? "gpt-4o-mini-tts",
    voice: getString(args["voice"]) ?? fileConfig.tts?.voice ?? "alloy",
    speed: getNumber(args["speed"]) ?? fileConfig.tts?.speed ?? 1.0
  };

  const telegram: TelegramConfig = {
    botToken: getString(args["telegram-bot-token"]) ?? fileConfig.telegram?.botToken,
    chatId: getString(args["telegram-chat-id"]) ?? fileConfig.telegram?.chatId
  };

  return { tts, telegram };
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

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
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

async function playAudioFile(filePath: string): Promise<void> {
  await runCommand("afplay", [filePath]);
}

async function speakSystem(text: string, config: TtsConfig): Promise<void> {
  const trimmed = text.trim();
  if (!hasNonEmptyText(trimmed)) {
    return;
  }

  const args: string[] = [];
  if (config.voice) {
    args.push("-v", config.voice);
  }
  args.push(trimmed);

  await runCommand("say", args);
}

async function speakOpenAI(text: string, config: TtsConfig): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const trimmed = text.trim();
  if (!hasNonEmptyText(trimmed)) {
    return;
  }

  const model = config.model ?? "gpt-4o-mini-tts";
  const voice = config.voice ?? "alloy";
  const speed = config.speed ?? 1.0;
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

export async function speakText(text: string, config: TtsConfig): Promise<void> {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasSystem = hasSystemTtsSupport();

  if (hasOpenAI) {
    try {
      await speakOpenAI(text, config);
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
    await speakSystem(text, config);
    return;
  }

  throw new Error("No TTS backend available (OPENAI_API_KEY missing and system TTS unsupported)");
}

export async function sendTelegram(text: string, config: TelegramConfig): Promise<void> {
  if (!config.botToken || !config.chatId) {
    throw new Error("Telegram config missing");
  }

  const response = await fetchWithTimeout(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: config.chatId,
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
