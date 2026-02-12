import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { getBoolean, getNumber, getString, parseArgs } from "./args.js";
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_OPENAI_VOICE,
  FAL_ELEVEN_APPLY_TEXT_NORMALIZATION_OPTIONS,
  FAL_MINIMAX_AUDIO_BITRATES,
  FAL_MINIMAX_AUDIO_CHANNELS,
  FAL_MINIMAX_AUDIO_FORMATS,
  FAL_MINIMAX_EMOTIONS,
  FAL_MINIMAX_SAMPLE_RATES,
  FAL_MINIMAX_VOICES,
  OPENAI_RESPONSE_FORMATS
} from "./constants.js";
import type {
  CliArgs,
  FalElevenlabsTtsParams,
  FalMinimaxTtsParams,
  FileConfig,
  MiscConfig,
  OpenAiResponseFormat,
  OpenAiTtsParams,
  RuntimeConfig,
  RuntimeState,
  TelegramConfig,
  TtsProvider
} from "./types.js";

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
  const providerRaw = getString(args["tts-provider"]) ?? fileConfig.tts?.provider;
  const provider = normalizeProvider(providerRaw);

  const tts = {
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

  const keys = {
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
