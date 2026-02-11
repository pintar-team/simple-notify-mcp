#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import process from "node:process";
import {
  getMissingConfigFields,
  getString,
  isEnabledFlag,
  isTelegramConfigured,
  isTtsAvailable,
  loadRuntime,
  sendTelegram,
  speakText,
  type RuntimeConfig
} from "./runtime.js";
import { startSetupWebServer, type SetupWebController } from "./setup-web.js";

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

type CapabilityState = {
  hasTts: boolean;
  hasTelegram: boolean;
  missingConfig: string[];
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

function statusPayload(): Record<string, unknown> {
  const capability = computeCapabilities();
  return {
    ok: true,
    version: VERSION,
    configPath,
    ttsProvider: runtime.tts.provider,
    ttsAsyncByDefault: runtime.misc.ttsAsyncByDefault,
    ttsJobsInFlight: ttsJobs.size,
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
          : "Setup web is enabled but not running (config may already be complete or startup failed).")
        : "Start server with --enable-setup-web to enable local configuration UI."
    }
  };
}

const statusTool = server.registerTool(
  "simple_notify_status",
  {
    title: "Simple Notify status",
    description: "Read current capabilities and optional setup-web URL for configuration guidance.",
    inputSchema: emptySchema
  },
  async () => okResponse(statusPayload())
);

const ttsTool = server.registerTool(
  "tts_say",
  {
    title: "Speak text",
    description: "Speak a short message. Async by default from misc config; falls back to system TTS when needed.",
    inputSchema: ttsSchema
  },
  async (params: z.infer<typeof ttsSchema>) => {
    try {
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
    description: "Send a short notification message to Telegram.",
    inputSchema: telegramSchema
  },
  async (params: z.infer<typeof telegramSchema>) => {
    try {
      await sendTelegram(params.text, runtime);
      return okResponse({ accepted: true });
    } catch (err) {
      return errorResponse(err);
    }
  }
);

function refreshToolAvailability(): void {
  const capability = computeCapabilities();
  ttsTool.update({ enabled: capability.hasTts });
  telegramTool.update({ enabled: capability.hasTelegram });
  statusTool.update({ enabled: true });
}

refreshToolAvailability();

if (setupWebEnabled) {
  const initialMissing = computeCapabilities().missingConfig;
  if (initialMissing.length > 0) {
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
  } else {
    console.error("[simple-notify-mcp] setup web enabled but not started (config already complete)");
  }
}

const transport = new StdioServerTransport();
await server.connect(transport);

const enabled = [
  computeCapabilities().hasTts ? "tts_say" : null,
  computeCapabilities().hasTelegram ? "telegram_notify" : null,
  "simple_notify_status"
].filter(Boolean).join(", ");

console.error(`[simple-notify-mcp] ready; tools: ${enabled}`);

const shutdown = async (): Promise<void> => {
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

process.once("SIGINT", () => {
  void shutdown();
});

process.once("SIGTERM", () => {
  void shutdown();
});
