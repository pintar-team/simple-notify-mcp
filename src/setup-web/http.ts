import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { getString } from "../runtime.js";
import type { SubmittedSetupConfig } from "./types.js";

export async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 1_000_000) {
      throw new Error("Request body too large");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

export function parseBodyByContentType(contentType: string | undefined, rawBody: string): SubmittedSetupConfig {
  if (contentType?.includes("application/json")) {
    return JSON.parse(rawBody) as SubmittedSetupConfig;
  }

  const params = new URLSearchParams(rawBody);
  const payload: SubmittedSetupConfig = {};
  for (const [key, value] of params.entries()) {
    payload[key as keyof SubmittedSetupConfig] = value;
  }
  return payload;
}

export function getHeaderSetupToken(req: IncomingMessage): string | undefined {
  const value = req.headers["x-setup-token"];
  if (Array.isArray(value)) {
    return getString(value[0]);
  }
  return getString(value as string | undefined);
}

export function getQuerySetupToken(url: URL): string | undefined {
  return getString(url.searchParams.get("token") ?? undefined);
}

export function isValidSetupToken(submittedToken: string | undefined, expectedToken: string): boolean {
  if (!submittedToken) {
    return false;
  }
  const submitted = Buffer.from(submittedToken);
  const expected = Buffer.from(expectedToken);
  if (submitted.byteLength !== expected.byteLength) {
    return false;
  }
  return timingSafeEqual(submitted, expected);
}

export function writeNoStoreHeaders(
  res: ServerResponse,
  statusCode: number,
  contentType: string,
  extraHeaders: Record<string, string> = {}
): void {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Expires": "0",
    ...extraHeaders
  });
}
