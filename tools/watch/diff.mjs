#!/usr/bin/env node
/**
 * Diff every API that has both a previous and a current snapshot in the state directory
 * (snapshot.mjs leaves `<id>.prev.json.gz` behind when the fetched bytes changed), through
 * the CLI so the engine's limits and output hygiene apply, and record the result:
 *
 *   tools/watch/changes/YYYY-MM-DD.json   one file per day with changes (nothing on quiet days)
 *   tools/watch/changes/index.json        last 90 days, per-API counts only
 *
 * Daily files older than 365 days are pruned. The previous snapshot is deleted once its diff
 * is recorded, so a rerun on the same day does not report it twice; an API whose diff fails
 * keeps its previous snapshot and is retried on the next run.
 *
 * Usage: node diff.mjs --state <dir> [--date YYYY-MM-DD] [--only <id>]
 */
import { mkdir, mkdtemp, readdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  CHANGES_DIR,
  clip,
  isValidDate,
  loadWatchlist,
  parseArgs,
  readJson,
  runCli,
  statePaths,
  utcDate,
} from "./lib.mjs";

const MAX_CHANGES_PER_API = 50;
const MAX_DAY_FILE_BYTES = 200 * 1024;
const INDEX_DAYS = 90;
const KEEP_DAYS = 365;
const SEVERITY_ORDER = { breaking: 0, warning: 1, info: 2 };

const args = parseArgs(process.argv.slice(2), { state: "string", date: "string", only: "string" });
if (args.state === undefined) {
  console.error("usage: node diff.mjs --state <dir> [--date YYYY-MM-DD] [--only <id>]");
  process.exit(2);
}
const date = args.date ?? utcDate();
if (!isValidDate(date)) {
  console.error(`bad --date ${args.date}`);
  process.exit(2);
}
const stateDir = args.state;
const watchlist = await loadWatchlist();
await mkdir(CHANGES_DIR, { recursive: true });

const entries = [];
let failed = 0;
for (const t of watchlist) {
  if (args.only !== undefined && t.id !== args.only) continue;
  const paths = statePaths(stateDir, t.id);
  const prevMeta = await readJson(paths.previousMeta);
  const curMeta = await readJson(paths.meta);
  if (prevMeta === undefined || curMeta === undefined) continue;
  if (prevMeta.sha256 === curMeta.sha256) {
    await discardPrevious(paths);
    continue;
  }
  try {
    const entry = await diffOne(t, paths, prevMeta, curMeta);
    if (entry !== undefined) entries.push(entry);
    await discardPrevious(paths);
    console.error(
      `[${t.id}] ${entry === undefined ? "no semantic changes" : `${entry.summary.breaking} breaking, ${entry.summary.warning} warning, ${entry.summary.info} info`}`,
    );
  } catch (err) {
    failed++;
    console.error(`[${t.id}] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (entries.length > 0) await writeDay(date, entries);
await prune();
await writeIndex();
console.error(`diff: ${entries.length} APIs with changes on ${date}, ${failed} failed`);
process.exit(0);

async function diffOne(t, paths, prevMeta, curMeta) {
  const work = await mkdtemp(resolve(tmpdir(), "apidrifter-watch-"));
  try {
    const before = resolve(work, "before.json");
    const after = resolve(work, "after.json");
    await writeFile(before, gunzipSync(await readFile(paths.previous)));
    await writeFile(after, gunzipSync(await readFile(paths.current)));
    // Exit 1 means breaking changes were found; that is a result, not a failure.
    const { stdout } = await runCli(
      ["diff", before, after, "--kind", "openapi", "--format", "json", "--fail-on", "breaking"],
      [0, 1],
    );
    const result = JSON.parse(stdout);
    if (!Array.isArray(result.changes)) throw new Error("CLI output has no changes array");
    if (result.changes.length === 0) return undefined;
    const sorted = dedupe(result.changes).sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) || b.count - a.count,
    );
    return {
      id: t.id,
      name: t.name,
      homepage: t.homepage,
      specUrl: curMeta.url ?? t.spec,
      fetchedAt: curMeta.fetchedAt,
      before: {
        url: prevMeta.url ?? t.spec,
        fetchedAt: prevMeta.fetchedAt,
        version: clip(result.before?.version, 100) || undefined,
      },
      after: { version: clip(result.after?.version, 100) || undefined },
      summary: {
        breaking: result.summary?.breaking ?? 0,
        warning: result.summary?.warning ?? 0,
        info: result.summary?.info ?? 0,
      },
      total: result.changes.length,
      distinct: sorted.length,
      changes: sorted.slice(0, MAX_CHANGES_PER_API),
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * One row per distinct (rule, severity, subject, message), with a count. The same property
 * change often appears at many JSON pointers; the feed wants to say it once.
 */
function dedupe(changes) {
  const rows = new Map();
  for (const c of changes) {
    const subject =
      typeof c.location?.subject === "string" ? clip(c.location.subject, 200) : undefined;
    const row = {
      id: clip(c.id, 100),
      severity: c.severity,
      subject,
      message: clip(c.message, 300),
      count: 1,
    };
    const key = JSON.stringify([row.id, row.severity, row.subject ?? "", row.message]);
    const seen = rows.get(key);
    if (seen === undefined) rows.set(key, row);
    else seen.count++;
  }
  return [...rows.values()];
}

async function discardPrevious(paths) {
  await unlink(paths.previous).catch(() => {});
  await unlink(paths.previousMeta).catch(() => {});
}

async function writeDay(day, fresh) {
  const file = resolve(CHANGES_DIR, `${day}.json`);
  const existing = await readJson(file);
  const byId = new Map();
  if (existing !== undefined && Array.isArray(existing.entries)) {
    for (const e of existing.entries) byId.set(e.id, e);
  }
  // A rerun on the same day replaces that API's entry rather than appending a second one.
  for (const e of fresh) byId.set(e.id, e);
  const entries = [...byId.values()].sort(
    (a, b) =>
      b.summary.breaking - a.summary.breaking ||
      b.summary.warning - a.summary.warning ||
      a.id.localeCompare(b.id),
  );
  // Keep the day file under the size cap by trimming the change lists evenly.
  let perApi = MAX_CHANGES_PER_API;
  let doc = { date: day, generatedAt: new Date().toISOString(), entries };
  let text = `${JSON.stringify(doc, null, 2)}\n`;
  while (Buffer.byteLength(text) > MAX_DAY_FILE_BYTES && perApi > 1) {
    perApi = Math.max(1, Math.floor(perApi / 2));
    doc = {
      ...doc,
      entries: entries.map((e) => ({ ...e, changes: e.changes.slice(0, perApi) })),
    };
    text = `${JSON.stringify(doc, null, 2)}\n`;
  }
  await writeFile(file, text);
  console.error(
    `wrote ${file} (${Buffer.byteLength(text)} bytes, up to ${perApi} changes per API)`,
  );
}

async function dayFiles() {
  const names = (await readdir(CHANGES_DIR)).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n));
  return names.sort().reverse();
}

async function prune() {
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  for (const name of await dayFiles()) {
    const day = basename(name, ".json");
    if (Date.parse(`${day}T00:00:00Z`) < cutoff) {
      await unlink(resolve(CHANGES_DIR, name));
      console.error(`pruned ${name}`);
    }
  }
}

async function writeIndex() {
  const cutoff = Date.now() - INDEX_DAYS * 86_400_000;
  const days = [];
  for (const name of await dayFiles()) {
    const day = basename(name, ".json");
    if (Date.parse(`${day}T00:00:00Z`) < cutoff) continue;
    const doc = await readJson(resolve(CHANGES_DIR, name));
    if (doc === undefined || !Array.isArray(doc.entries)) continue;
    days.push({
      date: day,
      apis: doc.entries.map((e) => ({
        id: e.id,
        name: e.name,
        breaking: e.summary.breaking,
        warning: e.summary.warning,
        info: e.summary.info,
        total: e.total,
      })),
    });
  }
  // Only rewrite the index when its entries change. A timestamp-only rewrite would commit to
  // main every day, which rebuilds and redeploys the site for nothing.
  const indexPath = resolve(CHANGES_DIR, "index.json");
  let previous = null;
  try {
    previous = JSON.parse(await readFile(indexPath, "utf8"));
  } catch {
    // first run
  }
  if (previous && JSON.stringify(previous.entries) === JSON.stringify(days)) return;
  const index = { generatedAt: new Date().toISOString(), days: INDEX_DAYS, entries: days };
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
}
