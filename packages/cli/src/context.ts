import type { Config } from "@apidrifter/core";
import type { ParsedArgs } from "./args.js";
import { flag } from "./args.js";
import { loadConfig } from "./config.js";
import { type Format, type Level, resolveFormat, resolveLevel } from "./output.js";

/** Everything a command needs from the outside world, so tests can substitute it. */
export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  isTTY: boolean;
  cwd: string;
  env: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

/** Flags every reporting command shares. */
export const COMMON_FLAGS: ReadonlySet<string> = new Set([
  "format",
  "config",
  "fail-on",
  "timeout",
]);

export interface CommonOptions {
  format: Format;
  level: Level;
  config: Config;
}

export async function commonOptions(args: ParsedArgs, io: CliIo): Promise<CommonOptions> {
  return {
    format: resolveFormat(flag(args, "format"), io.isTTY),
    level: resolveLevel(flag(args, "fail-on")),
    config: await loadConfig(flag(args, "config"), io.cwd),
  };
}

export function withFlags(...extra: string[]): ReadonlySet<string> {
  return new Set([...COMMON_FLAGS, ...extra]);
}
