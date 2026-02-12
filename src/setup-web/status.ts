import {
  getFalKey,
  getOpenAIKey,
  getString,
  getTelegramBotToken,
  type RuntimeConfig
} from "../runtime.js";
import type { KeyStatusPayload, SecretStatus } from "./types.js";

function getOpenAiSecretStatus(runtime: RuntimeConfig): SecretStatus {
  if (getString(runtime.keys.openai?.apiKey)) {
    return { label: "Set (config)", className: "ok" };
  }
  if (getOpenAIKey(runtime)) {
    return { label: "Set (env)", className: "ok" };
  }
  return { label: "Missing", className: "bad" };
}

function getFalSecretStatus(runtime: RuntimeConfig): SecretStatus {
  if (getString(runtime.keys.fal?.apiKey)) {
    return { label: "Set (config)", className: "ok" };
  }
  if (getFalKey(runtime)) {
    return { label: "Set (env)", className: "ok" };
  }
  return { label: "Missing", className: "bad" };
}

function getTelegramSecretStatus(runtime: RuntimeConfig): SecretStatus {
  if (getTelegramBotToken(runtime)) {
    return { label: "Set", className: "ok" };
  }
  return { label: "Missing", className: "bad" };
}

export function buildKeyStatusPayload(runtime: RuntimeConfig): KeyStatusPayload {
  return {
    openai: getOpenAiSecretStatus(runtime),
    fal: getFalSecretStatus(runtime),
    telegram: getTelegramSecretStatus(runtime)
  };
}
