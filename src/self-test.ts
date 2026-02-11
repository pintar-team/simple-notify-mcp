#!/usr/bin/env node
import process from "node:process";
import {
  getString,
  hasSystemTtsSupport,
  loadRuntime,
  sendTelegram,
  speakText
} from "./runtime.js";

const argv = process.argv.slice(2);
const { args, runtime } = await loadRuntime(argv);

const text = getString(args["text"]) ?? "simple-notify-mcp self-test";
const ttsEnabled = (Boolean(process.env.OPENAI_API_KEY) || hasSystemTtsSupport()) &&
  args["tts"] !== false;
const telegramEnabled = Boolean(runtime.keys.telegram?.botToken && runtime.telegram.chatId) &&
  args["telegram"] !== false;

if (!ttsEnabled && !telegramEnabled) {
  console.error("[self-test] no enabled tools (set OPENAI_API_KEY or telegram config)");
  process.exit(0);
}

let failed = false;

if (ttsEnabled) {
  try {
    console.error("[self-test] tts_say: starting");
    await speakText(text, runtime);
    console.error("[self-test] tts_say: ok");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[self-test] tts_say: failed (${message})`);
    failed = true;
  }
}

if (telegramEnabled) {
  try {
    console.error("[self-test] telegram_notify: starting");
    await sendTelegram(text, runtime);
    console.error("[self-test] telegram_notify: ok");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[self-test] telegram_notify: failed (${message})`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
