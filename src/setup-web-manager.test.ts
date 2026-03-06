import assert from "node:assert/strict";
import { test } from "node:test";

import { buildRuntimeConfig, type RuntimeConfig } from "./runtime.js";
import { createSetupWebManager } from "./setup-web/manager.js";
import type { SetupWebController, SetupWebOptions } from "./setup-web/types.js";

function makeRuntime(): RuntimeConfig {
  const runtime = buildRuntimeConfig({}, {});
  runtime.keys.openai = { apiKey: "sk-existing" };
  runtime.keys.fal = { apiKey: "fal_existing" };
  runtime.keys.telegram = { botToken: "123:ABC" };
  runtime.telegram.chatId = "328573687";
  return runtime;
}

function createFakeStartServer() {
  let startCount = 0;
  let closeCount = 0;

  const startServer = async (options: SetupWebOptions): Promise<SetupWebController> => {
    startCount += 1;
    const token = options.token ?? `generated-token-${startCount}`;
    const baseUrl = `http://${options.host}:${options.port}/`;
    const state = {
      running: true,
      host: options.host,
      port: options.port,
      token,
      baseUrl,
      url: `${baseUrl}?token=${encodeURIComponent(token)}`
    };

    return {
      state,
      close: async () => {
        closeCount += 1;
        state.running = false;
      }
    };
  };

  return {
    startServer,
    getCounts: () => ({
      startCount,
      closeCount
    })
  };
}

test("setup web manager starts and stops on demand", async () => {
  let runtime = makeRuntime();
  const fake = createFakeStartServer();
  const manager = createSetupWebManager(
    {
      enabled: true,
      autostart: false,
      host: "127.0.0.1",
      port: 21420,
      configPath: "/tmp/simple-notify-config.json",
      getRuntime: () => runtime,
      onRuntimeSaved: nextRuntime => {
        runtime = nextRuntime;
      }
    },
    fake.startServer
  );

  const initialStatus = manager.getStatus();
  assert.equal(initialStatus.enabled, true);
  assert.equal(initialStatus.autostart, false);
  assert.equal(initialStatus.running, false);
  assert.equal(initialStatus.url, null);
  assert.match(initialStatus.hint, /simple_notify_setup_web_start/);

  const firstStart = await manager.start("test_start");
  assert.equal(firstStart.alreadyRunning, false);
  assert.equal(fake.getCounts().startCount, 1);

  const runningStatus = manager.getStatus();
  assert.equal(runningStatus.running, true);
  assert.equal(runningStatus.url, firstStart.state.url);

  const secondStart = await manager.start("test_start_again");
  assert.equal(secondStart.alreadyRunning, true);
  assert.equal(fake.getCounts().startCount, 1);

  const firstStop = await manager.stop("test_stop");
  assert.equal(firstStop.wasRunning, true);
  assert.equal(fake.getCounts().closeCount, 1);

  const stoppedStatus = manager.getStatus();
  assert.equal(stoppedStatus.running, false);
  assert.equal(stoppedStatus.url, null);
  assert.match(stoppedStatus.hint, /simple_notify_setup_web_start/);

  const secondStop = await manager.stop("test_stop_again");
  assert.equal(secondStop.wasRunning, false);
  assert.equal(fake.getCounts().closeCount, 1);
});

test("setup web manager shutdown closes active server and blocks future starts", async () => {
  let runtime = makeRuntime();
  const fake = createFakeStartServer();
  const manager = createSetupWebManager(
    {
      enabled: true,
      autostart: true,
      host: "127.0.0.1",
      port: 21420,
      configPath: "/tmp/simple-notify-config.json",
      getRuntime: () => runtime,
      onRuntimeSaved: nextRuntime => {
        runtime = nextRuntime;
      }
    },
    fake.startServer
  );

  await manager.start("test_start");
  await manager.shutdown("test_shutdown");

  const statusAfterShutdown = manager.getStatus();
  assert.equal(statusAfterShutdown.running, false);
  assert.equal(fake.getCounts().closeCount, 1);
  await assert.rejects(manager.start("after_shutdown"), /shutting down/i);
});

test("setup web manager reports disabled mode and rejects manual start", async () => {
  const manager = createSetupWebManager({
    enabled: false,
    autostart: false,
    host: "127.0.0.1",
    port: 21420,
    configPath: "/tmp/simple-notify-config.json",
    getRuntime: () => makeRuntime(),
    onRuntimeSaved: () => {}
  });

  const status = manager.getStatus();
  assert.equal(status.enabled, false);
  assert.equal(status.running, false);
  assert.match(status.hint, /--enable-setup-web/);
  await assert.rejects(manager.start("disabled_start"), /disabled/i);

  const stopResult = await manager.stop("disabled_stop");
  assert.equal(stopResult.wasRunning, false);
});
