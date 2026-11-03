import type { Config, FooterOptions } from "@apidrifter/core";
import type { ParsedArgs } from "./args.js";
import { flag, hasFlag } from "./args.js";
import { loadConfig } from "./config.js";
import { type Format, type Level, resolveFormat, resolveLevel } from "./output.js";
import { VERSION } from "./version.js";

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
  "no-footer",
]);

/** Boolean flags shared by every reporting command, registered with the parser by cli.ts. */
export const COMMON_BOOLEANS: ReadonlySet<string> = new Set(["no-footer"]);

export interface CommonOptions {
  format: Format;
  level: Level;
  config: Config;
  /** Footer for Markdown reports: the CLI's own version, or `false` when turned off. */
  footer: FooterOptions;
}

export async function commonOptions(args: ParsedArgs, io: CliIo): Promise<CommonOptions> {
  const config = await loadConfig(flag(args, "config"), io.cwd);
  const footerOff = hasFlag(args, "no-footer") || config.footer === false;
  return {
    format: resolveFormat(flag(args, "format"), io.isTTY),
    level: resolveLevel(flag(args, "fail-on")),
    config,
    footer: footerOff ? false : { version: VERSION },
  };
}

export function withFlags(...extra: string[]): ReadonlySet<string> {
  return new Set([...COMMON_FLAGS, ...extra]);
}
