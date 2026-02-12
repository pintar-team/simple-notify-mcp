import type { Server } from "node:http";

function isErrnoException(value: unknown): value is NodeJS.ErrnoException {
  return typeof value === "object" && value !== null && "code" in value;
}

export async function listenOnFirstAvailablePort(server: Server, host: string, startPort: number): Promise<number> {
  let port = startPort;

  while (port <= 65535) {
    const result = await new Promise<{ ok: true } | { ok: false; error: unknown }>(resolve => {
      const onError = (error: unknown) => {
        server.off("listening", onListening);
        resolve({ ok: false, error });
      };
      const onListening = () => {
        server.off("error", onError);
        resolve({ ok: true });
      };

      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, host);
    });

    if (result.ok) {
      return port;
    }

    if (isErrnoException(result.error) && result.error.code === "EADDRINUSE") {
      port += 1;
      continue;
    }

    throw result.error instanceof Error ? result.error : new Error(String(result.error));
  }

  throw new Error(`No available port from ${startPort} to 65535`);
}

export function normalizeHost(host: string): string {
  const normalized = host.trim();
  const allowed = new Set(["127.0.0.1", "localhost", "::1"]);
  return allowed.has(normalized) ? normalized : "127.0.0.1";
}

export function parsePort(value: number): number {
  if (Number.isInteger(value) && value > 0 && value <= 65535) {
    return value;
  }
  return 21420;
}
