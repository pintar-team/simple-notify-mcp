import type { TelegramParseMode } from "./types.js";

export type PreparedTelegramText = {
  text: string;
  visibleText: string;
  telegramParseMode?: "HTML";
  normalizedSource: string;
};

export const TELEGRAM_TEXT_MAX_CHARS = 4096;
export const TELEGRAM_CAPTION_MAX_CHARS = 1024;

const TELEGRAM_ALLOWED_HTML_TAGS = new Set<string>([
  "a",
  "b",
  "blockquote",
  "code",
  "del",
  "em",
  "i",
  "ins",
  "pre",
  "s",
  "spoiler",
  "strike",
  "strong",
  "tg-spoiler",
  "u"
]);

function normalizeTelegramSourceText(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

function hasNonEmptyText(value: string): boolean {
  return value.trim().length > 0;
}

function escapeTelegramHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function escapeTelegramHtmlAttribute(value: string): string {
  return value
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeLimitedHtmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function stripTelegramHtmlTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

export function enforceTelegramTextLength(visibleText: string, maxChars: number, label: "message" | "caption"): void {
  const length = visibleText.length;
  if (length > maxChars) {
    throw new Error(`Telegram ${label} too long (${length} chars; max ${maxChars}).`);
  }
}

function buildUniqueToken(prefix: string, index: number, source: string): string {
  let token = `@@SNMCP${prefix}${index}@@`;
  let counter = 0;
  while (source.includes(token)) {
    counter += 1;
    token = `@@SNMCP${prefix}${index}_${counter}@@`;
  }
  return token;
}

function extractInlineCodeSpans(
  escapedInput: string
): { text: string; replacements: Map<string, string> } {
  const replacements = new Map<string, string>();
  let output = "";
  let index = 0;
  let tokenIndex = 0;

  while (index < escapedInput.length) {
    if (escapedInput[index] !== "`") {
      output += escapedInput[index];
      index += 1;
      continue;
    }

    let closeIndex = index + 1;
    while (closeIndex < escapedInput.length && escapedInput[closeIndex] !== "`" && escapedInput[closeIndex] !== "\n") {
      closeIndex += 1;
    }

    if (closeIndex >= escapedInput.length || escapedInput[closeIndex] !== "`") {
      output += escapedInput[index];
      index += 1;
      continue;
    }

    const inner = escapedInput.slice(index + 1, closeIndex);
    if (inner.length === 0) {
      output += "``";
      index = closeIndex + 1;
      continue;
    }

    const token = buildUniqueToken("CODE", tokenIndex, escapedInput);
    tokenIndex += 1;
    replacements.set(token, `<code>${inner}</code>`);
    output += token;
    index = closeIndex + 1;
  }

  return { text: output, replacements };
}

function replaceMarkdownLinks(
  escapedInput: string
): { text: string; replacements: Map<string, string> } {
  const replacements = new Map<string, string>();
  let output = "";
  let index = 0;
  let tokenIndex = 0;

  while (index < escapedInput.length) {
    if (escapedInput[index] !== "[") {
      output += escapedInput[index];
      index += 1;
      continue;
    }

    const closeBracket = escapedInput.indexOf("]", index + 1);
    if (closeBracket === -1) {
      output += escapedInput[index];
      index += 1;
      continue;
    }

    const label = escapedInput.slice(index + 1, closeBracket);
    const openParen = closeBracket + 1;
    if (label.length === 0 || label.includes("\n") || escapedInput[openParen] !== "(") {
      output += escapedInput[index];
      index += 1;
      continue;
    }

    const closeParen = escapedInput.indexOf(")", openParen + 1);
    if (closeParen === -1) {
      output += escapedInput[index];
      index += 1;
      continue;
    }

    const url = escapedInput.slice(openParen + 1, closeParen);
    if (url.length === 0 || /\s/.test(url) || !/^https?:\/\/[^\s<>"']+$/i.test(url)) {
      output += escapedInput[index];
      index += 1;
      continue;
    }

    const token = buildUniqueToken("LINK", tokenIndex, escapedInput);
    tokenIndex += 1;
    replacements.set(token, `<a href="${escapeTelegramHtmlAttribute(url)}">${label}</a>`);
    output += token;
    index = closeParen + 1;
  }

  return { text: output, replacements };
}

function restorePlaceholderTokens(value: string, replacements: Map<string, string>): string {
  let output = value;
  for (const [token, replacement] of replacements.entries()) {
    output = output.replaceAll(token, replacement);
  }
  return output;
}

function applyMarkdownSubsetFormatting(value: string): string {
  let output = value;
  output = output.replace(/\*\*([^*\n][^*\n]*?)\*\*/g, "<b>$1</b>");
  output = output.replace(/~~([^~\n][^~\n]*?)~~/g, "<s>$1</s>");
  output = output.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<i>$1</i>");
  output = output.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, "<i>$1</i>");

  output = output
    .split("\n")
    .map(line => {
      const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
      return headingMatch ? `<b>${headingMatch[1]}</b>` : line;
    })
    .join("\n");

  return output;
}

export function convertTelegramMarkdownToHtml(markdownText: string): string {
  const normalized = normalizeTelegramSourceText(markdownText);
  const escaped = escapeTelegramHtml(normalized);
  const withCode = extractInlineCodeSpans(escaped);
  const withLinks = replaceMarkdownLinks(withCode.text);
  const formatted = applyMarkdownSubsetFormatting(withLinks.text);
  const restoredLinks = restorePlaceholderTokens(formatted, withLinks.replacements);
  return restorePlaceholderTokens(restoredLinks, withCode.replacements);
}

export function validateTelegramHtmlInputForParseMode(htmlText: string): void {
  if (/<\s*\/?\s*(script|style|iframe|object|embed|form|input|button|img)\b/i.test(htmlText)) {
    throw new Error("Unsupported HTML tag for Telegram parse_mode=html.");
  }
  if (/\son[a-z]+\s*=/i.test(htmlText)) {
    throw new Error("Event handler attributes are not allowed for Telegram parse_mode=html.");
  }

  const tagPattern = /<\s*(\/?)\s*([a-zA-Z0-9-]+)([^>]*)>/g;
  for (const match of htmlText.matchAll(tagPattern)) {
    const closing = match[1] === "/";
    const tagName = match[2].toLowerCase();
    const attrs = match[3].trim();

    if (!TELEGRAM_ALLOWED_HTML_TAGS.has(tagName)) {
      throw new Error(`Unsupported HTML tag <${tagName}> for Telegram parse_mode=html.`);
    }

    if (closing) {
      if (attrs !== "") {
        throw new Error(`Closing tag </${tagName}> must not include attributes.`);
      }
      continue;
    }

    if (tagName === "a") {
      if (!/^href="https?:\/\/[^"\s<>]+"$/i.test(attrs)) {
        throw new Error("Only <a href=\"https://...\"> links are allowed for Telegram parse_mode=html.");
      }
      continue;
    }

    if (attrs !== "") {
      throw new Error(`Tag <${tagName}> does not allow attributes in parse_mode=html.`);
    }
  }
}

export function prepareTelegramText(text: string, parseMode: TelegramParseMode): PreparedTelegramText {
  const normalizedSource = normalizeTelegramSourceText(text);
  if (!hasNonEmptyText(normalizedSource)) {
    throw new Error("Telegram text is empty");
  }

  if (parseMode === "html") {
    validateTelegramHtmlInputForParseMode(normalizedSource);
    return {
      text: normalizedSource,
      visibleText: decodeLimitedHtmlEntities(stripTelegramHtmlTags(normalizedSource)),
      telegramParseMode: "HTML",
      normalizedSource
    };
  }

  if (parseMode === "markdown") {
    const converted = convertTelegramMarkdownToHtml(normalizedSource);
    return {
      text: converted,
      visibleText: decodeLimitedHtmlEntities(stripTelegramHtmlTags(converted)),
      telegramParseMode: "HTML",
      normalizedSource
    };
  }

  return {
    text: normalizedSource,
    visibleText: normalizedSource,
    normalizedSource
  };
}
