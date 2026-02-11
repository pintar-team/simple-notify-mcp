import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export const OPENAI_TTS_MODELS = [
  "gpt-4o-mini-tts",
  "gpt-4o-mini-tts-2025-12-15",
  "tts-1",
  "tts-1-hd"
] as const;

export const OPENAI_TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar"
] as const;

export const OPENAI_RESPONSE_FORMATS = [
  "mp3",
  "opus",
  "aac",
  "flac",
  "wav",
  "pcm"
] as const;

export const FAL_MINIMAX_LANGUAGE_BOOST_OPTIONS = [
  "auto",
  "Chinese",
  "Chinese,Yue",
  "English",
  "Arabic",
  "Russian",
  "Spanish",
  "French",
  "Portuguese",
  "German",
  "Turkish",
  "Dutch",
  "Ukrainian",
  "Vietnamese",
  "Indonesian",
  "Japanese",
  "Italian",
  "Korean",
  "Thai",
  "Polish",
  "Romanian",
  "Greek",
  "Czech",
  "Finnish",
  "Hindi",
  "Bulgarian",
  "Danish",
  "Hebrew",
  "Malay",
  "Slovak",
  "Swedish",
  "Croatian",
  "Hungarian",
  "Norwegian",
  "Slovenian",
  "Catalan",
  "Nynorsk",
  "Afrikaans"
] as const;

export const FAL_MINIMAX_VOICES = [
  "Wise_Woman",
  "Friendly_Person",
  "Inspirational_girl",
  "Deep_Voice_Man",
  "Calm_Woman",
  "Casual_Guy",
  "Lively_Girl",
  "Patient_Man",
  "Young_Knight",
  "Determined_Man",
  "Lovely_Girl",
  "Decent_Boy",
  "Imposing_Manner",
  "Elegant_Man",
  "Abbess",
  "Sweet_Girl_2",
  "Exuberant_Girl"
] as const;

export const FAL_MINIMAX_EMOTIONS = [
  "happy",
  "sad",
  "angry",
  "fearful",
  "disgusted",
  "surprised",
  "neutral"
] as const;

export const FAL_MINIMAX_AUDIO_FORMATS = ["mp3", "pcm", "flac"] as const;
export const FAL_MINIMAX_SAMPLE_RATES = [8000, 16000, 22050, 24000, 32000, 44100] as const;
export const FAL_MINIMAX_AUDIO_CHANNELS = [1, 2] as const;
export const FAL_MINIMAX_AUDIO_BITRATES = [32000, 64000, 128000, 256000] as const;

export const FAL_ELEVEN_APPLY_TEXT_NORMALIZATION_OPTIONS = [
  "auto",
  "on",
  "off"
] as const;

export const FAL_ELEVEN_VOICES = [
  "Rachel",
  "Aria",
  "Roger",
  "Sarah",
  "Laura",
  "Charlie",
  "George",
  "Callum",
  "River",
  "Liam",
  "Charlotte",
  "Alice",
  "Matilda",
  "Will",
  "Jessica",
  "Eric",
  "Chris",
  "Brian",
  "Daniel",
  "Lily",
  "Bill"
] as const;

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini-tts";
const DEFAULT_OPENAI_VOICE = "alloy";

export type TtsProvider = "openai" | "fal-minimax" | "fal-elevenlabs";

export type OpenAiResponseFormat = (typeof OPENAI_RESPONSE_FORMATS)[number];
export type OpenAiTtsParams = {
  model?: string;
  voice?: string;
  speed?: number;
  responseFormat?: OpenAiResponseFormat;
  instructions?: string;
};

export type FalMinimaxTtsParams = {
  voiceId?: string;
  speed?: number;
  vol?: number;
  pitch?: number;
  emotion?: (typeof FAL_MINIMAX_EMOTIONS)[number];
  englishNormalization?: boolean;
  languageBoost?: string;
  outputFormat?: "url" | "hex";
  audioFormat?: (typeof FAL_MINIMAX_AUDIO_FORMATS)[number];
  audioSampleRate?: (typeof FAL_MINIMAX_SAMPLE_RATES)[number];
  audioChannel?: (typeof FAL_MINIMAX_AUDIO_CHANNELS)[number];
  audioBitrate?: (typeof FAL_MINIMAX_AUDIO_BITRATES)[number];
  normalizationEnabled?: boolean;
  normalizationTargetLoudness?: number;
  normalizationTargetRange?: number;
  normalizationTargetPeak?: number;
  voiceModifyPitch?: number;
  voiceModifyIntensity?: number;
  voiceModifyTimbre?: number;
  pronunciationToneList?: string[];
};

export type FalElevenlabsTtsParams = {
  voice?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
  timestamps?: boolean;
  languageCode?: string;
  applyTextNormalization?: "auto" | "on" | "off";
};

export type TtsParams = {
  openai: OpenAiTtsParams;
  falMinimax: FalMinimaxTtsParams;
  falElevenlabs: FalElevenlabsTtsParams;
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
  fal?: {
    apiKey?: string;
  };
  telegram?: {
    botToken?: string;
  };
};

export type MiscConfig = {
  ttsAsyncByDefault?: boolean;
};

export type FileConfig = {
  tts?: {
    provider?: TtsProvider;
    params?: Partial<TtsParams>;
  };
  telegram?: TelegramConfig;
  keys?: KeysConfig;
  misc?: MiscConfig;
};

export type CliArgs = Record<string, string | boolean>;

export type RuntimeConfig = {
  tts: TtsConfig;
  telegram: TelegramConfig;
  keys: KeysConfig;
  misc: {
    ttsAsyncByDefault: boolean;
  };
};

export type RuntimeState = {
  args: CliArgs;
  runtime: RuntimeConfig;
  configPath: string;
  configArgProvided: boolean;
};

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

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

export function getBoolean(value: string | boolean | undefined): boolean | undefined {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
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
  if (value === "openai" || value === "fal-minimax" || value === "fal-elevenlabs") {
    return value;
  }
  return "openai";
}

function normalizeOpenAiResponseFormat(value: string | undefined): OpenAiResponseFormat | undefined {
  if (!value) {
    return undefined;
  }
  const allowed = new Set<string>(OPENAI_RESPONSE_FORMATS);
  return allowed.has(value) ? value as OpenAiResponseFormat : undefined;
}

function normalizeFalMinimaxOutputFormat(value: string | undefined): "url" | "hex" | undefined {
  if (value === "url" || value === "hex") {
    return value;
  }
  return undefined;
}

function normalizeFalMinimaxEmotion(
  value: string | undefined
): (typeof FAL_MINIMAX_EMOTIONS)[number] | undefined {
  if (!value) {
    return undefined;
  }
  return FAL_MINIMAX_EMOTIONS.includes(value as (typeof FAL_MINIMAX_EMOTIONS)[number])
    ? value as (typeof FAL_MINIMAX_EMOTIONS)[number]
    : undefined;
}

function normalizeFalMinimaxAudioFormat(
  value: string | undefined
): (typeof FAL_MINIMAX_AUDIO_FORMATS)[number] | undefined {
  if (!value) {
    return undefined;
  }
  return FAL_MINIMAX_AUDIO_FORMATS.includes(value as (typeof FAL_MINIMAX_AUDIO_FORMATS)[number])
    ? value as (typeof FAL_MINIMAX_AUDIO_FORMATS)[number]
    : undefined;
}

function normalizeFalMinimaxSampleRate(
  value: number | undefined
): (typeof FAL_MINIMAX_SAMPLE_RATES)[number] | undefined {
  if (!value) {
    return undefined;
  }
  return FAL_MINIMAX_SAMPLE_RATES.includes(value as (typeof FAL_MINIMAX_SAMPLE_RATES)[number])
    ? value as (typeof FAL_MINIMAX_SAMPLE_RATES)[number]
    : undefined;
}

function normalizeFalMinimaxAudioChannel(
  value: number | undefined
): (typeof FAL_MINIMAX_AUDIO_CHANNELS)[number] | undefined {
  if (!value) {
    return undefined;
  }
  return FAL_MINIMAX_AUDIO_CHANNELS.includes(value as (typeof FAL_MINIMAX_AUDIO_CHANNELS)[number])
    ? value as (typeof FAL_MINIMAX_AUDIO_CHANNELS)[number]
    : undefined;
}

function normalizeFalMinimaxAudioBitrate(
  value: number | undefined
): (typeof FAL_MINIMAX_AUDIO_BITRATES)[number] | undefined {
  if (!value) {
    return undefined;
  }
  return FAL_MINIMAX_AUDIO_BITRATES.includes(value as (typeof FAL_MINIMAX_AUDIO_BITRATES)[number])
    ? value as (typeof FAL_MINIMAX_AUDIO_BITRATES)[number]
    : undefined;
}

function parseToneList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const items = value
    .split(/[\n,]/g)
    .map(part => part.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function normalizeFalElevenApplyTextNormalization(
  value: string | undefined
): "auto" | "on" | "off" | undefined {
  if (!value) {
    return undefined;
  }
  return FAL_ELEVEN_APPLY_TEXT_NORMALIZATION_OPTIONS.includes(value as "auto" | "on" | "off")
    ? value as "auto" | "on" | "off"
    : undefined;
}

function buildOpenAiParams(args: CliArgs, fileConfig: FileConfig): OpenAiTtsParams {
  const fromFile = fileConfig.tts?.params?.openai;
  return {
    model: getString(args["openai-model"]) ?? fromFile?.model ?? DEFAULT_OPENAI_MODEL,
    voice: getString(args["openai-voice"]) ?? fromFile?.voice ?? DEFAULT_OPENAI_VOICE,
    speed: getNumber(args["openai-speed"]) ?? fromFile?.speed ?? 1.0,
    responseFormat: normalizeOpenAiResponseFormat(getString(args["openai-response-format"])) ??
      fromFile?.responseFormat ?? "mp3",
    instructions: getString(args["openai-instructions"]) ?? fromFile?.instructions
  };
}

function buildFalMinimaxParams(args: CliArgs, fileConfig: FileConfig): FalMinimaxTtsParams {
  const fromFile = fileConfig.tts?.params?.falMinimax;
  return {
    voiceId: getString(args["fal-minimax-voice-id"]) ?? fromFile?.voiceId ?? FAL_MINIMAX_VOICES[0],
    speed: getNumber(args["fal-minimax-speed"]) ?? fromFile?.speed ?? 1,
    vol: getNumber(args["fal-minimax-vol"]) ?? fromFile?.vol ?? 1,
    pitch: getNumber(args["fal-minimax-pitch"]) ?? fromFile?.pitch ?? 0,
    emotion: normalizeFalMinimaxEmotion(getString(args["fal-minimax-emotion"])) ?? fromFile?.emotion,
    englishNormalization: getBoolean(args["fal-minimax-english-normalization"]) ??
      fromFile?.englishNormalization ??
      false,
    languageBoost: getString(args["fal-minimax-language-boost"]) ?? fromFile?.languageBoost ?? "auto",
    outputFormat: normalizeFalMinimaxOutputFormat(getString(args["fal-minimax-output-format"])) ??
      fromFile?.outputFormat ??
      "url",
    audioFormat: normalizeFalMinimaxAudioFormat(getString(args["fal-minimax-audio-format"])) ??
      fromFile?.audioFormat ??
      "mp3",
    audioSampleRate: normalizeFalMinimaxSampleRate(getNumber(args["fal-minimax-audio-sample-rate"])) ??
      fromFile?.audioSampleRate ??
      32000,
    audioChannel: normalizeFalMinimaxAudioChannel(getNumber(args["fal-minimax-audio-channel"])) ??
      fromFile?.audioChannel ??
      1,
    audioBitrate: normalizeFalMinimaxAudioBitrate(getNumber(args["fal-minimax-audio-bitrate"])) ??
      fromFile?.audioBitrate ??
      128000,
    normalizationEnabled: getBoolean(args["fal-minimax-normalization-enabled"]) ??
      fromFile?.normalizationEnabled ??
      true,
    normalizationTargetLoudness: getNumber(args["fal-minimax-normalization-target-loudness"]) ??
      fromFile?.normalizationTargetLoudness ??
      -18,
    normalizationTargetRange: getNumber(args["fal-minimax-normalization-target-range"]) ??
      fromFile?.normalizationTargetRange ??
      8,
    normalizationTargetPeak: getNumber(args["fal-minimax-normalization-target-peak"]) ??
      fromFile?.normalizationTargetPeak ??
      -0.5,
    voiceModifyPitch: getNumber(args["fal-minimax-voice-modify-pitch"]) ?? fromFile?.voiceModifyPitch ?? 0,
    voiceModifyIntensity: getNumber(args["fal-minimax-voice-modify-intensity"]) ??
      fromFile?.voiceModifyIntensity ??
      0,
    voiceModifyTimbre: getNumber(args["fal-minimax-voice-modify-timbre"]) ?? fromFile?.voiceModifyTimbre ?? 0,
    pronunciationToneList: parseToneList(getString(args["fal-minimax-pronunciation-tone-list"])) ??
      fromFile?.pronunciationToneList
  };
}

function buildFalElevenlabsParams(args: CliArgs, fileConfig: FileConfig): FalElevenlabsTtsParams {
  const fromFile = fileConfig.tts?.params?.falElevenlabs;
  return {
    voice: getString(args["fal-elevenlabs-voice"]) ?? fromFile?.voice ?? "Rachel",
    stability: getNumber(args["fal-elevenlabs-stability"]) ?? fromFile?.stability ?? 0.5,
    similarityBoost: getNumber(args["fal-elevenlabs-similarity-boost"]) ??
      fromFile?.similarityBoost ??
      0.75,
    style: getNumber(args["fal-elevenlabs-style"]) ?? fromFile?.style ?? 0,
    speed: getNumber(args["fal-elevenlabs-speed"]) ?? fromFile?.speed ?? 1.0,
    timestamps: getBoolean(args["fal-elevenlabs-timestamps"]) ?? fromFile?.timestamps ?? false,
    languageCode: getString(args["fal-elevenlabs-language-code"]) ?? fromFile?.languageCode,
    applyTextNormalization: normalizeFalElevenApplyTextNormalization(
      getString(args["fal-elevenlabs-apply-text-normalization"])
    ) ?? fromFile?.applyTextNormalization ?? "auto"
  };
}

export function buildRuntimeConfig(args: CliArgs, fileConfig: FileConfig): RuntimeConfig {
  const providerRaw = getString(args["tts-provider"]) ?? fileConfig.tts?.provider;
  const provider = normalizeProvider(providerRaw);

  const tts: TtsConfig = {
    provider,
    params: {
      openai: buildOpenAiParams(args, fileConfig),
      falMinimax: buildFalMinimaxParams(args, fileConfig),
      falElevenlabs: buildFalElevenlabsParams(args, fileConfig)
    }
  };

  const telegram: TelegramConfig = {
    chatId: getString(args["telegram-chat-id"]) ?? fileConfig.telegram?.chatId
  };

  const keys: KeysConfig = {
    openai: {
      apiKey: getString(args["openai-api-key"]) ?? fileConfig.keys?.openai?.apiKey
    },
    fal: {
      apiKey: getString(args["fal-api-key"]) ?? fileConfig.keys?.fal?.apiKey
    },
    telegram: {
      botToken: getString(args["telegram-bot-token"]) ?? fileConfig.keys?.telegram?.botToken
    }
  };

  const ttsAsyncByDefault = getBoolean(args["tts-async-default"]) ??
    fileConfig.misc?.ttsAsyncByDefault ??
    true;

  return {
    tts,
    telegram,
    keys,
    misc: {
      ttsAsyncByDefault
    }
  };
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

export function getFalKey(runtime: RuntimeConfig): string | undefined {
  const envKey = getString(process.env.FAL_KEY) ?? getString(process.env.FAL_API_KEY);
  if (envKey) {
    return envKey;
  }
  return getString(runtime.keys.fal?.apiKey);
}

export function getTelegramBotToken(runtime: RuntimeConfig): string | undefined {
  return getString(runtime.keys.telegram?.botToken);
}

function isRemoteTtsConfigured(runtime: RuntimeConfig): boolean {
  if (runtime.tts.provider === "openai") {
    return Boolean(getOpenAIKey(runtime));
  }
  return Boolean(getFalKey(runtime));
}

export function isTtsAvailable(runtime: RuntimeConfig): boolean {
  return isRemoteTtsConfigured(runtime) || hasSystemTtsSupport();
}

export function isTelegramConfigured(runtime: RuntimeConfig): boolean {
  return Boolean(getTelegramBotToken(runtime) && getString(runtime.telegram.chatId));
}

export function getMissingConfigFields(runtime: RuntimeConfig): string[] {
  const missing: string[] = [];

  if (runtime.tts.provider === "openai" && !getOpenAIKey(runtime)) {
    missing.push("keys.openai.apiKey");
  }

  if ((runtime.tts.provider === "fal-minimax" || runtime.tts.provider === "fal-elevenlabs") &&
    !getFalKey(runtime)) {
    missing.push("keys.fal.apiKey");
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

function inferExtFromContentType(contentType: string | null): string {
  if (!contentType) {
    return "mp3";
  }
  const normalized = contentType.toLowerCase();
  if (normalized.includes("audio/wav") || normalized.includes("audio/x-wav")) {
    return "wav";
  }
  if (normalized.includes("audio/ogg") || normalized.includes("audio/opus")) {
    return "opus";
  }
  if (normalized.includes("audio/aac")) {
    return "aac";
  }
  if (normalized.includes("audio/flac")) {
    return "flac";
  }
  if (normalized.includes("audio/mpeg") || normalized.includes("audio/mp3")) {
    return "mp3";
  }
  return "mp3";
}

function inferExtFromUrl(urlString: string): string | undefined {
  try {
    const url = new URL(urlString);
    const ext = path.extname(url.pathname).replace(".", "").toLowerCase();
    return ext || undefined;
  } catch {
    return undefined;
  }
}

async function playAudioBuffer(data: Buffer, extension: string): Promise<void> {
  const ext = extension.trim().toLowerCase();
  if (ext === "pcm") {
    throw new Error("OpenAI response format `pcm` is not directly playable. Use wav/mp3/aac/flac/opus.");
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "simple-notify-mcp-"));
  const filePath = path.join(tmpDir, `speech.${ext || "mp3"}`);
  try {
    await writeFile(filePath, data);
    await playAudioFile(filePath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function playRemoteAudioUrl(audioUrl: string): Promise<void> {
  const response = await fetchWithTimeout(audioUrl, { method: "GET" }, 40_000);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Audio download failed (${response.status}): ${errorText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = inferExtFromUrl(audioUrl) ?? inferExtFromContentType(response.headers.get("content-type"));
  await playAudioBuffer(buffer, ext);
}

async function speakSystem(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!hasNonEmptyText(trimmed)) {
    return;
  }
  await runCommand("say", [trimmed]);
}

async function speakOpenAI(text: string, config: RuntimeConfig, apiKey: string): Promise<void> {
  const trimmed = text.trim();
  if (!hasNonEmptyText(trimmed)) {
    return;
  }

  const openai = config.tts.params.openai;
  const model = openai.model ?? DEFAULT_OPENAI_MODEL;
  const voice = openai.voice ?? DEFAULT_OPENAI_VOICE;
  const speed = clampNumber(openai.speed ?? 1.0, 0.25, 4.0);
  const format = openai.responseFormat ?? "mp3";

  const body: Record<string, unknown> = {
    model,
    voice,
    input: trimmed,
    response_format: format,
    speed
  };
  const instructions = getString(openai.instructions);
  if (instructions) {
    body.instructions = instructions;
  }

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/audio/speech",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    30_000
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI TTS error (${response.status}): ${errorText}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  await playAudioBuffer(data, format);
}

function extractFalAudioUrl(payload: JsonObject): string | undefined {
  const directAudio = payload.audio;
  if (typeof directAudio === "string" && directAudio.startsWith("http")) {
    return directAudio;
  }
  if (isJsonObject(directAudio) && typeof directAudio.url === "string") {
    return directAudio.url;
  }
  if (typeof payload.audio_url === "string") {
    return payload.audio_url;
  }
  return undefined;
}

function extractFalHexAudio(payload: JsonObject): string | undefined {
  const candidates: unknown[] = [
    payload.hex,
    payload.audio_hex,
    payload.audio
  ];

  const audio = payload.audio;
  if (isJsonObject(audio)) {
    candidates.push(audio.hex);
    candidates.push(audio.data);
    candidates.push(audio.content);
  }

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const normalized = candidate.trim();
    if (/^[0-9a-fA-F]+$/.test(normalized) && normalized.length % 2 === 0) {
      return normalized;
    }
  }

  return undefined;
}

async function parseFalJsonResponse(response: Response): Promise<JsonObject> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`FAL returned non-JSON payload: ${text}`);
  }
  if (!isJsonObject(parsed)) {
    throw new Error(`FAL returned unexpected payload: ${text}`);
  }
  return parsed;
}

async function speakFalMinimax(text: string, config: RuntimeConfig, apiKey: string): Promise<void> {
  const trimmed = text.trim();
  if (!hasNonEmptyText(trimmed)) {
    return;
  }

  const params = config.tts.params.falMinimax;
  const outputFormat = params.outputFormat ?? "url";
  const audioFormat = params.audioFormat ?? "mp3";
  const voicePitch = Math.round(clampNumber(params.pitch ?? 0, -12, 12));
  const voiceModifyPitch = Math.round(clampNumber(params.voiceModifyPitch ?? 0, -100, 100));
  const voiceModifyIntensity = Math.round(clampNumber(params.voiceModifyIntensity ?? 0, -100, 100));
  const voiceModifyTimbre = Math.round(clampNumber(params.voiceModifyTimbre ?? 0, -100, 100));

  const body: Record<string, unknown> = {
    prompt: trimmed,
    output_format: outputFormat,
    voice_setting: {
      speed: clampNumber(params.speed ?? 1, 0.5, 2.0),
      vol: clampNumber(params.vol ?? 1, 0.01, 10),
      voice_id: params.voiceId ?? FAL_MINIMAX_VOICES[0],
      pitch: voicePitch,
      english_normalization: params.englishNormalization ?? false
    },
    audio_setting: {
      format: audioFormat,
      sample_rate: params.audioSampleRate ?? 32000,
      channel: params.audioChannel ?? 1,
      bitrate: params.audioBitrate ?? 128000
    },
    normalization_setting: {
      enabled: params.normalizationEnabled ?? true,
      target_loudness: clampNumber(params.normalizationTargetLoudness ?? -18, -70, -10),
      target_range: clampNumber(params.normalizationTargetRange ?? 8, 0, 20),
      target_peak: clampNumber(params.normalizationTargetPeak ?? -0.5, -3, 0)
    },
    voice_modify: {
      pitch: voiceModifyPitch,
      intensity: voiceModifyIntensity,
      timbre: voiceModifyTimbre
    }
  };
  if (params.emotion) {
    (body.voice_setting as Record<string, unknown>).emotion = params.emotion;
  }
  if (params.languageBoost) {
    body.language_boost = params.languageBoost;
  }
  if (params.pronunciationToneList && params.pronunciationToneList.length > 0) {
    body.pronunciation_dict = {
      tone_list: params.pronunciationToneList
    };
  }

  const response = await fetchWithTimeout(
    "https://fal.run/fal-ai/minimax/speech-2.8-turbo",
    {
      method: "POST",
      headers: {
        "Authorization": `Key ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    40_000
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FAL MiniMax error (${response.status}): ${errorText}`);
  }

  const payload = await parseFalJsonResponse(response);
  if (outputFormat === "hex") {
    const hex = extractFalHexAudio(payload);
    if (!hex) {
      throw new Error("FAL MiniMax response did not contain hex audio data");
    }
    const data = Buffer.from(hex, "hex");
    await playAudioBuffer(data, audioFormat);
    return;
  }

  const audioUrl = extractFalAudioUrl(payload);
  if (!audioUrl) {
    throw new Error("FAL MiniMax response did not contain an audio URL");
  }
  await playRemoteAudioUrl(audioUrl);
}

async function speakFalElevenlabs(text: string, config: RuntimeConfig, apiKey: string): Promise<void> {
  const trimmed = text.trim();
  if (!hasNonEmptyText(trimmed)) {
    return;
  }

  const params = config.tts.params.falElevenlabs;
  const body: Record<string, unknown> = {
    text: trimmed,
    voice: params.voice ?? "Rachel",
    stability: clampNumber(params.stability ?? 0.5, 0, 1),
    similarity_boost: clampNumber(params.similarityBoost ?? 0.75, 0, 1),
    style: clampNumber(params.style ?? 0, 0, 1),
    speed: clampNumber(params.speed ?? 1, 0.7, 1.2),
    timestamps: params.timestamps ?? false,
    apply_text_normalization: params.applyTextNormalization ?? "auto"
  };
  if (params.languageCode) {
    body.language_code = params.languageCode;
  }

  const response = await fetchWithTimeout(
    "https://fal.run/fal-ai/elevenlabs/tts/eleven-v3",
    {
      method: "POST",
      headers: {
        "Authorization": `Key ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    40_000
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FAL ElevenLabs error (${response.status}): ${errorText}`);
  }

  const payload = await parseFalJsonResponse(response);
  const audioUrl = extractFalAudioUrl(payload);
  if (!audioUrl) {
    throw new Error("FAL ElevenLabs response did not contain an audio URL");
  }
  await playRemoteAudioUrl(audioUrl);
}

function missingProviderKeyError(provider: TtsProvider): string {
  if (provider === "openai") {
    return "OpenAI key missing (set OPENAI_API_KEY or keys.openai.apiKey)";
  }
  return "FAL key missing (set FAL_KEY/FAL_API_KEY or keys.fal.apiKey)";
}

export async function speakText(text: string, runtime: RuntimeConfig): Promise<void> {
  const trimmed = text.trim();
  if (!hasNonEmptyText(trimmed)) {
    return;
  }

  const hasSystem = hasSystemTtsSupport();
  const provider = runtime.tts.provider;

  try {
    if (provider === "openai") {
      const openAIKey = getOpenAIKey(runtime);
      if (!openAIKey) {
        throw new Error(missingProviderKeyError(provider));
      }
      await speakOpenAI(trimmed, runtime, openAIKey);
      return;
    }

    if (provider === "fal-minimax") {
      const falKey = getFalKey(runtime);
      if (!falKey) {
        throw new Error(missingProviderKeyError(provider));
      }
      await speakFalMinimax(trimmed, runtime, falKey);
      return;
    }

    const falKey = getFalKey(runtime);
    if (!falKey) {
      throw new Error(missingProviderKeyError(provider));
    }
    await speakFalElevenlabs(trimmed, runtime, falKey);
    return;
  } catch (err) {
    if (!hasSystem) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[simple-notify-mcp] ${provider} TTS failed, falling back to system TTS: ${message}`);
    await speakSystem(trimmed);
  }
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
  const openaiParams = withDefinedProps({
    model: runtime.tts.params.openai.model,
    voice: runtime.tts.params.openai.voice,
    speed: runtime.tts.params.openai.speed,
    responseFormat: runtime.tts.params.openai.responseFormat,
    instructions: runtime.tts.params.openai.instructions
  });

  const falMinimaxParams = withDefinedProps({
    voiceId: runtime.tts.params.falMinimax.voiceId,
    speed: runtime.tts.params.falMinimax.speed,
    vol: runtime.tts.params.falMinimax.vol,
    pitch: runtime.tts.params.falMinimax.pitch,
    emotion: runtime.tts.params.falMinimax.emotion,
    englishNormalization: runtime.tts.params.falMinimax.englishNormalization,
    languageBoost: runtime.tts.params.falMinimax.languageBoost,
    outputFormat: runtime.tts.params.falMinimax.outputFormat,
    audioFormat: runtime.tts.params.falMinimax.audioFormat,
    audioSampleRate: runtime.tts.params.falMinimax.audioSampleRate,
    audioChannel: runtime.tts.params.falMinimax.audioChannel,
    audioBitrate: runtime.tts.params.falMinimax.audioBitrate,
    normalizationEnabled: runtime.tts.params.falMinimax.normalizationEnabled,
    normalizationTargetLoudness: runtime.tts.params.falMinimax.normalizationTargetLoudness,
    normalizationTargetRange: runtime.tts.params.falMinimax.normalizationTargetRange,
    normalizationTargetPeak: runtime.tts.params.falMinimax.normalizationTargetPeak,
    voiceModifyPitch: runtime.tts.params.falMinimax.voiceModifyPitch,
    voiceModifyIntensity: runtime.tts.params.falMinimax.voiceModifyIntensity,
    voiceModifyTimbre: runtime.tts.params.falMinimax.voiceModifyTimbre,
    pronunciationToneList: runtime.tts.params.falMinimax.pronunciationToneList &&
      runtime.tts.params.falMinimax.pronunciationToneList.length > 0
      ? runtime.tts.params.falMinimax.pronunciationToneList
      : undefined
  });

  const falElevenlabsParams = withDefinedProps({
    voice: runtime.tts.params.falElevenlabs.voice,
    stability: runtime.tts.params.falElevenlabs.stability,
    similarityBoost: runtime.tts.params.falElevenlabs.similarityBoost,
    style: runtime.tts.params.falElevenlabs.style,
    speed: runtime.tts.params.falElevenlabs.speed,
    timestamps: runtime.tts.params.falElevenlabs.timestamps,
    languageCode: runtime.tts.params.falElevenlabs.languageCode,
    applyTextNormalization: runtime.tts.params.falElevenlabs.applyTextNormalization
  });

  const keysOpenAI = withDefinedProps({
    apiKey: runtime.keys.openai?.apiKey
  });

  const keysFal = withDefinedProps({
    apiKey: runtime.keys.fal?.apiKey
  });

  const keysTelegram = withDefinedProps({
    botToken: runtime.keys.telegram?.botToken
  });

  const telegram = withDefinedProps({
    chatId: runtime.telegram.chatId
  });

  const keysPayload = {
    ...(Object.keys(keysOpenAI).length > 0 ? { openai: keysOpenAI as { apiKey?: string } } : {}),
    ...(Object.keys(keysFal).length > 0 ? { fal: keysFal as { apiKey?: string } } : {}),
    ...(Object.keys(keysTelegram).length > 0 ? { telegram: keysTelegram as { botToken?: string } } : {})
  };

  const miscPayload = withDefinedProps({
    ttsAsyncByDefault: runtime.misc.ttsAsyncByDefault
  });

  const payload: FileConfig = {
    tts: {
      provider: runtime.tts.provider,
      params: {
        openai: openaiParams as OpenAiTtsParams,
        falMinimax: falMinimaxParams as FalMinimaxTtsParams,
        falElevenlabs: falElevenlabsParams as FalElevenlabsTtsParams
      }
    },
    ...(Object.keys(telegram).length > 0 ? { telegram: telegram as TelegramConfig } : {}),
    ...(Object.keys(keysPayload).length > 0 ? { keys: keysPayload } : {}),
    ...(Object.keys(miscPayload).length > 0 ? { misc: miscPayload as MiscConfig } : {})
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
