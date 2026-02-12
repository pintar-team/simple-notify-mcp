import { readFile } from "node:fs/promises";
import path from "node:path";

import { getString } from "./args.js";
import { getTelegramBotToken } from "./capabilities.js";
import { fetchWithTimeout } from "./net.js";
import {
  enforceTelegramTextLength,
  prepareTelegramText,
  TELEGRAM_CAPTION_MAX_CHARS,
  TELEGRAM_TEXT_MAX_CHARS,
  type PreparedTelegramText
} from "./telegram-format.js";
import type { JsonObject, RuntimeConfig, TelegramParseMode } from "./types.js";

export type TelegramSendOptions = {
  parseMode?: TelegramParseMode;
};

export type TelegramSendPhotoOptions = {
  caption?: string;
  parseMode?: TelegramParseMode;
};

export type TelegramReadOptions = {
  offset?: number;
  limit?: number;
  timeoutSeconds?: number;
};

export type TelegramInboxMessage = {
  updateId: number;
  kind: "message" | "edited_message" | "channel_post" | "edited_channel_post";
  chatId: string;
  messageId?: number;
  date?: number;
  text?: string;
  from?: string;
};

export type TelegramReadResult = {
  fetched: number;
  matched: number;
  nextOffset?: number;
  messages: TelegramInboxMessage[];
};

export type TelegramImageMessage = {
  updateId: number;
  kind: "message" | "edited_message" | "channel_post" | "edited_channel_post";
  chatId: string;
  messageId?: number;
  date?: number;
  from?: string;
  caption?: string;
  fileId: string;
  width?: number;
  height?: number;
  fileSize?: number;
};

export type TelegramImageReadResult = {
  fetched: number;
  matched: number;
  nextOffset?: number;
  images: TelegramImageMessage[];
};

export type TelegramDownloadedFile = {
  mimeType: string;
  dataBase64: string;
  bytes: number;
  filePath: string;
};

class TelegramApiRequestError extends Error {
  readonly action: string;
  readonly status: number;
  readonly description?: string;
  readonly errorCode?: number;

  constructor(action: string, status: number, payloadRaw: string, description?: string, errorCode?: number) {
    const suffix = description ? `: ${description}` : `: ${payloadRaw}`;
    super(`Telegram ${action} error (${status})${suffix}`);
    this.name = "TelegramApiRequestError";
    this.action = action;
    this.status = status;
    this.description = description;
    this.errorCode = errorCode;
  }
}

function normalizeTelegramParseMode(value: TelegramParseMode | undefined): TelegramParseMode {
  if (value === "markdown" || value === "html") {
    return value;
  }
  return "plain";
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getIntegerFromUnknown(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function getStringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed !== "") {
      return trimmed;
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "bigint") {
    return String(value);
  }
  return undefined;
}

function getNumberFromUnknown(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function isTelegramParseEntityError(err: unknown): boolean {
  if (!(err instanceof TelegramApiRequestError)) {
    return false;
  }
  const description = (err.description ?? err.message).toLowerCase();
  return description.includes("parse entities") ||
    description.includes("can't parse entities") ||
    description.includes("can't find end of");
}

function shouldRetryTelegramAsPlain(parseMode: TelegramParseMode, err: unknown): boolean {
  return parseMode === "markdown" && isTelegramParseEntityError(err);
}

const TELEGRAM_IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp"
};

function inferTelegramUploadImageMimeType(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  return TELEGRAM_IMAGE_MIME_BY_EXT[ext];
}

async function parseTelegramApiSuccess(response: Response, action: string): Promise<void> {
  const payloadRaw = await response.text();
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(payloadRaw);
  } catch {
    throw new TelegramApiRequestError(action, response.status, payloadRaw);
  }

  const parsedObject = isJsonObject(parsedPayload) ? parsedPayload : undefined;
  const description = parsedObject ? getStringFromUnknown(parsedObject.description) : undefined;
  const errorCode = parsedObject ? getIntegerFromUnknown(parsedObject.error_code) : undefined;

  if (!response.ok) {
    throw new TelegramApiRequestError(action, response.status, payloadRaw, description, errorCode);
  }
  if (!parsedObject || parsedObject.ok !== true) {
    throw new TelegramApiRequestError(action, response.status, payloadRaw, description, errorCode);
  }
}

export async function sendTelegram(
  text: string,
  runtime: RuntimeConfig,
  options: TelegramSendOptions = {}
): Promise<void> {
  const botToken = getTelegramBotToken(runtime);
  const chatId = getString(runtime.telegram.chatId);
  if (!botToken || !chatId) {
    throw new Error("Telegram config missing");
  }

  const parseMode = normalizeTelegramParseMode(options.parseMode);
  const prepared = prepareTelegramText(text, parseMode);
  enforceTelegramTextLength(prepared.visibleText, TELEGRAM_TEXT_MAX_CHARS, "message");

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: prepared.text
  };
  if (prepared.telegramParseMode) {
    body.parse_mode = prepared.telegramParseMode;
  }

  try {
    const response = await fetchWithTimeout(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      },
      15_000
    );
    await parseTelegramApiSuccess(response, "sendMessage");
  } catch (err) {
    if (!shouldRetryTelegramAsPlain(parseMode, err)) {
      throw err;
    }

    const fallbackBody = {
      chat_id: chatId,
      text: prepared.normalizedSource
    };
    enforceTelegramTextLength(fallbackBody.text, TELEGRAM_TEXT_MAX_CHARS, "message");
    const fallbackResponse = await fetchWithTimeout(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(fallbackBody)
      },
      15_000
    );
    await parseTelegramApiSuccess(fallbackResponse, "sendMessage");
  }
}

export async function sendTelegramPhoto(
  filePath: string,
  runtime: RuntimeConfig,
  options: TelegramSendPhotoOptions = {}
): Promise<void> {
  const botToken = getTelegramBotToken(runtime);
  const chatId = getString(runtime.telegram.chatId);
  if (!botToken || !chatId) {
    throw new Error("Telegram config missing");
  }

  const normalizedPath = getString(filePath);
  if (!normalizedPath) {
    throw new Error("Telegram photo filePath is required");
  }

  const imageMimeType = inferTelegramUploadImageMimeType(normalizedPath);
  if (!imageMimeType) {
    throw new Error("Unsupported image format. Use jpg, jpeg, png, webp, gif, or bmp.");
  }

  let imageData: Buffer;
  try {
    imageData = await readFile(normalizedPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read image file: ${message}`);
  }

  if (imageData.byteLength === 0) {
    throw new Error("Image file is empty");
  }

  const imageBytes = Uint8Array.from(imageData);
  const fileName = path.basename(normalizedPath);

  const caption = getString(options.caption);
  const parseMode = normalizeTelegramParseMode(options.parseMode);
  const preparedCaption = caption ? prepareTelegramText(caption, parseMode) : null;
  if (preparedCaption) {
    enforceTelegramTextLength(preparedCaption.visibleText, TELEGRAM_CAPTION_MAX_CHARS, "caption");
  }

  const buildForm = (captionPrepared: PreparedTelegramText | null): FormData => {
    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("photo", new Blob([imageBytes], { type: imageMimeType }), fileName);
    if (captionPrepared) {
      form.set("caption", captionPrepared.text);
      if (captionPrepared.telegramParseMode) {
        form.set("parse_mode", captionPrepared.telegramParseMode);
      }
    }
    return form;
  };

  try {
    const response = await fetchWithTimeout(
      `https://api.telegram.org/bot${botToken}/sendPhoto`,
      {
        method: "POST",
        body: buildForm(preparedCaption)
      },
      30_000
    );
    await parseTelegramApiSuccess(response, "sendPhoto");
  } catch (err) {
    if (!preparedCaption || !shouldRetryTelegramAsPlain(parseMode, err)) {
      throw err;
    }

    const fallbackCaption: PreparedTelegramText = {
      text: preparedCaption.normalizedSource,
      visibleText: preparedCaption.normalizedSource,
      normalizedSource: preparedCaption.normalizedSource
    };
    enforceTelegramTextLength(fallbackCaption.visibleText, TELEGRAM_CAPTION_MAX_CHARS, "caption");
    const fallbackResponse = await fetchWithTimeout(
      `https://api.telegram.org/bot${botToken}/sendPhoto`,
      {
        method: "POST",
        body: buildForm(fallbackCaption)
      },
      30_000
    );
    await parseTelegramApiSuccess(fallbackResponse, "sendPhoto");
  }
}

function extractTelegramMessage(
  update: JsonObject
): { kind: TelegramInboxMessage["kind"]; message: JsonObject } | undefined {
  const keys: TelegramInboxMessage["kind"][] = [
    "message",
    "edited_message",
    "channel_post",
    "edited_channel_post"
  ];
  for (const key of keys) {
    const value = update[key];
    if (isJsonObject(value)) {
      return { kind: key, message: value };
    }
  }
  return undefined;
}

function extractFromDisplayName(message: JsonObject): string | undefined {
  const from = message.from;
  if (!isJsonObject(from)) {
    return undefined;
  }
  const username = getStringFromUnknown(from.username);
  if (username) {
    return username.startsWith("@") ? username : `@${username}`;
  }
  const first = getStringFromUnknown(from.first_name);
  const last = getStringFromUnknown(from.last_name);
  if (first && last) {
    return `${first} ${last}`;
  }
  return first ?? last;
}

function extractPreferredPhoto(
  message: JsonObject
): { fileId: string; width?: number; height?: number; fileSize?: number } | undefined {
  const raw = message.photo;
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }

  let best: { fileId: string; width?: number; height?: number; fileSize?: number } | undefined;
  let bestScore = -1;

  for (const item of raw) {
    if (!isJsonObject(item)) {
      continue;
    }
    const fileId = getStringFromUnknown(item.file_id);
    if (!fileId) {
      continue;
    }
    const width = getNumberFromUnknown(item.width);
    const height = getNumberFromUnknown(item.height);
    const fileSize = getNumberFromUnknown(item.file_size);
    const resolutionScore = (width ?? 0) * (height ?? 0);
    const score = (fileSize ?? 0) > 0 ? (fileSize ?? 0) : resolutionScore;
    if (score >= bestScore) {
      bestScore = score;
      best = {
        fileId,
        width,
        height,
        fileSize
      };
    }
  }

  return best;
}

export async function readTelegramUpdates(
  runtime: RuntimeConfig,
  options: TelegramReadOptions = {}
): Promise<TelegramReadResult> {
  const botToken = getTelegramBotToken(runtime);
  const chatId = getString(runtime.telegram.chatId);
  if (!botToken || !chatId) {
    throw new Error("Telegram config missing");
  }

  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 20)));
  const timeoutSeconds = Math.max(0, Math.min(50, Math.trunc(options.timeoutSeconds ?? 0)));

  const body: Record<string, unknown> = {
    limit,
    timeout: timeoutSeconds,
    allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post"]
  };
  if (typeof options.offset === "number" && Number.isInteger(options.offset)) {
    body.offset = options.offset;
  }

  const response = await fetchWithTimeout(
    `https://api.telegram.org/bot${botToken}/getUpdates`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    Math.max(15_000, (timeoutSeconds + 15) * 1_000)
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram getUpdates error (${response.status}): ${errorText}`);
  }

  const payloadRaw = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    throw new Error(`Telegram getUpdates returned non-JSON payload: ${payloadRaw}`);
  }

  if (!isJsonObject(payload)) {
    throw new Error(`Telegram getUpdates returned unexpected payload: ${payloadRaw}`);
  }

  if (payload.ok !== true) {
    throw new Error(`Telegram getUpdates failed: ${payloadRaw}`);
  }

  const result = payload.result;
  if (!Array.isArray(result)) {
    throw new Error(`Telegram getUpdates returned unexpected result: ${payloadRaw}`);
  }

  const messages: TelegramInboxMessage[] = [];
  let maxUpdateId: number | undefined;

  for (const item of result) {
    if (!isJsonObject(item)) {
      continue;
    }

    const updateId = getIntegerFromUnknown(item.update_id);
    if (updateId !== undefined) {
      maxUpdateId = maxUpdateId === undefined ? updateId : Math.max(maxUpdateId, updateId);
    }

    const extracted = extractTelegramMessage(item);
    if (!extracted) {
      continue;
    }

    const chat = extracted.message.chat;
    if (!isJsonObject(chat)) {
      continue;
    }

    const messageChatId = getStringFromUnknown(chat.id);
    if (!messageChatId || messageChatId !== chatId) {
      continue;
    }

    if (updateId === undefined) {
      continue;
    }

    const text = getStringFromUnknown(extracted.message.text) ?? getStringFromUnknown(extracted.message.caption);
    const messageId = getIntegerFromUnknown(extracted.message.message_id);
    const date = getIntegerFromUnknown(extracted.message.date);
    const from = extractFromDisplayName(extracted.message);

    messages.push({
      updateId,
      kind: extracted.kind,
      chatId: messageChatId,
      messageId,
      date,
      text,
      from
    });
  }

  return {
    fetched: result.length,
    matched: messages.length,
    nextOffset: maxUpdateId === undefined ? undefined : maxUpdateId + 1,
    messages
  };
}

export async function readTelegramImageUpdates(
  runtime: RuntimeConfig,
  options: TelegramReadOptions = {}
): Promise<TelegramImageReadResult> {
  const botToken = getTelegramBotToken(runtime);
  const chatId = getString(runtime.telegram.chatId);
  if (!botToken || !chatId) {
    throw new Error("Telegram config missing");
  }

  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 20)));
  const timeoutSeconds = Math.max(0, Math.min(50, Math.trunc(options.timeoutSeconds ?? 0)));

  const body: Record<string, unknown> = {
    limit,
    timeout: timeoutSeconds,
    allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post"]
  };
  if (typeof options.offset === "number" && Number.isInteger(options.offset)) {
    body.offset = options.offset;
  }

  const response = await fetchWithTimeout(
    `https://api.telegram.org/bot${botToken}/getUpdates`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    },
    Math.max(15_000, (timeoutSeconds + 15) * 1_000)
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram getUpdates error (${response.status}): ${errorText}`);
  }

  const payloadRaw = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    throw new Error(`Telegram getUpdates returned non-JSON payload: ${payloadRaw}`);
  }

  if (!isJsonObject(payload)) {
    throw new Error(`Telegram getUpdates returned unexpected payload: ${payloadRaw}`);
  }

  if (payload.ok !== true) {
    throw new Error(`Telegram getUpdates failed: ${payloadRaw}`);
  }

  const result = payload.result;
  if (!Array.isArray(result)) {
    throw new Error(`Telegram getUpdates returned unexpected result: ${payloadRaw}`);
  }

  const images: TelegramImageMessage[] = [];
  let maxUpdateId: number | undefined;

  for (const item of result) {
    if (!isJsonObject(item)) {
      continue;
    }

    const updateId = getIntegerFromUnknown(item.update_id);
    if (updateId !== undefined) {
      maxUpdateId = maxUpdateId === undefined ? updateId : Math.max(maxUpdateId, updateId);
    }

    const extracted = extractTelegramMessage(item);
    if (!extracted) {
      continue;
    }

    const chat = extracted.message.chat;
    if (!isJsonObject(chat)) {
      continue;
    }

    const messageChatId = getStringFromUnknown(chat.id);
    if (!messageChatId || messageChatId !== chatId) {
      continue;
    }

    if (updateId === undefined) {
      continue;
    }

    const photo = extractPreferredPhoto(extracted.message);
    if (!photo) {
      continue;
    }

    const messageId = getIntegerFromUnknown(extracted.message.message_id);
    const date = getIntegerFromUnknown(extracted.message.date);
    const from = extractFromDisplayName(extracted.message);
    const caption = getStringFromUnknown(extracted.message.caption);

    images.push({
      updateId,
      kind: extracted.kind,
      chatId: messageChatId,
      messageId,
      date,
      from,
      caption,
      fileId: photo.fileId,
      width: photo.width,
      height: photo.height,
      fileSize: photo.fileSize
    });
  }

  return {
    fetched: result.length,
    matched: images.length,
    nextOffset: maxUpdateId === undefined ? undefined : maxUpdateId + 1,
    images
  };
}

function inferImageMimeType(contentType: string | null): string {
  if (!contentType) {
    return "image/jpeg";
  }
  const normalized = contentType.toLowerCase();
  if (normalized.startsWith("image/")) {
    return normalized;
  }
  return "image/jpeg";
}

export async function downloadTelegramFileById(
  runtime: RuntimeConfig,
  fileId: string,
  maxBytes = 8_000_000
): Promise<TelegramDownloadedFile> {
  const botToken = getTelegramBotToken(runtime);
  if (!botToken) {
    throw new Error("Telegram config missing");
  }
  const normalizedFileId = getString(fileId);
  if (!normalizedFileId) {
    throw new Error("Telegram file_id is required");
  }

  const fileMetaResponse = await fetchWithTimeout(
    `https://api.telegram.org/bot${botToken}/getFile`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ file_id: normalizedFileId })
    },
    20_000
  );

  if (!fileMetaResponse.ok) {
    const errorText = await fileMetaResponse.text();
    throw new Error(`Telegram getFile error (${fileMetaResponse.status}): ${errorText}`);
  }

  const fileMetaRaw = await fileMetaResponse.text();
  let fileMetaPayload: unknown;
  try {
    fileMetaPayload = JSON.parse(fileMetaRaw);
  } catch {
    throw new Error(`Telegram getFile returned non-JSON payload: ${fileMetaRaw}`);
  }

  if (!isJsonObject(fileMetaPayload) || fileMetaPayload.ok !== true || !isJsonObject(fileMetaPayload.result)) {
    throw new Error(`Telegram getFile returned unexpected payload: ${fileMetaRaw}`);
  }

  const filePath = getStringFromUnknown(fileMetaPayload.result.file_path);
  const fileSizeHint = getNumberFromUnknown(fileMetaPayload.result.file_size);
  if (!filePath) {
    throw new Error("Telegram getFile response missing file_path");
  }
  if (fileSizeHint !== undefined && fileSizeHint > maxBytes) {
    throw new Error(`Telegram image is too large (${fileSizeHint} bytes, max ${maxBytes})`);
  }

  const fileResponse = await fetchWithTimeout(
    `https://api.telegram.org/file/bot${botToken}/${filePath}`,
    { method: "GET" },
    30_000
  );

  if (!fileResponse.ok) {
    const errorText = await fileResponse.text();
    throw new Error(`Telegram file download error (${fileResponse.status}): ${errorText}`);
  }

  const contentLength = fileResponse.headers.get("content-length");
  const headerBytes = contentLength ? Number(contentLength) : undefined;
  if (headerBytes !== undefined && Number.isFinite(headerBytes) && headerBytes > maxBytes) {
    throw new Error(`Telegram image is too large (${headerBytes} bytes, max ${maxBytes})`);
  }

  const data = Buffer.from(await fileResponse.arrayBuffer());
  if (data.byteLength > maxBytes) {
    throw new Error(`Telegram image is too large (${data.byteLength} bytes, max ${maxBytes})`);
  }

  return {
    mimeType: inferImageMimeType(fileResponse.headers.get("content-type")),
    dataBase64: data.toString("base64"),
    bytes: data.byteLength,
    filePath
  };
}
