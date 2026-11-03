#!/usr/bin/env node
/**
 * Fetch every spec in watchlist.json and store it in the state directory:
 *
 *   state/<id>.json.gz        the spec as JSON (Swagger 2.0 converted to OpenAPI 3), gzipped
 *   state/<id>.meta.json      fetchedAt, sha256 of the fetched bytes, bytes, etag, lastModified
 *
 * When the fetched bytes differ from the stored sha256, the old snapshot is kept as
 * `<id>.prev.json.gz` / `<id>.prev.meta.json` so diff.mjs can compare them. A fetch failure
 * leaves that API's state untouched and is reported on stderr; the script still exits 0
 * unless every fetch failed, so one broken upstream does not stop the others.
 *
 * Usage: node snapshot.mjs --state <dir> [--only <id>] [--url <override url>]
 * `--url` applies only together with `--only` and exists to seed history from an archived
 * version of a spec (for example a raw GitHub commit URL).
 */
import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import converter from "swagger2openapi";
import { parse as parseYaml } from "yaml";
import { loadWatchlist, parseArgs, readJson, statePaths, UA } from "./lib.mjs";

const FETCH_TIMEOUT_MS = 90_000;

const args = parseArgs(process.argv.slice(2), { state: "string", only: "string", url: "string" });
if (args.state === undefined) {
  console.error("usage: node snapshot.mjs --state <dir> [--only <id>] [--url <override url>]");
  process.exit(2);
}
if (args.url !== undefined && args.only === undefined) {
  console.error("--url requires --only <id>");
  process.exit(2);
}
if (args.url !== undefined && !args.url.startsWith("https://")) {
  console.error("--url must be https");
  process.exit(2);
}

const stateDir = args.state;
await mkdir(stateDir, { recursive: true });
const watchlist = await loadWatchlist();
const targets = args.only === undefined ? watchlist : watchlist.filter((t) => t.id === args.only);
if (targets.length === 0) {
  console.error(`no watchlist entry with id ${args.only}`);
  process.exit(2);
}

let ok = 0;
let changed = 0;
let failed = 0;
for (const t of targets) {
  const url = args.url ?? t.spec;
  try {
    const outcome = await snapshot(t, url);
    ok++;
    if (outcome === "changed") changed++;
    console.error(`[${t.id}] ${outcome}`);
  } catch (err) {
    failed++;
    console.error(`[${t.id}] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.error(`snapshot: ${ok} ok (${changed} changed), ${failed} failed`);
process.exit(ok === 0 && failed > 0 ? 1 : 0);

async function snapshot(t, url) {
  const paths = statePaths(stateDir, t.id);
  const prevMeta = await readJson(paths.meta);
  const headers = {
    "user-agent": UA,
    accept: "application/json, application/yaml, text/yaml, */*",
  };
  // Conditional requests only against the same URL we stored.
  if (prevMeta !== undefined && prevMeta.url === url) {
    if (typeof prevMeta.etag === "string") headers["if-none-match"] = prevMeta.etag;
    else if (typeof prevMeta.lastModified === "string")
      headers["if-modified-since"] = prevMeta.lastModified;
  }
  const res = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 304) {
    await writeFile(
      paths.meta,
      `${JSON.stringify({ ...prevMeta, checkedAt: new Date().toISOString() }, null, 2)}\n`,
    );
    return "not modified (304)";
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > t.maxBytes) throw new Error(`content-length ${declared} exceeds ${t.maxBytes}`);
  const bytes = await readBounded(res, t.maxBytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fetchedAt = new Date().toISOString();
  if (prevMeta !== undefined && prevMeta.sha256 === sha256) {
    await writeFile(
      paths.meta,
      `${JSON.stringify({ ...prevMeta, checkedAt: fetchedAt }, null, 2)}\n`,
    );
    return "unchanged";
  }

  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const { doc, sourceFormat } = await toOpenApi3(text, t.id);
  const json = JSON.stringify(doc);
  if (prevMeta !== undefined) {
    // Keep the previous snapshot for diff.mjs. A stale .prev from a failed diff is replaced,
    // not stacked: the comparison is always previous-known-good vs current.
    await rename(paths.current, paths.previous);
    await rename(paths.meta, paths.previousMeta);
  }
  await writeFile(paths.current, gzipSync(Buffer.from(json, "utf8"), { level: 9 }));
  const meta = {
    id: t.id,
    url,
    fetchedAt,
    checkedAt: fetchedAt,
    sha256,
    bytes: bytes.length,
    etag: res.headers.get("etag") ?? undefined,
    lastModified: res.headers.get("last-modified") ?? undefined,
    contentType: res.headers.get("content-type") ?? undefined,
    sourceFormat,
    version: typeof doc.info?.version === "string" ? doc.info.version.slice(0, 100) : undefined,
  };
  await writeFile(paths.meta, `${JSON.stringify(meta, null, 2)}\n`);
  return prevMeta === undefined ? "first snapshot" : "changed";
}

async function readBounded(res, maxBytes) {
  const chunks = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`body exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function looksJson(text) {
  return /^\s*[{[]/.test(text.slice(0, 64));
}

/** Parse JSON or YAML (core schema, bounded aliases) and convert Swagger 2.0 to OpenAPI 3. */
async function toOpenApi3(text, id) {
  let doc;
  if (looksJson(text)) doc = JSON.parse(text);
  else
    doc = parseYaml(text, {
      schema: "core",
      merge: false,
      maxAliasCount: 200,
      uniqueKeys: false,
      prettyErrors: false,
      strict: false,
    });
  if (doc === null || typeof doc !== "object" || Array.isArray(doc))
    throw new Error("document is not an object");
  if (typeof doc.swagger === "string") {
    const { openapi } = await converter.convertObj(doc, {
      patch: true,
      warnOnly: true,
      resolve: false,
    });
    return { doc: openapi, sourceFormat: `swagger-${doc.swagger}` };
  }
  if (typeof doc.openapi !== "string")
    throw new Error(`[${id}] not an OpenAPI or Swagger document (no openapi/swagger key)`);
  return { doc, sourceFormat: `openapi-${doc.openapi}` };
}
