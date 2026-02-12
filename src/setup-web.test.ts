import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { buildRuntimeConfig, type RuntimeConfig } from "./runtime.js";
import { mergeRuntimeConfig } from "./setup-web/config-merge.js";
import { buildSetupPage } from "./setup-web/page.js";
import { parseRequestedTests } from "./setup-web/tests.js";
import { startSetupWebServer } from "./setup-web.js";

function makeRuntime(): RuntimeConfig {
  const runtime = buildRuntimeConfig({}, {});
  runtime.keys.openai = { apiKey: "sk-existing" };
  runtime.keys.fal = { apiKey: "fal_existing" };
  runtime.keys.telegram = { botToken: "123:ABC" };
  runtime.telegram.chatId = "328573687";
  return runtime;
}

test("mergeRuntimeConfig keeps secrets unless clear flags are enabled", () => {
  const current = makeRuntime();

  const kept = mergeRuntimeConfig(current, {
    provider: "fal-elevenlabs",
    openaiApiKey: "",
    falApiKey: "",
    telegramBotToken: ""
  });

  assert.equal(kept.tts.provider, "fal-elevenlabs");
  assert.equal(kept.keys.openai?.apiKey, "sk-existing");
  assert.equal(kept.keys.fal?.apiKey, "fal_existing");
  assert.equal(kept.keys.telegram?.botToken, "123:ABC");

  const cleared = mergeRuntimeConfig(current, {
    clearOpenaiApiKey: "true",
    clearFalApiKey: "true",
    clearTelegramBotToken: "true"
  });

  assert.equal(cleared.keys.openai?.apiKey, undefined);
  assert.equal(cleared.keys.fal?.apiKey, undefined);
  assert.equal(cleared.keys.telegram?.botToken, undefined);
});

test("mergeRuntimeConfig ignores invalid fal minimax enum-like values", () => {
  const current = makeRuntime();

  const merged = mergeRuntimeConfig(current, {
    falMinimaxAudioFormat: "wav",
    falMinimaxAudioSampleRate: "12345",
    falMinimaxAudioChannel: "3",
    falMinimaxAudioBitrate: "64001"
  });

  assert.equal(merged.tts.params.falMinimax.audioFormat, current.tts.params.falMinimax.audioFormat);
  assert.equal(merged.tts.params.falMinimax.audioSampleRate, current.tts.params.falMinimax.audioSampleRate);
  assert.equal(merged.tts.params.falMinimax.audioChannel, current.tts.params.falMinimax.audioChannel);
  assert.equal(merged.tts.params.falMinimax.audioBitrate, current.tts.params.falMinimax.audioBitrate);
});

test("parseRequestedTests normalizes and deduplicates values", () => {
  const parsed = parseRequestedTests(" tts, TELEGRAM, tts, invalid ");
  assert.deepEqual(parsed, ["tts", "telegram"]);
});

test("buildSetupPage escapes injected user-controlled values", () => {
  const runtime = makeRuntime();
  runtime.tts.params.openai.instructions = "<script>alert('x')</script>";

  const html = buildSetupPage("/tmp/config.json", "setup-token", runtime);
  assert.ok(html.includes("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;"));
  assert.ok(!html.includes("<script>alert('x')</script>"));
});

test("setup web server enforces token auth and accepts config updates from json and form", async t => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "simple-notify-setup-web-"));
  const configPath = path.join(tmpDir, "config.json");
  const token = "test-token";
  let runtime = makeRuntime();

  const setupWeb = await startSetupWebServer(
    {
      host: "127.0.0.1",
      port: 25000 + Math.floor(Math.random() * 1000),
      token,
      configPath
    },
    {
      getRuntime: () => runtime,
      onRuntimeSaved: next => {
        runtime = next;
      }
    }
  );

  t.after(async () => {
    await setupWeb.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  const baseUrl = setupWeb.state.baseUrl;

  const unauthorizedPage = await fetch(baseUrl);
  assert.equal(unauthorizedPage.status, 401);

  const authorizedPage = await fetch(`${baseUrl}?token=${token}`);
  assert.equal(authorizedPage.status, 200);
  const authorizedHtml = await authorizedPage.text();
  assert.match(authorizedHtml, /simple-notify-mcp setup/i);

  const unauthorizedStatus = await fetch(`${baseUrl}api/status`);
  assert.equal(unauthorizedStatus.status, 401);

  const statusResp = await fetch(`${baseUrl}api/status`, {
    headers: {
      "X-Setup-Token": token
    }
  });
  assert.equal(statusResp.status, 200);
  const statusJson = await statusResp.json();
  assert.equal(statusJson.ok, true);
  assert.equal(statusJson.configPath, configPath);

  const invalidJsonSave = await fetch(`${baseUrl}api/config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Setup-Token": token
    },
    body: "{\"provider\":"
  });
  assert.equal(invalidJsonSave.status, 400);
  const invalidJsonBody = await invalidJsonSave.json();
  assert.equal(invalidJsonBody.ok, false);
  assert.equal(invalidJsonBody.error, "Invalid JSON body");

  const jsonSave = await fetch(`${baseUrl}api/config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Setup-Token": token
    },
    body: JSON.stringify({
      provider: "fal-elevenlabs",
      openaiApiKey: "",
      clearOpenaiApiKey: "false"
    })
  });
  assert.equal(jsonSave.status, 200);
  const jsonBody = await jsonSave.json();
  assert.equal(jsonBody.ok, true);
  assert.equal(runtime.tts.provider, "fal-elevenlabs");
  assert.equal(runtime.keys.openai?.apiKey, "sk-existing");

  const form = new URLSearchParams();
  form.set("provider", "openai");
  form.set("clearOpenaiApiKey", "true");
  const formSave = await fetch(`${baseUrl}api/config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Setup-Token": token
    },
    body: form
  });

  assert.equal(formSave.status, 200);
  const formBody = await formSave.json();
  assert.equal(formBody.ok, true);
  assert.equal(runtime.tts.provider, "openai");
  assert.equal(runtime.keys.openai?.apiKey, undefined);

  const savedConfigRaw = await readFile(configPath, "utf8");
  const savedConfig = JSON.parse(savedConfigRaw) as {
    tts?: { provider?: string };
    keys?: { openai?: { apiKey?: string } };
  };
  assert.equal(savedConfig.tts?.provider, "openai");
  assert.equal(savedConfig.keys?.openai?.apiKey, undefined);
});
