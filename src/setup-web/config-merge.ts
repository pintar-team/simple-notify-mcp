import {
  FAL_MINIMAX_AUDIO_BITRATES,
  FAL_MINIMAX_AUDIO_CHANNELS,
  FAL_MINIMAX_AUDIO_FORMATS,
  FAL_ELEVEN_APPLY_TEXT_NORMALIZATION_OPTIONS,
  FAL_MINIMAX_EMOTIONS,
  FAL_MINIMAX_SAMPLE_RATES,
  OPENAI_RESPONSE_FORMATS,
  getString,
  type RuntimeConfig,
  type TtsProvider
} from "../runtime.js";
import type { SubmittedSetupConfig } from "./types.js";

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

function parseNumberString(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().replace(",", ".");
  if (normalized === "") {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
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

function normalizeFalMinimaxAudioFormat(
  value: string | undefined
): RuntimeConfig["tts"]["params"]["falMinimax"]["audioFormat"] {
  if (!value) {
    return undefined;
  }
  return FAL_MINIMAX_AUDIO_FORMATS.includes(value as (typeof FAL_MINIMAX_AUDIO_FORMATS)[number])
    ? value as RuntimeConfig["tts"]["params"]["falMinimax"]["audioFormat"]
    : undefined;
}

function normalizeFalMinimaxSampleRate(
  value: number | undefined
): RuntimeConfig["tts"]["params"]["falMinimax"]["audioSampleRate"] {
  if (!value) {
    return undefined;
  }
  return FAL_MINIMAX_SAMPLE_RATES.includes(value as (typeof FAL_MINIMAX_SAMPLE_RATES)[number])
    ? value as RuntimeConfig["tts"]["params"]["falMinimax"]["audioSampleRate"]
    : undefined;
}

function normalizeFalMinimaxAudioChannel(
  value: number | undefined
): RuntimeConfig["tts"]["params"]["falMinimax"]["audioChannel"] {
  if (!value) {
    return undefined;
  }
  return FAL_MINIMAX_AUDIO_CHANNELS.includes(value as (typeof FAL_MINIMAX_AUDIO_CHANNELS)[number])
    ? value as RuntimeConfig["tts"]["params"]["falMinimax"]["audioChannel"]
    : undefined;
}

function normalizeFalMinimaxAudioBitrate(
  value: number | undefined
): RuntimeConfig["tts"]["params"]["falMinimax"]["audioBitrate"] {
  if (!value) {
    return undefined;
  }
  return FAL_MINIMAX_AUDIO_BITRATES.includes(value as (typeof FAL_MINIMAX_AUDIO_BITRATES)[number])
    ? value as RuntimeConfig["tts"]["params"]["falMinimax"]["audioBitrate"]
    : undefined;
}

function normalizeFalMinimaxEmotion(
  value: string | undefined
): RuntimeConfig["tts"]["params"]["falMinimax"]["emotion"] {
  if (!value) {
    return undefined;
  }
  return FAL_MINIMAX_EMOTIONS.includes(value as (typeof FAL_MINIMAX_EMOTIONS)[number])
    ? value as RuntimeConfig["tts"]["params"]["falMinimax"]["emotion"]
    : undefined;
}

function parseToneListInput(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const list = value
    .split(/[\n,]/g)
    .map(item => item.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
}

export function toneListToInput(value: string[] | undefined): string {
  if (!value || value.length === 0) {
    return "";
  }
  return value.join("\n");
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

export function mergeRuntimeConfig(current: RuntimeConfig, incoming: SubmittedSetupConfig): RuntimeConfig {
  const provider = normalizeProvider(getString(incoming.provider)) ?? current.tts.provider;

  const openaiModel = getString(incoming.openaiModel) ?? current.tts.params.openai.model;
  const openaiVoice = getString(incoming.openaiVoice) ?? current.tts.params.openai.voice;
  const openaiSpeed = parseNumberString(getString(incoming.openaiSpeed)) ?? current.tts.params.openai.speed;
  const openaiResponseFormat = normalizeOpenAiFormat(getString(incoming.openaiResponseFormat)) ??
    current.tts.params.openai.responseFormat;
  const openaiInstructions = getString(incoming.openaiInstructions) ?? current.tts.params.openai.instructions;

  const falMinimaxVoiceId = getString(incoming.falMinimaxVoiceId) ?? current.tts.params.falMinimax.voiceId;
  const falMinimaxSpeed = parseNumberString(getString(incoming.falMinimaxSpeed)) ?? current.tts.params.falMinimax.speed;
  const falMinimaxVol = parseNumberString(getString(incoming.falMinimaxVol)) ?? current.tts.params.falMinimax.vol;
  const falMinimaxPitch = parseNumberString(getString(incoming.falMinimaxPitch)) ?? current.tts.params.falMinimax.pitch;
  const falMinimaxEmotion = normalizeFalMinimaxEmotion(getString(incoming.falMinimaxEmotion)) ??
    current.tts.params.falMinimax.emotion;
  const falMinimaxEnglishNormalization = parseBooleanString(getString(incoming.falMinimaxEnglishNormalization)) ??
    current.tts.params.falMinimax.englishNormalization;
  const falMinimaxLanguageBoost = getString(incoming.falMinimaxLanguageBoost) ??
    current.tts.params.falMinimax.languageBoost;
  const falMinimaxOutputFormat = normalizeFalMinimaxOutputFormat(getString(incoming.falMinimaxOutputFormat)) ??
    current.tts.params.falMinimax.outputFormat;
  const falMinimaxAudioFormat = normalizeFalMinimaxAudioFormat(getString(incoming.falMinimaxAudioFormat)) ??
    current.tts.params.falMinimax.audioFormat;
  const falMinimaxAudioSampleRate = normalizeFalMinimaxSampleRate(
    parseNumberString(getString(incoming.falMinimaxAudioSampleRate))
  ) ??
    current.tts.params.falMinimax.audioSampleRate;
  const falMinimaxAudioChannel = normalizeFalMinimaxAudioChannel(
    parseNumberString(getString(incoming.falMinimaxAudioChannel))
  ) ??
    current.tts.params.falMinimax.audioChannel;
  const falMinimaxAudioBitrate = normalizeFalMinimaxAudioBitrate(
    parseNumberString(getString(incoming.falMinimaxAudioBitrate))
  ) ??
    current.tts.params.falMinimax.audioBitrate;
  const falMinimaxNormalizationEnabled = parseBooleanString(getString(incoming.falMinimaxNormalizationEnabled)) ??
    current.tts.params.falMinimax.normalizationEnabled;
  const falMinimaxNormalizationTargetLoudness = parseNumberString(getString(incoming.falMinimaxNormalizationTargetLoudness)) ??
    current.tts.params.falMinimax.normalizationTargetLoudness;
  const falMinimaxNormalizationTargetRange = parseNumberString(getString(incoming.falMinimaxNormalizationTargetRange)) ??
    current.tts.params.falMinimax.normalizationTargetRange;
  const falMinimaxNormalizationTargetPeak = parseNumberString(getString(incoming.falMinimaxNormalizationTargetPeak)) ??
    current.tts.params.falMinimax.normalizationTargetPeak;
  const falMinimaxVoiceModifyPitch = parseNumberString(getString(incoming.falMinimaxVoiceModifyPitch)) ??
    current.tts.params.falMinimax.voiceModifyPitch;
  const falMinimaxVoiceModifyIntensity = parseNumberString(getString(incoming.falMinimaxVoiceModifyIntensity)) ??
    current.tts.params.falMinimax.voiceModifyIntensity;
  const falMinimaxVoiceModifyTimbre = parseNumberString(getString(incoming.falMinimaxVoiceModifyTimbre)) ??
    current.tts.params.falMinimax.voiceModifyTimbre;
  const falMinimaxPronunciationToneList = parseToneListInput(getString(incoming.falMinimaxPronunciationToneList)) ??
    current.tts.params.falMinimax.pronunciationToneList;

  const falElevenVoice = getString(incoming.falElevenVoice) ?? current.tts.params.falElevenlabs.voice;
  const falElevenStability = parseNumberString(getString(incoming.falElevenStability)) ??
    current.tts.params.falElevenlabs.stability;
  const falElevenSimilarityBoost = parseNumberString(getString(incoming.falElevenSimilarityBoost)) ??
    current.tts.params.falElevenlabs.similarityBoost;
  const falElevenStyle = parseNumberString(getString(incoming.falElevenStyle)) ?? current.tts.params.falElevenlabs.style;
  const falElevenSpeed = parseNumberString(getString(incoming.falElevenSpeed)) ?? current.tts.params.falElevenlabs.speed;
  const falElevenTimestamps = parseBooleanString(getString(incoming.falElevenTimestamps)) ??
    current.tts.params.falElevenlabs.timestamps;
  const falElevenLanguageCode = getString(incoming.falElevenLanguageCode) ??
    current.tts.params.falElevenlabs.languageCode;
  const falElevenApplyTextNormalization = normalizeFalElevenApplyTextNormalization(
    getString(incoming.falElevenApplyTextNormalization)
  ) ?? current.tts.params.falElevenlabs.applyTextNormalization;

  const clearOpenaiApiKey = parseBooleanString(getString(incoming.clearOpenaiApiKey)) ?? false;
  const clearFalApiKey = parseBooleanString(getString(incoming.clearFalApiKey)) ?? false;
  const clearTelegramBotToken = parseBooleanString(getString(incoming.clearTelegramBotToken)) ?? false;

  // Empty secret fields keep existing values unless an explicit clear toggle is enabled.
  const openaiApiKey = clearOpenaiApiKey
    ? undefined
    : (getString(incoming.openaiApiKey) ?? current.keys.openai?.apiKey);
  const falApiKey = clearFalApiKey
    ? undefined
    : (getString(incoming.falApiKey) ?? current.keys.fal?.apiKey);
  const telegramBotToken = clearTelegramBotToken
    ? undefined
    : (getString(incoming.telegramBotToken) ?? current.keys.telegram?.botToken);
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
          emotion: falMinimaxEmotion,
          englishNormalization: falMinimaxEnglishNormalization,
          languageBoost: falMinimaxLanguageBoost,
          outputFormat: falMinimaxOutputFormat,
          audioFormat: falMinimaxAudioFormat,
          audioSampleRate: falMinimaxAudioSampleRate,
          audioChannel: falMinimaxAudioChannel,
          audioBitrate: falMinimaxAudioBitrate,
          normalizationEnabled: falMinimaxNormalizationEnabled,
          normalizationTargetLoudness: falMinimaxNormalizationTargetLoudness,
          normalizationTargetRange: falMinimaxNormalizationTargetRange,
          normalizationTargetPeak: falMinimaxNormalizationTargetPeak,
          voiceModifyPitch: falMinimaxVoiceModifyPitch,
          voiceModifyIntensity: falMinimaxVoiceModifyIntensity,
          voiceModifyTimbre: falMinimaxVoiceModifyTimbre,
          pronunciationToneList: falMinimaxPronunciationToneList
        },
        falElevenlabs: {
          voice: falElevenVoice,
          stability: falElevenStability,
          similarityBoost: falElevenSimilarityBoost,
          style: falElevenStyle,
          speed: falElevenSpeed,
          timestamps: falElevenTimestamps,
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
