#!/usr/bin/env node
/**
 * Candidate discovery for the monthly survey. Reads the apis.guru directory and picks
 * public APIs the runner can survey without credentials:
 *
 *   1. the preferred version has a JSON spec URL (OpenAPI 3 or Swagger 2)
 *   2. the API is not in targets.json (by host) and not in surveyed.json (by id)
 *   3. the provider is not a cloud vendor or a known account-only API
 *   4. the spec declares an https base URL
 *   5. `apidrifter plan` finds at least --min-ops GET operations with no security
 *      requirement whose required parameters all have an example or default
 *   6. one GET to the base URL gets any HTTP response
 *
 * Selection is deterministic for a given --seed and directory snapshot: the pool is
 * shuffled with the seed, the first --max-inspect entries are inspected, eligible APIs are
 * ranked by fillable GET operations plus a bonus for well-known providers, and one API per
 * provider is kept up to --limit.
 *
 * Usage: node discover.mjs [--limit 15] [--seed YYYY-MM] [--min-ops 3] [--max-inspect 300]
 *                          [--list <local list.json>] [--out candidates.json]
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const CLI = resolve(root, "packages/cli/dist/bin.js");
const UA = "apidrifter-survey/0.1 (read-only OpenAPI conformance survey; contact: see repository)";
const LIST_URL = "https://api.apis.guru/v2/list.json";
const MAX_LIST_BYTES = 64 * 1024 * 1024;
const MAX_SPEC_BYTES = 8 * 1024 * 1024;

/** Providers that require an account for every call, or whose specs describe private hosts. */
const DENY_PROVIDERS = new Set([
  "azure.com",
  "amazonaws.com",
  "googleapis.com",
  "microsoft.com",
  "windows.net",
  "apisetu.gov.in",
  "twilio.com",
  "sportsdata.io",
  "amadeus.com",
  "adyen.com",
  "ebay.com",
  "nexmo.com",
  "vonage.com",
  "mastercard.com",
  "hubapi.com",
  "apideck.com",
  "codat.io",
  "godaddy.com",
  "ote-godaddy.com",
  "interzoid.com",
  "stripe.com",
  "paypal.com",
  "1password.com",
  "docusign.net",
  "zuora.com",
  "oracle.com",
  "ibm.com",
  "salesforce.com",
  "sap.com",
]);
const DENY_CATEGORIES = new Set(["cloud"]);

/** Providers a reader is likely to recognize; a bonus in ranking, never a bypass. */
const WELL_KNOWN = new Set([
  "github.com",
  "gitlab.com",
  "nytimes.com",
  "deutschebahn.com",
  "parliament.uk",
  "nasa.gov",
  "epa.gov",
  "data.gov",
  "gov.bc.ca",
  "wikimedia.org",
  "mozilla.org",
  "cloudflare.com",
  "digitalocean.com",
  "netlify.com",
  "vercel.com",
  "spotify.com",
  "openweathermap.org",
  "transport.rest",
  "nba.com",
  "bitbucket.org",
  "docker.com",
  "fec.gov",
  "nrel.gov",
  "noaa.gov",
  "europa.eu",
  "bbc.co.uk",
  "guardian.co.uk",
  "openfigi.com",
  "frankfurter.app",
  "exchangerate.host",
  "coingecko.com",
  "kraken.com",
  "binance.com",
]);

const { values: opts } = parseArgs({
  options: {
    limit: { type: "string", default: "15" },
    seed: { type: "string", default: new Date().toISOString().slice(0, 7) },
    "min-ops": { type: "string", default: "3" },
    "max-inspect": { type: "string", default: "300" },
    "delay-ms": { type: "string", default: "250" },
    list: { type: "string" },
    out: { type: "string", default: resolve(here, "candidates.json") },
  },
});
const limit = positiveInt(opts.limit, "--limit");
const minOps = positiveInt(opts["min-ops"], "--min-ops");
const maxInspect = positiveInt(opts["max-inspect"], "--max-inspect");
const delayMs = positiveInt(opts["delay-ms"], "--delay-ms");
const seed = opts.seed;
if (!/^\d{4}-\d{2}$/.test(seed)) throw new Error(`--seed must be YYYY-MM, got ${seed}`);

const targets = JSON.parse(await readFile(resolve(here, "targets.json"), "utf8"));
const surveyed = await readJsonOr(resolve(here, "surveyed.json"), {});
const knownHosts = new Set();
for (const t of targets) {
  for (const u of [t.spec, t.baseUrl]) {
    const h = hostOf(u);
    if (h !== undefined) knownHosts.add(h);
  }
}

console.error(`[discover] loading directory ${opts.list ?? LIST_URL}`);
const listText =
  opts.list !== undefined
    ? await readFile(resolve(opts.list), "utf8")
    : await fetchText(LIST_URL, MAX_LIST_BYTES, 120_000);
const list = JSON.parse(listText);
if (list === null || typeof list !== "object" || Array.isArray(list)) {
  throw new Error("directory is not a JSON object");
}

const pool = [];
const skipped = { noSpec: 0, provider: 0, category: 0, surveyed: 0, knownHost: 0, local: 0 };
for (const [id, entry] of Object.entries(list)) {
  const v = entry?.versions?.[entry?.preferred];
  if (v === undefined || typeof v.swaggerUrl !== "string") {
    skipped.noSpec++;
    continue;
  }
  const info = v.info ?? {};
  const provider =
    typeof info["x-providerName"] === "string" ? info["x-providerName"] : id.split(":")[0];
  if (provider.endsWith(".local") || provider.endsWith(".localhost")) {
    skipped.local++;
    continue;
  }
  if (DENY_PROVIDERS.has(provider) || [...DENY_PROVIDERS].some((d) => provider.endsWith(`.${d}`))) {
    skipped.provider++;
    continue;
  }
  const categories = Array.isArray(info["x-apisguru-categories"])
    ? info["x-apisguru-categories"]
    : [];
  if (categories.some((c) => DENY_CATEGORIES.has(c))) {
    skipped.category++;
    continue;
  }
  const slug = slugOf(id);
  if (
    surveyed[id] !== undefined ||
    surveyed[slug] !== undefined ||
    surveyed[provider] !== undefined ||
    targets.some((t) => t.id === slug)
  ) {
    skipped.surveyed++;
    continue;
  }
  pool.push({
    id,
    slug,
    provider,
    version: entry.preferred,
    title: typeof info.title === "string" ? info.title : id,
    swaggerUrl: v.swaggerUrl,
    openapiVer: typeof v.openapiVer === "string" ? v.openapiVer : "",
    updated: typeof v.updated === "string" ? v.updated : null,
    origin: Array.isArray(info["x-origin"]) ? (info["x-origin"][0]?.url ?? null) : null,
    categories,
  });
}
console.error(
  `[discover] pool ${pool.length} of ${Object.keys(list).length} entries (skipped: ${JSON.stringify(skipped)})`,
);

pool.sort((a, b) => a.id.localeCompare(b.id));
shuffle(pool, mulberry32(hash32(seed)));

const workDir = resolve(here, "out", "discover", seed);
await mkdir(workDir, { recursive: true });
const eligible = [];
const rejected = [];
let inspected = 0;
for (const c of pool) {
  if (inspected >= maxInspect) break;
  if (eligible.length >= limit * 4) break;
  inspected++;
  try {
    const r = await inspect(c);
    if (r.ok) {
      eligible.push(r.candidate);
      console.error(
        `[discover] ok   ${c.id}: ${r.candidate.fillableGets} fillable GET ops, ${r.candidate.baseUrl}`,
      );
    } else {
      rejected.push({ id: c.id, reason: r.reason });
      console.error(`[discover] skip ${c.id}: ${r.reason}`);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    rejected.push({ id: c.id, reason });
    console.error(`[discover] skip ${c.id}: ${reason.slice(0, 200)}`);
  }
  await sleep(delayMs);
}

eligible.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
const seenProviders = new Set();
const chosen = [];
for (const c of eligible) {
  if (seenProviders.has(c.provider)) continue;
  seenProviders.add(c.provider);
  chosen.push(c);
  if (chosen.length >= limit) break;
}
const candidates = chosen.map(({ score: _score, ...rest }) => rest);
await writeFile(opts.out, `${JSON.stringify(candidates, null, 2)}\n`);
await writeFile(
  resolve(workDir, "log.json"),
  `${JSON.stringify({ seed, inspected, eligible: eligible.length, rejected }, null, 2)}\n`,
);
console.error(
  `[discover] inspected ${inspected}, eligible ${eligible.length}, chose ${candidates.length}; wrote ${opts.out}`,
);
for (const c of candidates) console.log(`${c.id}\t${c.fillableGets}\t${c.baseUrl}`);

async function inspect(c) {
  const specText = await fetchText(c.swaggerUrl, MAX_SPEC_BYTES, 30_000);
  let spec = JSON.parse(specText);
  if (spec === null || typeof spec !== "object")
    return { ok: false, reason: "spec is not an object" };
  let specFormat = "openapi-3";
  let baseUrl;
  if (typeof spec.swagger === "string") {
    specFormat = "swagger-2.0";
    baseUrl = swagger2BaseUrl(spec);
    if (baseUrl === undefined) return { ok: false, reason: "no https host in Swagger 2 document" };
    const { default: converter } = await import("swagger2openapi");
    const converted = await converter.convertObj(spec, {
      patch: true,
      warnOnly: true,
      resolve: false,
    });
    spec = converted.openapi;
  } else if (typeof spec.openapi === "string") {
    baseUrl = openapi3BaseUrl(spec);
    if (baseUrl === undefined) return { ok: false, reason: "no https server URL" };
  } else {
    return { ok: false, reason: "neither openapi nor swagger" };
  }
  const host = hostOf(baseUrl);
  if (host === undefined) return { ok: false, reason: "base URL has no host" };
  if (knownHosts.has(host)) return { ok: false, reason: "base host already surveyed" };
  if (
    /(^|\.)(localhost|local|example\.com|internal)$/.test(host) ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    /(^|\.)(rapidapi\.com|swaggerhub\.com|mockable\.io|mocky\.io|apiary-mock\.com|stoplight\.io)$/.test(
      host,
    ) ||
    /^(accountname|yourdomain|your-domain|subdomain|tenant|customer|company|instance|example|placeholder)\./.test(
      host,
    ) ||
    /(^|[.-])(sandbox|test|testing|staging|stage|dev|demo|uat)[.-]/.test(host)
  ) {
    return { ok: false, reason: `base host ${host} is a mock, a proxy or a placeholder` };
  }

  const dir = resolve(workDir, c.slug);
  await mkdir(dir, { recursive: true });
  const specPath = resolve(dir, "spec.json");
  await writeFile(specPath, JSON.stringify(spec));
  const planPath = resolve(dir, "plan.json");
  await cli(["plan", specPath, "--out", planPath], dir);
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const gets = plan.filter((p) => p.method === "GET");
  const fillable = gets.filter(
    (p) =>
      (p.security ?? []).length === 0 &&
      p.parameters.every((prm) => !prm.required || prm.example !== undefined),
  );
  if (fillable.length < minOps) {
    return {
      ok: false,
      reason: `${fillable.length} fillable GET ops of ${gets.length} (${plan.length} total)`,
    };
  }
  // One real request to the simplest fillable operation: proves the host answers and that
  // "no security requirement" in the spec is not a lie. 401/403 mean an account after all.
  const probeUrl = probeUrlFor(baseUrl, fillable);
  if (probeUrl === undefined)
    return { ok: false, reason: "no probe operation without header params" };
  const reach = await reachable(probeUrl);
  if (!reach.ok) return { ok: false, reason: `probe failed: ${reach.reason}` };
  if (reach.status === 401 || reach.status === 403 || reach.status === 407) {
    return { ok: false, reason: `probe ${probeUrl} got ${reach.status}: needs credentials` };
  }
  if (reach.status >= 500) return { ok: false, reason: `probe ${probeUrl} got ${reach.status}` };

  const wellKnown = WELL_KNOWN.has(c.provider) || /\.(gov|edu|org)(\.[a-z]{2})?$/.test(c.provider);
  const score = Math.min(fillable.length, 25) + (wellKnown ? 10 : 0);
  return {
    ok: true,
    candidate: {
      id: c.slug,
      name: c.title.toLowerCase() === c.provider ? c.title : `${c.title} (${c.provider})`,
      spec: c.swaggerUrl,
      baseUrl,
      maxRequests: Math.min(25, fillable.length),
      delayMs: 1000,
      auto: true,
      source: "apis.guru",
      apisGuruId: c.id,
      provider: c.provider,
      version: c.version,
      specFormat,
      specUpdated: c.updated,
      originUrl: c.origin,
      categories: c.categories,
      operations: plan.length,
      fillableGets: fillable.length,
      note: "",
      score,
    },
  };
}

function openapi3BaseUrl(spec) {
  const server = Array.isArray(spec.servers) ? spec.servers[0] : undefined;
  if (server === undefined || typeof server.url !== "string") return undefined;
  let url = server.url;
  const vars = server.variables ?? {};
  url = url.replace(/\{([^}]+)\}/g, (m, name) => {
    const v = vars[name];
    if (v !== undefined && v.default !== undefined) return String(v.default);
    return m;
  });
  if (url.includes("{")) return undefined;
  if (!/^https:\/\//i.test(url)) return undefined;
  return url.replace(/\/+$/, "");
}

function swagger2BaseUrl(spec) {
  if (typeof spec.host !== "string" || spec.host.length === 0) return undefined;
  const schemes = Array.isArray(spec.schemes) ? spec.schemes : ["https"];
  if (!schemes.includes("https")) return undefined;
  const basePath = typeof spec.basePath === "string" ? spec.basePath : "";
  return `https://${spec.host}${basePath}`.replace(/\/+$/, "");
}

/** URL of the fillable GET operation with the fewest parameters, examples substituted. */
function probeUrlFor(baseUrl, fillable) {
  const usable = fillable
    .filter((p) =>
      p.parameters.every((prm) => !prm.required || prm.in === "path" || prm.in === "query"),
    )
    .sort(
      (a, b) =>
        a.parameters.length - b.parameters.length || a.pathTemplate.length - b.pathTemplate.length,
    );
  const op = usable[0];
  if (op === undefined) return undefined;
  const value = (prm) =>
    typeof prm.example === "object" ? JSON.stringify(prm.example) : String(prm.example);
  const byName = new Map(
    op.parameters.filter((prm) => prm.in === "path").map((prm) => [prm.name, prm]),
  );
  const path = op.pathTemplate.replace(/\{([^}]+)\}/g, (m, name) => {
    const prm = byName.get(name);
    return prm?.example === undefined ? m : encodeURIComponent(value(prm));
  });
  if (path.includes("{")) return undefined;
  const query = new URLSearchParams();
  for (const prm of op.parameters) {
    if (prm.in === "query" && prm.required && prm.example !== undefined)
      query.set(prm.name, value(prm));
  }
  const qs = query.toString();
  return `${baseUrl}${path}${qs.length === 0 ? "" : `?${qs}`}`;
}

async function reachable(url) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json, */*" },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    await res.body?.cancel();
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function fetchText(url, maxBytes, timeoutMs) {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json, */*" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len > maxBytes) throw new Error(`too large: ${len} bytes`);
  const chunks = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.length;
    if (total > maxBytes) {
      await res.body.cancel().catch(() => {});
      throw new Error(`too large: over ${maxBytes} bytes`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonOr(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") return fallback;
    throw err;
  }
}

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return undefined;
  }
}

function slugOf(id) {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function positiveInt(s, flag) {
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} must be a positive integer`);
  return n;
}

function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function mulberry32(a) {
  let state = a >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cli(args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd,
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
      if (code !== 0)
        reject(new Error(`apidrifter ${args[0]} exited ${code}: ${stderr.trim().slice(0, 300)}`));
      else resolvePromise({ stdout, stderr });
    });
  });
}
