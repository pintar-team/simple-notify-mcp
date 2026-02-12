import { sendTelegram, testTtsProvider, type RuntimeConfig } from "../runtime.js";
import type { SetupTestName, SetupTestPayload } from "./types.js";

export function parseRequestedTests(value: string | undefined): SetupTestName[] {
  if (!value) {
    return [];
  }
  const out = new Set<SetupTestName>();
  for (const raw of value.split(",")) {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "tts" || normalized === "telegram") {
      out.add(normalized);
    }
  }
  return Array.from(out);
}

export async function runSetupTests(runtime: RuntimeConfig, tests: SetupTestName[], testText: string): Promise<SetupTestPayload> {
  const result: SetupTestPayload = {};
  for (const testName of tests) {
    if (testName === "tts") {
      try {
        await testTtsProvider(testText, runtime);
        result.tts = { ok: true, message: "TTS test succeeded." };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.tts = { ok: false, message };
      }
      continue;
    }

    try {
      await sendTelegram(testText, runtime);
      result.telegram = { ok: true, message: "Telegram test sent." };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.telegram = { ok: false, message };
    }
  }
  return result;
}
