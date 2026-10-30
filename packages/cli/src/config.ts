import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { type Config, DriftwatchError, validateConfig } from "@driftwatch/core";
import { InputError } from "./errors.js";
import { loadDocument } from "./io.js";

const AUTO_FILES = ["driftwatch.config.json", ".driftwatch.yaml", ".driftwatch.yml"];

/** Load config from `--config`, or from a conventional file in cwd, or return `{}`. */
export async function loadConfig(explicit: string | undefined, cwd: string): Promise<Config> {
  let path = explicit;
  if (path === undefined) {
    for (const candidate of AUTO_FILES) {
      try {
        await access(resolve(cwd, candidate));
        path = candidate;
        break;
      } catch {
        // not present
      }
    }
  }
  if (path === undefined) return {};
  const raw = await loadDocument(path, { cwd, maxBytes: 1024 * 1024 });
  try {
    return validateConfig(raw);
  } catch (err) {
    if (err instanceof DriftwatchError) throw new InputError(`${path}: ${err.message}`);
    throw err;
  }
}
