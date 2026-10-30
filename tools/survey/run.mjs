#!/usr/bin/env node
/**
 * Survey runner. For each target in targets.json:
 *   1. fetch the published spec (converted from Swagger 2.0 when needed)
 *   2. `driftwatch plan` it
 *   3. build a filled plan for GET operations only, from target-level values and spec examples
 *   4. `driftwatch run` with a request budget, a delay, a named User-Agent and continue-on-error
 *   5. write out/<id>/result.json and a one-line summary
 *
 * Read-only by construction: only GET, only values we chose, only credentials we own.
 * Usage: node run.mjs [target-id ...]
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import converter from "swagger2openapi";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const CLI = resolve(root, "packages/cli/dist/bin.js");
const UA = "driftwatch-survey/0.1 (read-only OpenAPI conformance survey; contact: see repository)";
const MAX_SPEC_BYTES = 40 * 1024 * 1024;

const only = new Set(process.argv.slice(2));
const targets = JSON.parse(await readFile(resolve(here, "targets.json"), "utf8"));
const rows = [];
for (const t of targets) {
  if (only.size > 0 && !only.has(t.id)) continue;
  try {
    rows.push(await runTarget(t));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[${t.id}] FAILED: ${reason}`);
    rows.push({ id: t.id, error: reason });
  }
}
console.log("\nsummary:");
for (const r of rows) console.log(JSON.stringify(r));

async function runTarget(t) {
  const out = resolve(here, "out", t.id);
  await mkdir(out, { recursive: true });
  console.error(`[${t.id}] fetching spec ${t.spec}`);
  const specText = await fetchText(t.spec);
  const parsedSpec = parseLoose(specText);
  let specPath;
  if (parsedSpec !== undefined && typeof parsedSpec.swagger === "string") {
    console.error(`[${t.id}] converting Swagger ${parsedSpec.swagger} to OpenAPI 3`);
    const { openapi } = await converter.convertObj(parsedSpec, { patch: true, warnOnly: true, resolve: false });
    specPath = resolve(out, "spec.json");
    await writeFile(specPath, JSON.stringify(openapi));
  } else {
    specPath = resolve(out, looksJson(specText) ? "spec.json" : "spec.yaml");
    await writeFile(specPath, specText);
  }

  const planPath = resolve(out, "plan.json");
  await cli(["plan", specPath, "--out", planPath], out);
  const plan = JSON.parse(await readFile(planPath, "utf8"));

  const values = t.values ?? {};
  const prefer = t.prefer ?? [];
  const filled = [];
  const unfillable = [];
  for (const p of plan) {
    if (p.method !== "GET") continue;
    if ((t.exclude ?? []).some((re) => new RegExp(re).test(p.operationKey))) continue;
    const v = {};
    const missing = [];
    const perOp = (t.opValues ?? {})[p.operationKey] ?? {};
    for (const prm of p.parameters) {
      const key = `${prm.in}:${prm.name}`;
      const given = perOp[key] ?? values[key] ?? values[`${prm.in}:*`];
      if (given !== undefined) v[key] = given;
      else if (prm.required && prm.example === undefined) missing.push(key);
    }
    if (missing.length > 0) {
      unfillable.push({ operationKey: p.operationKey, missing });
      continue;
    }
    filled.push({ operationKey: p.operationKey, values: v });
  }
  filled.sort((a, b) => rank(a, prefer) - rank(b, prefer));
  const filledPath = resolve(out, "filled.json");
  await writeFile(filledPath, JSON.stringify(filled, null, 2));
  await writeFile(resolve(out, "unfillable.json"), JSON.stringify(unfillable, null, 2));

  const args = [
    "run", specPath,
    "--base-url", t.baseUrl,
    "--plan", filledPath,
    "--only-filled",
    "--methods", "GET",
    "--max-requests", String(t.maxRequests ?? 40),
    "--delay-ms", String(t.delayMs ?? 750),
    "--user-agent", UA,
    "--continue-on-error",
    "--timeout", "30000",
    "--max-body-bytes", String(t.maxBodyBytes ?? 8 * 1024 * 1024),
    "--format", "json",
    "--observations-out", resolve(out, "observations.json"),
  ];
  for (const [k, envName] of Object.entries(t.headersFromEnv ?? {})) {
    const val = process.env[envName];
    if (val) args.push("--header", `${k}: ${val}`);
    else console.error(`[${t.id}] env ${envName} not set; running without ${k}`);
  }
  console.error(`[${t.id}] running ${Math.min(filled.length, t.maxRequests ?? 40)} of ${filled.length} fillable GET operations (${unfillable.length} unfillable)`);
  const { stdout, code } = await cli(args, out, [0, 1]);
  const result = JSON.parse(stdout);
  await writeFile(resolve(out, "result.json"), JSON.stringify(result, null, 2));
  const ids = {};
  for (const f of result.findings) ids[f.id] = (ids[f.id] ?? 0) + 1;
  const row = {
    id: t.id,
    exit: code,
    operationsInSpec: result.coverage.operations,
    getFillable: filled.length,
    unfillable: unfillable.length,
    observed: result.coverage.observed,
    failures: result.failures.length,
    breaking: result.summary.breaking,
    warning: result.summary.warning,
    info: result.summary.info,
    top: Object.entries(ids).sort((a, b) => b[1] - a[1]).slice(0, 6),
  };
  console.error(`[${t.id}] done: ${row.breaking} breaking, ${row.warning} warning, ${row.info} info; observed ${row.observed}/${row.operationsInSpec}`);
  return row;
}

function rank(entry, prefer) {
  const i = prefer.findIndex((re) => new RegExp(re).test(entry.operationKey));
  return i === -1 ? prefer.length : i;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json, application/yaml, text/yaml, */*" }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`spec fetch ${url}: HTTP ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len > MAX_SPEC_BYTES) throw new Error(`spec too large: ${len} bytes`);
  const text = await res.text();
  if (text.length > MAX_SPEC_BYTES) throw new Error("spec too large");
  return text;
}

function looksJson(text) {
  return /^\s*[{[]/.test(text.slice(0, 64));
}

function parseLoose(text) {
  if (!looksJson(text)) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function cli(args, cwd, allowExit = [0]) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (!allowExit.includes(code)) reject(new Error(`driftwatch ${args[0]} exited ${code}: ${stderr.trim().slice(0, 500)}`));
      else resolvePromise({ stdout, stderr, code });
    });
  });
}
