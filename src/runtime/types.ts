import type {
  FAL_ELEVEN_APPLY_TEXT_NORMALIZATION_OPTIONS,
  FAL_MINIMAX_AUDIO_BITRATES,
  FAL_MINIMAX_AUDIO_CHANNELS,
  FAL_MINIMAX_AUDIO_FORMATS,
  FAL_MINIMAX_EMOTIONS,
  FAL_MINIMAX_SAMPLE_RATES,
  OPENAI_RESPONSE_FORMATS
} from "./constants.js";

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
  applyTextNormalization?: (typeof FAL_ELEVEN_APPLY_TEXT_NORMALIZATION_OPTIONS)[number];
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

export const TELEGRAM_PARSE_MODES = ["plain", "markdown", "html"] as const;
export type TelegramParseMode = (typeof TELEGRAM_PARSE_MODES)[number];

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

export type JsonObject = Record<string, unknown>;
