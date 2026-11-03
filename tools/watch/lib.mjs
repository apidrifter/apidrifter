/**
 * Shared helpers for the watch scripts: argument parsing, watchlist loading, state paths,
 * running the CLI. Nothing in here touches the network.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../..");
export const CLI = resolve(repoRoot, "packages/cli/dist/bin.js");
export const CHANGES_DIR = resolve(here, "changes");
export const UA = "apidrifter-watch/0.1 (+https://apidrifter.com/changes/)";
export const SITE = "https://apidrifter.com";

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Parse `--flag value` pairs and `--flag` booleans; positionals are returned under `_`. */
export function parseArgs(argv, flags) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
    const name = a.slice(2);
    const kind = flags[name];
    if (kind === undefined) throw new Error(`unknown flag --${name}`);
    if (kind === "boolean") out[name] = true;
    else {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) throw new Error(`--${name} needs a value`);
      out[name] = v;
      i++;
    }
  }
  return out;
}

export async function loadWatchlist() {
  const list = JSON.parse(await readFile(resolve(here, "watchlist.json"), "utf8"));
  if (!Array.isArray(list)) throw new Error("watchlist.json must be an array");
  const seen = new Set();
  for (const t of list) {
    if (typeof t.id !== "string" || !ID_RE.test(t.id)) throw new Error(`bad id ${t.id}`);
    if (seen.has(t.id)) throw new Error(`duplicate id ${t.id}`);
    seen.add(t.id);
    if (typeof t.name !== "string" || t.name.length === 0) throw new Error(`${t.id}: name`);
    if (typeof t.spec !== "string" || !t.spec.startsWith("https://"))
      throw new Error(`${t.id}: spec must be an https URL`);
    if (typeof t.homepage !== "string" || !t.homepage.startsWith("https://"))
      throw new Error(`${t.id}: homepage must be an https URL`);
    if (!Number.isInteger(t.maxBytes) || t.maxBytes <= 0 || t.maxBytes > 40_000_000)
      throw new Error(`${t.id}: maxBytes must be an integer up to 40000000`);
  }
  return list;
}

export function isValidId(id) {
  return typeof id === "string" && ID_RE.test(id);
}

/** Paths of the state files for one API. */
export function statePaths(stateDir, id) {
  return {
    current: resolve(stateDir, `${id}.json.gz`),
    meta: resolve(stateDir, `${id}.meta.json`),
    previous: resolve(stateDir, `${id}.prev.json.gz`),
    previousMeta: resolve(stateDir, `${id}.prev.meta.json`),
  };
}

export async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err && err.code === "ENOENT") return undefined;
    throw err;
  }
}

/** YYYY-MM-DD in UTC. */
export function utcDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/** Run the CLI and capture stdout. `allowExit` lists the exit codes that are not failures. */
export function runCli(args, allowExit = [0]) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.stderr.on("data", (d) => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (!allowExit.includes(code))
        reject(new Error(`apidrifter ${args[0]} exited ${code}: ${stderr.trim().slice(0, 500)}`));
      else resolvePromise({ stdout, stderr, code });
    });
  });
}

/** Clip a third-party string: control characters out, length bounded. */
export function clip(value, max) {
  if (typeof value !== "string") return "";
  const clean = value
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}
