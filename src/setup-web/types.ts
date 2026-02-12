import type { RuntimeConfig } from "../runtime.js";

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

export type SetupWebHandlers = {
  getRuntime: () => RuntimeConfig;
  onRuntimeSaved: (runtime: RuntimeConfig) => Promise<void> | void;
  reloadRuntime?: () => Promise<void> | void;
};

export type SubmittedSetupConfig = {
  runTests?: string;
  testText?: string;
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
  falMinimaxEmotion?: string;
  falMinimaxEnglishNormalization?: string;
  falMinimaxLanguageBoost?: string;
  falMinimaxOutputFormat?: string;
  falMinimaxAudioFormat?: string;
  falMinimaxAudioSampleRate?: string;
  falMinimaxAudioChannel?: string;
  falMinimaxAudioBitrate?: string;
  falMinimaxNormalizationEnabled?: string;
  falMinimaxNormalizationTargetLoudness?: string;
  falMinimaxNormalizationTargetRange?: string;
  falMinimaxNormalizationTargetPeak?: string;
  falMinimaxVoiceModifyPitch?: string;
  falMinimaxVoiceModifyIntensity?: string;
  falMinimaxVoiceModifyTimbre?: string;
  falMinimaxPronunciationToneList?: string;
  falElevenVoice?: string;
  falElevenStability?: string;
  falElevenSimilarityBoost?: string;
  falElevenStyle?: string;
  falElevenSpeed?: string;
  falElevenTimestamps?: string;
  falElevenLanguageCode?: string;
  falElevenApplyTextNormalization?: string;
  openaiApiKey?: string;
  falApiKey?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  ttsAsyncByDefault?: string;
  clearOpenaiApiKey?: string;
  clearFalApiKey?: string;
  clearTelegramBotToken?: string;
};

export type SetupTestName = "tts" | "telegram";

export type SetupTestResult = {
  ok: boolean;
  message: string;
};

export type SetupTestPayload = {
  tts?: SetupTestResult;
  telegram?: SetupTestResult;
};

export type SecretStatus = {
  label: "Missing" | "Set" | "Set (config)" | "Set (env)";
  className: "bad" | "ok";
};

export type KeyStatusPayload = {
  openai: SecretStatus;
  fal: SecretStatus;
  telegram: SecretStatus;
};
