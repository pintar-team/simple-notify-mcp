import type { CliArgs } from "./types.js";

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) {
      continue;
    }

    const arg = raw.slice(2);
    if (arg.startsWith("no-")) {
      out[arg.slice(3)] = false;
      continue;
    }

    const eqIndex = arg.indexOf("=");
    if (eqIndex >= 0) {
      const key = arg.slice(0, eqIndex);
      const value = arg.slice(eqIndex + 1);
      out[key] = value;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[arg] = next;
      i++;
    } else {
      out[arg] = true;
    }
  }

  return out;
}

export function getString(value: string | boolean | undefined): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed !== "") {
      return trimmed;
    }
  }
  return undefined;
}

export function getNumber(value: string | boolean | undefined): number | undefined {
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function getBoolean(value: string | boolean | undefined): boolean | undefined {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
}

export function isEnabledFlag(value: string | boolean | undefined): boolean {
  if (value === true) {
    return true;
  }
  if (value === false || value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}
