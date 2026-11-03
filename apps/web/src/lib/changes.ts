/**
 * Spec change feed data, read from tools/watch at build time. Every string that came out
 * of a third-party spec (names of subjects, change messages, versions) is untrusted:
 * render it through Astro templates only, never raw, and escape it in feeds.
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const WATCH_DIR = resolve(process.cwd(), "../../tools/watch");
const CHANGES_DIR = resolve(WATCH_DIR, "changes");

export type Severity = "breaking" | "warning" | "info";

export interface WatchedApi {
  id: string;
  name: string;
  spec: string;
  homepage: string;
  format: string;
}

export interface ChangeRow {
  id: string;
  severity: Severity;
  subject?: string;
  message: string;
  count: number;
}

export interface ChangeEntry {
  id: string;
  name: string;
  homepage: string;
  specUrl: string;
  fetchedAt: string;
  before: { url: string; fetchedAt: string; version?: string };
  after: { version?: string };
  summary: { breaking: number; warning: number; info: number };
  total: number;
  distinct: number;
  changes: ChangeRow[];
}

export interface ChangeDay {
  date: string;
  generatedAt: string;
  entries: ChangeEntry[];
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DAY_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

export async function loadWatchlist(): Promise<WatchedApi[]> {
  const text = await readFile(resolve(WATCH_DIR, "watchlist.json"), "utf8");
  const list = JSON.parse(text) as WatchedApi[];
  return list.filter((a) => ID_RE.test(a.id));
}

/** Every recorded day, newest first. Empty when nothing has been recorded yet. */
export async function loadDays(): Promise<ChangeDay[]> {
  let names: string[];
  try {
    names = await readdir(CHANGES_DIR);
  } catch {
    return [];
  }
  const days: ChangeDay[] = [];
  for (const name of names) {
    const m = name.match(DAY_RE);
    if (m === null) continue;
    const doc = JSON.parse(await readFile(resolve(CHANGES_DIR, name), "utf8")) as ChangeDay;
    if (!Array.isArray(doc.entries)) continue;
    days.push({
      date: m[1],
      generatedAt: typeof doc.generatedAt === "string" ? doc.generatedAt : `${m[1]}T06:00:00.000Z`,
      entries: doc.entries.filter((e) => ID_RE.test(e.id)).map(normalizeEntry),
    });
  }
  return days.sort((a, b) => b.date.localeCompare(a.date));
}

function normalizeEntry(e: ChangeEntry): ChangeEntry {
  return {
    ...e,
    summary: {
      breaking: e.summary?.breaking ?? 0,
      warning: e.summary?.warning ?? 0,
      info: e.summary?.info ?? 0,
    },
    total: e.total ?? e.changes?.length ?? 0,
    distinct: e.distinct ?? e.changes?.length ?? 0,
    changes: (e.changes ?? []).map((c) => ({ ...c, count: c.count ?? 1 })),
  };
}

/** One (day, API) pair, the unit of a feed item. */
export interface DayEntry {
  date: string;
  generatedAt: string;
  entry: ChangeEntry;
}

export function flatten(days: ChangeDay[]): DayEntry[] {
  const out: DayEntry[] = [];
  for (const d of days)
    for (const entry of d.entries) out.push({ date: d.date, generatedAt: d.generatedAt, entry });
  return out;
}

export function historyFor(days: ChangeDay[], id: string): DayEntry[] {
  return flatten(days).filter((x) => x.entry.id === id);
}

export function countLabel(s: { breaking: number; warning: number; info: number }): string {
  return `${s.breaking} breaking, ${s.warning} warning, ${s.info} info`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Feed item title, e.g. "GitHub REST API: 3 breaking changes (2026-11-03)". */
export function itemTitle(x: DayEntry): string {
  const s = x.entry.summary;
  const head =
    s.breaking > 0
      ? plural(s.breaking, "breaking change")
      : s.warning > 0
        ? plural(s.warning, "warning")
        : plural(x.entry.total, "change");
  return `${x.entry.name}: ${head} (${x.date})`;
}

/** Plain-text summary for feed descriptions: counts plus the top rows. */
export function itemText(x: DayEntry, max = 8): string {
  const lines = [`${countLabel(x.entry.summary)} (${x.entry.total} changes in total).`];
  for (const c of x.entry.changes.slice(0, max)) {
    const where = c.subject !== undefined ? `${c.subject}: ` : "";
    const times = c.count > 1 ? ` (x${c.count})` : "";
    lines.push(`[${c.severity}] ${where}${c.message}${times}`);
  }
  if (x.entry.changes.length > max) lines.push(`... and ${x.entry.changes.length - max} more.`);
  return lines.join("\n");
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
