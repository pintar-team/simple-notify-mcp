import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { getMissingConfigFields, getString, saveRuntimeConfig } from "./runtime.js";
import { mergeRuntimeConfig } from "./setup-web/config-merge.js";
import {
  getHeaderSetupToken,
  getQuerySetupToken,
  isValidSetupToken,
  parseBodyByContentType,
  readRequestBody,
  SetupWebRequestError,
  writeNoStoreHeaders
} from "./setup-web/http.js";
import { listenOnFirstAvailablePort, normalizeHost, parsePort } from "./setup-web/net.js";
import { buildSetupPage } from "./setup-web/page.js";
import { buildKeyStatusPayload } from "./setup-web/status.js";
import { parseRequestedTests, runSetupTests } from "./setup-web/tests.js";
import type { SetupWebController, SetupWebHandlers, SetupWebOptions, SetupWebState } from "./setup-web/types.js";

export type { SetupWebController, SetupWebOptions, SetupWebState } from "./setup-web/types.js";

export async function startSetupWebServer(
  options: SetupWebOptions,
  handlers: SetupWebHandlers
): Promise<SetupWebController> {
  const host = normalizeHost(options.host);
  const requestedPort = parsePort(options.port);
  const token = getString(options.token) ?? randomBytes(16).toString("hex");
  let port = requestedPort;
  let baseUrl = `http://${host}:${port}/`;
  let setupUrl = `${baseUrl}?token=${encodeURIComponent(token)}`;

  let server: Server | null = null;

  const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      if (!req.url || !req.method) {
        writeNoStoreHeaders(res, 400, "application/json");
        res.end(JSON.stringify({ ok: false, error: "Invalid request" }));
        return;
      }

      const url = new URL(req.url, baseUrl);
      if (handlers.reloadRuntime) {
        await handlers.reloadRuntime();
      }
      const runtime = handlers.getRuntime();

      if (req.method === "GET" && url.pathname === "/") {
        const submittedToken = getHeaderSetupToken(req) ?? getQuerySetupToken(url);
        if (!isValidSetupToken(submittedToken, token)) {
          writeNoStoreHeaders(res, 401, "application/json");
          res.end(JSON.stringify({ ok: false, error: "Invalid setup token" }));
          return;
        }
        const html = buildSetupPage(options.configPath, token, runtime);
        writeNoStoreHeaders(
          res,
          200,
          "text/html; charset=utf-8",
          { "Referrer-Policy": "no-referrer" }
        );
        res.end(html);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/status") {
        const submittedToken = getHeaderSetupToken(req);
        if (!isValidSetupToken(submittedToken, token)) {
          writeNoStoreHeaders(res, 401, "application/json");
          res.end(JSON.stringify({ ok: false, error: "Invalid setup token" }));
          return;
        }
        writeNoStoreHeaders(res, 200, "application/json");
        res.end(JSON.stringify({
          ok: true,
          configPath: options.configPath,
          missingConfig: getMissingConfigFields(runtime),
          keyStatus: buildKeyStatusPayload(runtime)
        }));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/config") {
        const submittedToken = getHeaderSetupToken(req);
        if (!isValidSetupToken(submittedToken, token)) {
          writeNoStoreHeaders(res, 401, "application/json");
          res.end(JSON.stringify({ ok: false, error: "Invalid setup token" }));
          return;
        }

        const rawBody = await readRequestBody(req);
        const body = parseBodyByContentType(req.headers["content-type"], rawBody);

        const nextRuntime = mergeRuntimeConfig(runtime, body);
        await saveRuntimeConfig(options.configPath, nextRuntime);
        await handlers.onRuntimeSaved(nextRuntime);

        const runTests = parseRequestedTests(getString(body.runTests));
        const testText = getString(body.testText) ?? "Task complete. Build passed and your results are ready.";
        const tests = runTests.length > 0
          ? await runSetupTests(nextRuntime, runTests, testText)
          : undefined;

        writeNoStoreHeaders(res, 200, "application/json");
        res.end(JSON.stringify({
          ok: true,
          missingConfig: getMissingConfigFields(nextRuntime),
          keyStatus: buildKeyStatusPayload(nextRuntime),
          tests
        }));
        return;
      }

      writeNoStoreHeaders(res, 404, "application/json");
      res.end(JSON.stringify({ ok: false, error: "Not found" }));
    } catch (err) {
      const isClientError = err instanceof SetupWebRequestError;
      const statusCode = isClientError ? err.statusCode : 500;
      const message = err instanceof Error ? err.message : String(err);
      try {
        if (!res.headersSent) {
          writeNoStoreHeaders(res, statusCode, "application/json");
        }
        if (!res.writableEnded) {
          res.end(JSON.stringify({ ok: false, error: message }));
        }
      } catch (writeErr) {
        const writeMessage = writeErr instanceof Error ? writeErr.message : String(writeErr);
        console.error(`[simple-notify-mcp] setup web error response failed: ${writeMessage}; original: ${message}`);
      }
    }
  };

  server = createServer((req, res) => {
    void handleRequest(req, res).catch(err => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[simple-notify-mcp] setup web unhandled request error: ${message}`);
      try {
        if (!res.headersSent) {
          writeNoStoreHeaders(res, 500, "application/json");
        }
        if (!res.writableEnded) {
          res.end(JSON.stringify({ ok: false, error: "Internal setup server error" }));
        }
      } catch {
        // Ignore secondary write errors on broken sockets.
      }
    });
  });

  port = await listenOnFirstAvailablePort(server, host, requestedPort);
  baseUrl = `http://${host}:${port}/`;
  setupUrl = `${baseUrl}?token=${encodeURIComponent(token)}`;

  const state: SetupWebState = {
    running: true,
    host,
    port,
    token,
    baseUrl,
    url: setupUrl
  };

  return {
    state,
    close: async () => {
      if (!server) {
        return;
      }
      await new Promise<void>((resolve, reject) => {
        server?.close(err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
  };
}
