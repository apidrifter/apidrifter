/**
 * Survey data, read from tools/survey/results at build time. Every string in here came
 * from a third-party API or spec: render it through Astro templates only, never raw.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const RESULTS_DIR = resolve(process.cwd(), "../../tools/survey/results");

export type FindingClass = "body" | "media" | "errors" | "server" | "input";

export interface SurveyCounts {
  body: number;
  hard: number;
  media: number;
  errors: number;
  server: number;
  input: number;
}

export interface SurveyApi {
  id: string;
  name: string;
  spec: string;
  baseUrl: string;
  specFormat: string;
  operations: number;
  sent: number;
  ok: number;
  observed: number;
  counts: SurveyCounts;
  note: string;
  ranAt: string | null;
}

export interface SurveySummary {
  generatedAt: string;
  totals: {
    apis: number;
    withBody: number;
    withHard: number;
    body: number;
    hard: number;
    media: number;
    errors: number;
    server: number;
    input: number;
  };
  apis: SurveyApi[];
}

export interface FindingLocation {
  kind: string;
  subject?: string;
  part?: string;
  name?: string;
  mediaType?: string;
  pointer?: string;
}

export interface FindingRequest {
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  status: number;
  mediaType: string | null;
}

export interface Finding {
  class: FindingClass;
  strict: boolean;
  id: string;
  severity: "breaking" | "warning" | "info";
  location: FindingLocation;
  message: string;
  observation?: number;
  expected?: unknown;
  actual?: unknown;
  fix: { implementation: string; spec: string };
  request?: FindingRequest;
  review: string;
}

export async function loadSummary(): Promise<SurveySummary> {
  const text = await readFile(resolve(RESULTS_DIR, "summary.json"), "utf8");
  return JSON.parse(text) as SurveySummary;
}

export async function loadFindings(apiId: string): Promise<Finding[]> {
  if (!/^[a-z0-9-]+$/.test(apiId)) throw new Error(`bad api id ${apiId}`);
  const text = await readFile(resolve(RESULTS_DIR, `${apiId}.findings.json`), "utf8");
  return JSON.parse(text) as Finding[];
}

/** Display order and labels for finding groups. */
export const GROUPS: ReadonlyArray<{ key: string; label: string; blurb: string; open: boolean }> = [
  {
    key: "hard",
    label: "Hard violations",
    blurb: "A typed client generated from the spec would break on these.",
    open: true,
  },
  {
    key: "body",
    label: "Other body findings",
    blurb:
      "Undocumented fields and loose constraints on successful responses. Documentation gaps, not violations.",
    open: true,
  },
  {
    key: "media",
    label: "Media type",
    blurb: "Successful responses in a media type the spec does not list.",
    open: true,
  },
  {
    key: "errors",
    label: "Undocumented error responses",
    blurb: "3xx and 4xx statuses the spec does not mention, usually auth or not-found cases.",
    open: false,
  },
  {
    key: "server",
    label: "Server errors",
    blurb: "5xx responses during the run; transient until reproduced.",
    open: false,
  },
  {
    key: "input",
    label: "Our input",
    blurb: "Our own request values were wrong. Not the API's fault; listed for honesty.",
    open: false,
  },
];

export function groupKey(f: Finding): string {
  if (f.strict) return "hard";
  return f.class;
}

export function groupFindings(findings: Finding[]): Map<string, Finding[]> {
  const out = new Map<string, Finding[]>();
  for (const g of GROUPS) out.set(g.key, []);
  for (const f of findings) out.get(groupKey(f))?.push(f);
  return out;
}

export function formatLocation(loc: FindingLocation): string {
  const parts: string[] = [];
  if (loc.kind === "document") parts.push("document");
  else if (loc.kind === "server") parts.push("server");
  else if (loc.subject !== undefined) parts.push(loc.subject);
  if (loc.part !== undefined)
    parts.push(loc.name !== undefined ? `${loc.part} ${loc.name}` : loc.part);
  else if (loc.name !== undefined) parts.push(loc.name);
  if (loc.mediaType !== undefined) parts.push(loc.mediaType);
  if (loc.pointer !== undefined) parts.push(loc.pointer);
  return parts.join(" > ");
}

/** JSON for display, clipped. Returns undefined when there is nothing to show. */
export function clipJson(value: unknown, max = 200): string | undefined {
  if (value === undefined) return undefined;
  const text = JSON.stringify(value);
  if (text === undefined) return undefined;
  return text.length > max ? `${text.slice(0, max)}\u2026` : text;
}

export function formatRequest(r: FindingRequest): string {
  const q = Object.entries(r.query ?? {});
  const qs =
    q.length === 0
      ? ""
      : `?${q.map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : v}`).join("&")}`;
  return `${r.method} ${r.path}${qs}`;
}

/** Drift index status for one API. "Not verified" when nothing was sent or nothing succeeded. */
export type DriftStatus = "Drift confirmed" | "Clean" | "Incomplete" | "Not verified";

export function apiStatus(a: SurveyApi): DriftStatus {
  if (a.sent === 0 || a.ok === 0) return "Not verified";
  if (a.counts.hard > 0) return "Drift confirmed";
  // Fewer than half the requests succeeded (rate limiting, mostly): too little seen to call it clean.
  return a.ok * 2 < a.sent ? "Incomplete" : "Clean";
}

/** APIs ranked for the drift index: hard violations first, then other body findings, then name. */
export function rankedApis(summary: SurveySummary): SurveyApi[] {
  return [...summary.apis].sort(
    (a, b) =>
      b.counts.hard - a.counts.hard ||
      b.counts.body - a.counts.body ||
      a.name.localeCompare(b.name, "en"),
  );
}

export function specFormatLabel(format: string): string {
  return format === "swagger-2.0" ? "Swagger 2.0" : "OpenAPI 3";
}

/**
 * The reviewer note for a table cell: the whole note when it fits in `max` characters,
 * otherwise its first sentence, otherwise a clipped prefix.
 */
export function noteExcerpt(note: string, max = 120): string {
  const flat = note.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const sentence = flat.match(/^.*?\.(?=\s|$)/)?.[0];
  if (sentence !== undefined && sentence.length <= max) return sentence;
  return `${flat.slice(0, max - 1).trimEnd()}\u2026`;
}
