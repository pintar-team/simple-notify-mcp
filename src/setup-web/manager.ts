import { startSetupWebServer } from "../setup-web.js";
import type { SetupWebController, SetupWebHandlers, SetupWebOptions, SetupWebState } from "./types.js";

type StartSetupWebServerFn = (
  options: SetupWebOptions,
  handlers: SetupWebHandlers
) => Promise<SetupWebController>;

export type SetupWebManagerOptions = SetupWebOptions & SetupWebHandlers & {
  enabled: boolean;
  autostart: boolean;
};

export type SetupWebManagerStatus = {
  enabled: boolean;
  autostart: boolean;
  running: boolean;
  url: string | null;
  host: string | null;
  port: number | null;
  error: string | null;
  hint: string;
};

export type SetupWebStartResult = {
  alreadyRunning: boolean;
  state: SetupWebState;
};

export type SetupWebStopResult = {
  wasRunning: boolean;
};

export type SetupWebManager = {
  getStatus: () => SetupWebManagerStatus;
  start: (context: string) => Promise<SetupWebStartResult>;
  stop: (context: string) => Promise<SetupWebStopResult>;
  shutdown: (context: string) => Promise<void>;
};

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildHint(status: Omit<SetupWebManagerStatus, "hint">): string {
  if (!status.enabled) {
    return "Start server with --enable-setup-web to allow agent-managed local configuration UI.";
  }
  if (status.running) {
    return "Open setupWeb.url in your local browser to configure.";
  }
  if (status.error) {
    return "Setup web is stopped after an error. Call simple_notify_setup_web_start to try again.";
  }
  return "Call simple_notify_setup_web_start to launch the local configuration UI.";
}

export function createSetupWebManager(
  options: SetupWebManagerOptions,
  startServer: StartSetupWebServerFn = startSetupWebServer
): SetupWebManager {
  let controller: SetupWebController | null = null;
  let lastError: string | null = null;
  let shuttingDown = false;
  let operationQueue: Promise<unknown> = Promise.resolve();

  const serverOptions: SetupWebOptions = {
    host: options.host,
    port: options.port,
    token: options.token,
    configPath: options.configPath
  };
  const handlers: SetupWebHandlers = {
    getRuntime: options.getRuntime,
    reloadRuntime: options.reloadRuntime,
    onRuntimeSaved: options.onRuntimeSaved
  };

  function getStatus(): SetupWebManagerStatus {
    const running = controller?.state.running ?? false;
    const status = {
      enabled: options.enabled,
      autostart: options.autostart,
      running,
      url: running ? controller?.state.url ?? null : null,
      host: running ? controller?.state.host ?? null : null,
      port: running ? controller?.state.port ?? null : null,
      error: lastError
    };
    return {
      ...status,
      hint: buildHint(status)
    };
  }

  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const next = operationQueue.then(action, action);
    operationQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  return {
    getStatus,
    start: async (context: string) => {
      if (!options.enabled) {
        throw new Error("Setup web is disabled. Start server with --enable-setup-web to allow agent-managed local configuration UI.");
      }
      return enqueue(async () => {
        if (shuttingDown) {
          throw new Error("Setup web is shutting down.");
        }
        if (controller?.state.running) {
          return {
            alreadyRunning: true,
            state: controller.state
          };
        }

        try {
          const nextController = await startServer(serverOptions, handlers);
          controller = nextController;
          lastError = null;
          console.error(`[simple-notify-mcp] setup web ready at ${nextController.state.url} (local only; ${context})`);
          return {
            alreadyRunning: false,
            state: nextController.state
          };
        } catch (err) {
          lastError = getErrorMessage(err);
          console.error(`[simple-notify-mcp] setup web start failed (${context}): ${lastError}`);
          throw err;
        }
      });
    },
    stop: async (context: string) => {
      if (!options.enabled) {
        return { wasRunning: false };
      }
      return enqueue(async () => {
        const activeController = controller;
        if (!activeController || !activeController.state.running) {
          controller = null;
          lastError = null;
          return { wasRunning: false };
        }

        try {
          await activeController.close();
          controller = null;
          lastError = null;
          console.error(`[simple-notify-mcp] setup web stopped (${context})`);
          return { wasRunning: true };
        } catch (err) {
          lastError = getErrorMessage(err);
          console.error(`[simple-notify-mcp] setup web stop failed (${context}): ${lastError}`);
          throw err;
        }
      });
    },
    shutdown: async (context: string) => {
      shuttingDown = true;
      await enqueue(async () => {
        const activeController = controller;
        controller = null;
        if (!activeController || !activeController.state.running) {
          return;
        }
        try {
          await activeController.close();
          lastError = null;
          console.error(`[simple-notify-mcp] setup web stopped (${context})`);
        } catch (err) {
          lastError = getErrorMessage(err);
          console.error(`[simple-notify-mcp] setup web close error (${context}): ${lastError}`);
        }
      });
    }
  };
}
