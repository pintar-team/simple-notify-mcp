#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import process from "node:process";
import {
  hasSystemTtsSupport,
  loadRuntime,
  sendTelegram,
  speakText
} from "./runtime.js";

const VERSION = "0.1.0";
const SERVER_NAME = "simple_notify";
const SERVER_TITLE = "Simple Notify MCP";

function okResponse(payload: Record<string, unknown>) {
  const content: { type: "text"; text: string }[] = [
    { type: "text", text: JSON.stringify(payload) }
  ];
  return {
    content
  };
}

function errorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const content: { type: "text"; text: string }[] = [
    { type: "text", text: message }
  ];
  return {
    content,
    isError: true
  };
}

const argv = process.argv.slice(2);
const { runtime } = await loadRuntime(argv);

const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
const hasSystemTts = hasSystemTtsSupport();
const hasTts = hasOpenAI || hasSystemTts;
const hasTelegram = Boolean(runtime.telegram.botToken && runtime.telegram.chatId);

const server = new McpServer(
  {
    name: SERVER_NAME,
    title: SERVER_TITLE,
    version: VERSION
  },
  {
    capabilities: { tools: {} }
  }
);

const ttsSchema = z.object({
  text: z.string().min(1)
});

const telegramSchema = z.object({
  text: z.string().min(1)
});

if (hasTts) {
  server.registerTool(
    "tts_say",
    {
      title: "Speak text via OpenAI TTS",
      description: "Speak a short message. Uses OpenAI TTS when available, else system TTS.",
      inputSchema: ttsSchema
    },
    async (params: z.infer<typeof ttsSchema>) => {
      try {
        await speakText(params.text, runtime.tts);
        return okResponse({ accepted: true });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );
} else {
  console.error("[simple-notify-mcp] TTS unavailable; tts_say not registered");
}

if (hasTelegram) {
  server.registerTool(
    "telegram_notify",
    {
      title: "Send Telegram notification",
      description: "Send a short notification message to Telegram.",
      inputSchema: telegramSchema
    },
    async (params: z.infer<typeof telegramSchema>) => {
      try {
        await sendTelegram(params.text, runtime.telegram);
        return okResponse({ accepted: true });
      } catch (err) {
        return errorResponse(err);
      }
    }
  );
} else {
  console.error("[simple-notify-mcp] Telegram config missing; telegram_notify not registered");
}

const transport = new StdioServerTransport();
await server.connect(transport);

const enabled = [
  hasTts ? "tts_say" : null,
  hasTelegram ? "telegram_notify" : null
].filter(Boolean).join(", ") || "none";

console.error(`[simple-notify-mcp] ready; tools: ${enabled}`);
