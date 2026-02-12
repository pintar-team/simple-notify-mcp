import process from "node:process";

import { getString } from "./args.js";
import type { RuntimeConfig } from "./types.js";

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
