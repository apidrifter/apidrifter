#!/usr/bin/env node
/** Aggregate out/<id>/result.json into results/summary.md and results/<id>.findings.json. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const targets = JSON.parse(await readFile(resolve(here, "targets.json"), "utf8"));
const outDir = resolve(here, "out");
const resDir = resolve(here, "results");
await mkdir(resDir, { recursive: true });

const lines = [
  "# Public API conformance survey",
  "",
  "Read-only GET requests against APIs that publish their own spec, verified with `driftwatch run`.",
  "Findings are raw engine output and have not yet been reviewed by hand; see the review column.",
  "",
  "| API | Spec | Ops in spec | GET sent | Observed | Breaking | Warning | Info | Top finding IDs |",
  "|-----|------|-------------|----------|----------|----------|---------|------|-----------------|",
];
for (const t of targets) {
  let r;
  try {
    r = JSON.parse(await readFile(resolve(outDir, t.id, "result.json"), "utf8"));
  } catch {
    lines.push(`| ${t.name} | ${t.spec} | - | - | - | - | - | - | not run |`);
    continue;
  }
  const ids = {};
  for (const f of r.findings) ids[f.id] = (ids[f.id] ?? 0) + 1;
  const top = Object.entries(ids).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} (${n})`).join(", ");
  const sent = r.coverage.observed + r.failures.length;
  lines.push(`| ${t.name} | [spec](${t.spec}) | ${r.coverage.operations} | ${sent} | ${r.coverage.observed} | ${r.summary.breaking} | ${r.summary.warning} | ${r.summary.info} | ${top || "none"} |`);
  const findings = r.findings.map((f) => ({ ...f, review: "unreviewed" }));
  await writeFile(resolve(resDir, `${t.id}.findings.json`), JSON.stringify(findings, null, 2));
}
await writeFile(resolve(resDir, "summary.md"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
