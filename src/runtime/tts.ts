import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getString } from "./args.js";
import { DEFAULT_OPENAI_MODEL, DEFAULT_OPENAI_VOICE, FAL_MINIMAX_VOICES } from "./constants.js";
import { getFalKey, getOpenAIKey, hasSystemTtsSupport } from "./capabilities.js";
import { fetchWithTimeout } from "./net.js";
import type { JsonObject, RuntimeConfig, TtsProvider } from "./types.js";

function hasNonEmptyText(value: string): boolean {
  return value.trim().length > 0;
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

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

async function speakWithConfiguredProvider(
  text: string,
  runtime: RuntimeConfig,
  fallbackToSystem: boolean
): Promise<void> {
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
    if (!fallbackToSystem || !hasSystem) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[simple-notify-mcp] ${provider} TTS failed, falling back to system TTS: ${message}`);
    await speakSystem(trimmed);
  }
}

let speechQueueTail: Promise<void> = Promise.resolve();

function enqueueSpeech(task: () => Promise<void>): Promise<void> {
  const job = speechQueueTail.then(task, task);
  speechQueueTail = job.catch(() => undefined);
  return job;
}

export async function speakText(text: string, runtime: RuntimeConfig): Promise<void> {
  await enqueueSpeech(async () => {
    await speakWithConfiguredProvider(text, runtime, true);
  });
}

export async function testTtsProvider(text: string, runtime: RuntimeConfig): Promise<void> {
  await enqueueSpeech(async () => {
    await speakWithConfiguredProvider(text, runtime, false);
  });
}
