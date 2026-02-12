#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { access } from "node:fs/promises";
import {
  getBoolean,
  getString,
  isTtsAvailable,
  loadRuntime,
  sendTelegram,
  sendTelegramPhoto,
  speakText
} from "./runtime.js";

const argv = process.argv.slice(2);
const { args, runtime } = await loadRuntime(argv);

const text = getString(args["text"]) ?? "Task complete. Build passed and your results are ready.";
const markdownText = getString(args["telegram-markdown-text"]) ??
  "**Self-test** markdown mode: `ok` [link](https://example.com)";
const htmlText = getString(args["telegram-html-text"]) ??
  "<b>Self-test</b> html mode: <code>ok</code> <a href=\"https://example.com\">link</a>";
const photoCaption = getString(args["telegram-photo-caption"]) ??
  "**Self-test** photo caption";

function isFlagEnabled(name: string, defaultValue: boolean): boolean {
  const value = getBoolean(args[name]);
  return value === undefined ? defaultValue : value;
}

const ttsEnabled = isTtsAvailable(runtime) && isFlagEnabled("tts", true);
const telegramEnabled = Boolean(runtime.keys.telegram?.botToken && runtime.telegram.chatId) &&
  isFlagEnabled("telegram", true);
const telegramMarkdownEnabled = telegramEnabled && isFlagEnabled("telegram-markdown", true);
const telegramHtmlEnabled = telegramEnabled && isFlagEnabled("telegram-html", true);
const telegramPhotoEnabled = telegramEnabled && isFlagEnabled("telegram-photo", true);

async function preparePhotoPath(): Promise<string> {
  const explicitPath = getString(args["telegram-photo-path"]);
  if (explicitPath) {
    return explicitPath;
  }

  const defaultRepoLogo = path.resolve(process.cwd(), "img", "logo.jpeg");
  await access(defaultRepoLogo);
  return defaultRepoLogo;
}

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
    console.error("[self-test] telegram_notify (plain): starting");
    await sendTelegram(text, runtime);
    console.error("[self-test] telegram_notify (plain): ok");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[self-test] telegram_notify (plain): failed (${message})`);
    failed = true;
  }
}

if (telegramMarkdownEnabled) {
  try {
    console.error("[self-test] telegram_notify (markdown): starting");
    await sendTelegram(markdownText, runtime, { parseMode: "markdown" });
    console.error("[self-test] telegram_notify (markdown): ok");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[self-test] telegram_notify (markdown): failed (${message})`);
    failed = true;
  }
}

if (telegramHtmlEnabled) {
  try {
    console.error("[self-test] telegram_notify (html): starting");
    await sendTelegram(htmlText, runtime, { parseMode: "html" });
    console.error("[self-test] telegram_notify (html): ok");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[self-test] telegram_notify (html): failed (${message})`);
    failed = true;
  }
}

if (telegramPhotoEnabled) {
  try {
    const photoPath = await preparePhotoPath();
    console.error("[self-test] telegram_send_photo: starting");
    await sendTelegramPhoto(photoPath, runtime, { caption: photoCaption, parseMode: "markdown" });
    console.error("[self-test] telegram_send_photo: ok");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[self-test] telegram_send_photo: failed (${message})`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
