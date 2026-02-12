#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import process from "node:process";
import {
  downloadTelegramFileById,
  getTelegramBotToken,
  getMissingConfigFields,
  getString,
  isEnabledFlag,
  isTelegramConfigured,
  isTtsAvailable,
  loadRuntime,
  readTelegramImageUpdates,
  readTelegramUpdates,
  sendTelegram,
  speakText,
  type RuntimeConfig,
  type TtsProvider
} from "./runtime.js";
import { startSetupWebServer, type SetupWebController } from "./setup-web.js";

const VERSION = "0.1.7";
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

type CapabilityState = {
  hasTts: boolean;
  hasTelegram: boolean;
  missingConfig: string[];
};

type ToolStateCache = {
  enabled?: boolean;
  description?: string;
};

const argv = process.argv.slice(2);
const loaded = await loadRuntime(argv);
let runtime: RuntimeConfig = loaded.runtime;
const { args, configPath } = loaded;

const setupWebEnabled = isEnabledFlag(args["enable-setup-web"]);
const setupHost = getString(args["setup-host"]) ?? "127.0.0.1";
const setupPortRaw = Number(getString(args["setup-port"]) ?? "21420");
const setupPort = Number.isInteger(setupPortRaw) && setupPortRaw > 0 && setupPortRaw <= 65535
  ? setupPortRaw
  : 21420;
const setupToken = getString(args["setup-token"]);

let setupWeb: SetupWebController | null = null;
let setupWebError: string | null = null;
let nextTtsJobId = 1;
let telegramUpdateOffset: number | undefined;
let telegramMediaUpdateOffset: number | undefined;
const ttsJobs = new Map<number, Promise<void>>();

function startBackgroundTtsJob(text: string): number {
  const jobId = nextTtsJobId;
  nextTtsJobId += 1;

  const job = (async () => {
    try {
      await speakText(text, runtime);
      console.error(`[simple-notify-mcp] tts job ${jobId} completed`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[simple-notify-mcp] tts job ${jobId} failed: ${message}`);
    } finally {
      ttsJobs.delete(jobId);
    }
  })();

  ttsJobs.set(jobId, job);
  return jobId;
}

function computeCapabilities(): CapabilityState {
  return {
    hasTts: isTtsAvailable(runtime),
    hasTelegram: isTelegramConfigured(runtime),
    missingConfig: getMissingConfigFields(runtime)
  };
}

async function reloadRuntimeFromDisk(context: string): Promise<void> {
  try {
    const latest = await loadRuntime(argv);
    const previousChatId = getString(runtime.telegram.chatId) ?? null;
    const previousBotToken = getTelegramBotToken(runtime) ?? null;
    const nextRuntime = latest.runtime;
    const nextChatId = getString(nextRuntime.telegram.chatId) ?? null;
    const nextBotToken = getTelegramBotToken(nextRuntime) ?? null;
    if (previousChatId !== nextChatId || previousBotToken !== nextBotToken) {
      telegramUpdateOffset = undefined;
      telegramMediaUpdateOffset = undefined;
    }
    runtime = nextRuntime;
    refreshToolAvailability();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[simple-notify-mcp] runtime reload failed (${context}): ${message}`);
  }
}

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

const emptySchema = z.object({});
const ttsSchema = z.object({
  text: z.string().min(1)
});
const telegramSchema = z.object({
  text: z.string().min(1)
});
const telegramReadSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  timeoutSeconds: z.number().int().min(0).max(50).optional(),
  advanceCursor: z.boolean().optional()
});
const telegramReadMediaSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  timeoutSeconds: z.number().int().min(0).max(50).optional(),
  advanceCursor: z.boolean().optional(),
  includeData: z.boolean().optional(),
  maxImages: z.number().int().min(1).max(5).optional(),
  maxBytesPerImage: z.number().int().min(64_000).max(20_000_000).optional()
});

function providerPromptHint(provider: TtsProvider): string {
  if (provider === "fal-minimax") {
    return "MiniMax supports pause tokens like <#x#>(x = 0.01-99.99 seconds) and interjections like (laughs), (sighs), (coughs), (clears throat), (gasps), (sniffs), (groans), (yawns).";
  }
  if (provider === "fal-elevenlabs") {
    return "ElevenLabs interjections like (laughs), (sighs), (coughs), (clears throat), (gasps), (sniffs), (groans), (yawns), (giggles).";
  }
  return "";
}

function ttsToolDescription(provider: TtsProvider): string {
  const hint = providerPromptHint(provider);
  const hintPart = hint ? ` ${hint}` : "";
  return `Speak a short message using configured provider; async by default and playback is queued (no overlap).${hintPart} Falls back to system TTS when needed.`;
}

function telegramNotifyDescription(chatId: string | undefined): string {
  if (chatId) {
    return `Send a short notification message to Telegram chat ${chatId}. Response includes hasUnreadIncoming=true when unread messages exist (non-advancing unread peek).`;
  }
  return "Send a short notification message to Telegram. Response includes hasUnreadIncoming=true when unread messages exist (non-advancing unread peek).";
}

function telegramReadDescription(chatId: string | undefined): string {
  if (chatId) {
    return `Read incoming Telegram updates for configured chat ${chatId}. Advances in-memory cursor by default; set advanceCursor=false to peek.`;
  }
  return "Read incoming Telegram updates for configured chat. Advances in-memory cursor by default; set advanceCursor=false to peek.";
}

function telegramReadMediaDescription(chatId: string | undefined): string {
  if (chatId) {
    return `Read image updates for configured chat ${chatId}; can return MCP image content. Advances in-memory media cursor by default.`;
  }
  return "Read image updates for configured chat; can return MCP image content. Advances in-memory media cursor by default.";
}

function statusPayload(): Record<string, unknown> {
  const capability = computeCapabilities();
  return {
    ok: true,
    version: VERSION,
    configPath,
    ttsProvider: runtime.tts.provider,
    ttsAsyncByDefault: runtime.misc.ttsAsyncByDefault,
    ttsJobsInFlight: ttsJobs.size,
    telegramCursor: telegramUpdateOffset ?? null,
    telegramMediaCursor: telegramMediaUpdateOffset ?? null,
    ttsPromptHint: providerPromptHint(runtime.tts.provider),
    ttsAvailable: capability.hasTts,
    telegramAvailable: capability.hasTelegram,
    missingConfig: capability.missingConfig,
    setupWeb: {
      enabled: setupWebEnabled,
      running: Boolean(setupWeb),
      url: setupWeb?.state.url ?? null,
      host: setupWeb?.state.host ?? null,
      port: setupWeb?.state.port ?? null,
      error: setupWebError,
      hint: setupWebEnabled
        ? (setupWeb
          ? "Open setupWeb.url in your local browser to configure."
          : "Setup web is enabled but not running (startup failed).")
        : "Start server with --enable-setup-web to enable local configuration UI."
    }
  };
}

const _statusTool = server.registerTool(
  "simple_notify_status",
  {
    title: "Simple Notify status",
    description: "Read runtime status: setup URL, missing config, active provider, async mode, and Telegram cursor state.",
    inputSchema: emptySchema
  },
  async () => {
    await reloadRuntimeFromDisk("simple_notify_status");
    return okResponse(statusPayload());
  }
);

const ttsTool = server.registerTool(
  "tts_say",
  {
    title: "Speak text",
    description: ttsToolDescription(runtime.tts.provider),
    inputSchema: ttsSchema
  },
  async (params: z.infer<typeof ttsSchema>) => {
    try {
      await reloadRuntimeFromDisk("tts_say");
      if (runtime.misc.ttsAsyncByDefault) {
        const jobId = startBackgroundTtsJob(params.text);
        return okResponse({
          accepted: true,
          mode: "async",
          jobId
        });
      }

      await speakText(params.text, runtime);
      return okResponse({
        accepted: true,
        mode: "sync"
      });
    } catch (err) {
      return errorResponse(err);
    }
  }
);

const telegramTool = server.registerTool(
  "telegram_notify",
  {
    title: "Send Telegram notification",
    description: telegramNotifyDescription(getString(runtime.telegram.chatId)),
    inputSchema: telegramSchema
  },
  async (params: z.infer<typeof telegramSchema>) => {
    try {
      await reloadRuntimeFromDisk("telegram_notify");
      await sendTelegram(params.text, runtime);

      const unreadPeekLimit = 6;
      let hasUnreadIncoming = false;

      try {
        const unread = await readTelegramUpdates(runtime, {
          offset: telegramUpdateOffset,
          limit: unreadPeekLimit,
          timeoutSeconds: 0
        });
        hasUnreadIncoming = unread.matched > 0;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[simple-notify-mcp] telegram unread peek failed: ${message}`);
      }

      if (hasUnreadIncoming) {
        return okResponse({
          accepted: true,
          hasUnreadIncoming: true
        });
      }

      return okResponse({ accepted: true });
    } catch (err) {
      return errorResponse(err);
    }
  }
);

const telegramReadTool = server.registerTool(
  "telegram_read_incoming",
  {
    title: "Read Telegram incoming messages",
    description: telegramReadDescription(getString(runtime.telegram.chatId)),
    inputSchema: telegramReadSchema
  },
  async (params: z.infer<typeof telegramReadSchema>) => {
    try {
      await reloadRuntimeFromDisk("telegram_read_incoming");

      const advanceCursor = params.advanceCursor ?? true;
      const result = await readTelegramUpdates(runtime, {
        offset: telegramUpdateOffset,
        limit: params.limit,
        timeoutSeconds: params.timeoutSeconds
      });

      if (advanceCursor && result.nextOffset !== undefined) {
        telegramUpdateOffset = result.nextOffset;
      }

      return okResponse({
        ok: true,
        advanceCursor,
        cursor: telegramUpdateOffset ?? null,
        ...result
      });
    } catch (err) {
      return errorResponse(err);
    }
  }
);

const telegramReadMediaTool = server.registerTool(
  "telegram_read_media",
  {
    title: "Read Telegram image media",
    description: telegramReadMediaDescription(getString(runtime.telegram.chatId)),
    inputSchema: telegramReadMediaSchema
  },
  async (params: z.infer<typeof telegramReadMediaSchema>) => {
    try {
      await reloadRuntimeFromDisk("telegram_read_media");

      const advanceCursor = params.advanceCursor ?? true;
      const includeData = params.includeData ?? true;
      const maxImages = params.maxImages ?? 1;
      const maxBytesPerImage = params.maxBytesPerImage ?? 8_000_000;

      const result = await readTelegramImageUpdates(runtime, {
        offset: telegramMediaUpdateOffset,
        limit: params.limit,
        timeoutSeconds: params.timeoutSeconds
      });

      const selectedImages = result.images.slice(0, maxImages);
      if (advanceCursor) {
        if (selectedImages.length > 0 && selectedImages.length < result.images.length) {
          // Preserve remaining image updates for next call when caller limits maxImages.
          telegramMediaUpdateOffset = selectedImages[selectedImages.length - 1].updateId + 1;
        } else if (result.nextOffset !== undefined) {
          telegramMediaUpdateOffset = result.nextOffset;
        }
      }
      const downloads: Array<{
        updateId: number;
        fileId: string;
        bytes?: number;
        mimeType?: string;
        filePath?: string;
        error?: string;
      }> = [];

      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];

      const summaryBase = {
        ok: true,
        advanceCursor,
        includeData,
        cursor: telegramMediaUpdateOffset ?? null,
        fetched: result.fetched,
        matched: result.matched,
        returned: selectedImages.length,
        images: selectedImages
      };

      if (!includeData || selectedImages.length === 0) {
        return okResponse({
          ...summaryBase,
          downloads
        });
      }

      for (const image of selectedImages) {
        try {
          const downloaded = await downloadTelegramFileById(runtime, image.fileId, maxBytesPerImage);
          downloads.push({
            updateId: image.updateId,
            fileId: image.fileId,
            bytes: downloaded.bytes,
            mimeType: downloaded.mimeType,
            filePath: downloaded.filePath
          });
          content.push({
            type: "image",
            data: downloaded.dataBase64,
            mimeType: downloaded.mimeType
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          downloads.push({
            updateId: image.updateId,
            fileId: image.fileId,
            error: message
          });
        }
      }

      content.unshift({
        type: "text",
        text: JSON.stringify({
          ...summaryBase,
          downloads
        })
      });

      return { content };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

const toolStateCache = {
  tts: {} as ToolStateCache,
  telegram: {} as ToolStateCache,
  telegramRead: {} as ToolStateCache,
  telegramReadMedia: {} as ToolStateCache
};

function updateToolIfChanged(
  tool: { update: (updates: { enabled?: boolean; description?: string }) => void },
  cache: ToolStateCache,
  next: { enabled: boolean; description: string }
): void {
  if (cache.enabled === next.enabled && cache.description === next.description) {
    return;
  }
  cache.enabled = next.enabled;
  cache.description = next.description;
  tool.update(next);
}

function refreshToolAvailability(): void {
  const capability = computeCapabilities();
  updateToolIfChanged(ttsTool, toolStateCache.tts, {
    enabled: capability.hasTts,
    description: ttsToolDescription(runtime.tts.provider)
  });
  updateToolIfChanged(telegramTool, toolStateCache.telegram, {
    enabled: capability.hasTelegram,
    description: telegramNotifyDescription(getString(runtime.telegram.chatId))
  });
  updateToolIfChanged(telegramReadTool, toolStateCache.telegramRead, {
    enabled: capability.hasTelegram,
    description: telegramReadDescription(getString(runtime.telegram.chatId))
  });
  updateToolIfChanged(telegramReadMediaTool, toolStateCache.telegramReadMedia, {
    enabled: capability.hasTelegram,
    description: telegramReadMediaDescription(getString(runtime.telegram.chatId))
  });
}

refreshToolAvailability();

if (setupWebEnabled) {
  try {
    setupWeb = await startSetupWebServer(
      {
        host: setupHost,
        port: setupPort,
        token: setupToken,
        configPath
      },
      {
        getRuntime: () => runtime,
        reloadRuntime: async () => {
          await reloadRuntimeFromDisk("setup_web");
        },
        onRuntimeSaved: async nextRuntime => {
          runtime = nextRuntime;
          refreshToolAvailability();
        }
      }
    );
    console.error(`[simple-notify-mcp] setup web ready at ${setupWeb.state.url} (local only)`);
  } catch (err) {
    setupWebError = err instanceof Error ? err.message : String(err);
    console.error(`[simple-notify-mcp] setup web failed: ${setupWebError}`);
  }
}

const transport = new StdioServerTransport();
const parentPidAtLaunch = process.ppid;
let shutdownStarted = false;
let parentWatchdogTimer: NodeJS.Timeout | null = null;

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 1) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

const onStdinClosed = (): void => {
  void shutdown("stdin_closed");
};

function startParentWatchdog(): void {
  if (parentPidAtLaunch <= 1) {
    return;
  }
  parentWatchdogTimer = setInterval(() => {
    const parentPidNow = process.ppid;
    if (parentPidNow !== parentPidAtLaunch || !isProcessAlive(parentPidAtLaunch)) {
      void shutdown("parent_exited");
    }
  }, 4_000);
  parentWatchdogTimer.unref();
}

const shutdown = async (reason: string): Promise<void> => {
  if (shutdownStarted) {
    return;
  }
  shutdownStarted = true;
  console.error(`[simple-notify-mcp] shutting down (${reason})`);
  process.stdin.off("end", onStdinClosed);
  process.stdin.off("close", onStdinClosed);
  if (parentWatchdogTimer) {
    clearInterval(parentWatchdogTimer);
    parentWatchdogTimer = null;
  }
  try {
    await server.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[simple-notify-mcp] server close error: ${message}`);
  }
  if (setupWeb) {
    try {
      await setupWeb.close();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[simple-notify-mcp] setup web close error: ${message}`);
    }
  }
  process.exit(0);
};

transport.onclose = () => {
  void shutdown("transport_closed");
};

process.stdin.on("end", onStdinClosed);
process.stdin.on("close", onStdinClosed);
startParentWatchdog();

await server.connect(transport);

const enabled = [
  computeCapabilities().hasTts ? "tts_say" : null,
  computeCapabilities().hasTelegram ? "telegram_notify" : null,
  computeCapabilities().hasTelegram ? "telegram_read_incoming" : null,
  computeCapabilities().hasTelegram ? "telegram_read_media" : null,
  "simple_notify_status"
].filter(Boolean).join(", ");

console.error(`[simple-notify-mcp] ready; tools: ${enabled}`);

process.once("SIGINT", () => {
  void shutdown("sigint");
});

process.once("SIGTERM", () => {
  void shutdown("sigterm");
});
