import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { DriftwatchError, parseDocument } from "@driftwatch/core";
import { InputError } from "./errors.js";
import { type FetchTextOptions, fetchText } from "./fetch-text.js";
import { isUrlLike } from "./url-policy.js";

export interface LoadOptions {
  cwd: string;
  maxBytes?: number;
  fetch?: FetchTextOptions;
}

export type TextFormat = "json" | "yaml" | "auto";

const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

export async function readTextInput(
  input: string,
  options: LoadOptions,
): Promise<{ text: string; format: TextFormat }> {
  if (isUrlLike(input)) {
    const text = await fetchText(input, {
      ...(options.fetch ?? {}),
      maxBytes: options.maxBytes ?? DEFAULT_MAX_BYTES,
    });
    return { text, format: formatFromName(new URL(input).pathname) };
  }
  const path = resolve(options.cwd, input);
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    throw new InputError(`file not found: ${input}`);
  }
  const max = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (size > max) throw new InputError(`${input} is larger than ${max} bytes`);
  const text = await readFile(path, "utf8");
  return { text, format: formatFromName(path) };
}

/** Parse text as JSON or YAML with the engine's limits, mapping engine errors to input errors. */
export function parseText(text: string, format: TextFormat, label: string): unknown {
  try {
    return parseDocument(text, { format });
  } catch (err) {
    if (err instanceof DriftwatchError) throw new InputError(`${label}: ${err.message}`);
    throw err;
  }
}

/**
 * Load a local JSON file whose top level may be an array (filled plans, observations).
 * Same size limit as documents; JSON only, no YAML.
 */
export async function loadJsonFile(input: string, cwd: string): Promise<unknown> {
  const { text } = await readTextInput(input, { cwd });
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid JSON";
    throw new InputError(`${input}: ${msg.slice(0, 200)}`);
  }
}

/** Load a local path or URL and parse it as JSON or YAML. */
export async function loadDocument(input: string, options: LoadOptions): Promise<unknown> {
  const { text, format } = await readTextInput(input, options);
  return parseText(text, format, input);
}

export function formatFromName(name: string): TextFormat {
  const ext = extname(name).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  return "auto";
}

export async function writeTextFile(path: string, cwd: string, text: string): Promise<void> {
  await writeFile(resolve(cwd, path), text, "utf8");
}

/**
 * Resolve a user-supplied path and require it to stay inside `root`. Used by the MCP
 * server, where the caller is another program rather than the person at the keyboard.
 */
export function resolveInside(root: string, input: string): string {
  const rootAbs = resolve(root);
  const target = resolve(rootAbs, input);
  if (target !== rootAbs && !target.startsWith(`${rootAbs}/`)) {
    throw new InputError(`path ${input} is outside the working directory`);
  }
  return target;
}
