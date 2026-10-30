#!/usr/bin/env node
/** Print a few concrete examples per finding id for a target, with the observation's status, to review by hand. */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const [id, perId = "2"] = process.argv.slice(2);
const out = resolve(here, "out", id);
const r = JSON.parse(await readFile(resolve(out, "result.json"), "utf8"));
const obs = JSON.parse(await readFile(resolve(out, "observations.json"), "utf8"));
const byId = new Map();
for (const f of r.findings) {
  const list = byId.get(f.id) ?? [];
  list.push(f);
  byId.set(f.id, list);
}
console.log(`== ${id}: ${r.findings.length} findings over ${obs.length} observations`);
const statuses = {};
for (const o of obs) statuses[o.response.status] = (statuses[o.response.status] ?? 0) + 1;
console.log("statuses:", JSON.stringify(statuses));
for (const [fid, list] of [...byId.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n-- ${fid} (${list.length})`);
  for (const f of list.slice(0, Number(perId))) {
    const o = f.observation === undefined ? undefined : obs[f.observation];
    const loc = [f.location.subject, f.location.part, f.location.name, f.location.mediaType, f.location.pointer].filter(Boolean).join(" > ");
    console.log(`   ${loc}`);
    console.log(`   msg: ${f.message.slice(0, 160)}`);
    if (f.expected !== undefined || f.actual !== undefined) console.log(`   expected: ${JSON.stringify(f.expected)?.slice(0, 80)} actual: ${JSON.stringify(f.actual)?.slice(0, 80)}`);
    if (o) console.log(`   obs: ${o.request.method} ${o.request.path} -> ${o.response.status} ${(o.response.mediaType ?? "").slice(0, 60)}`);
  }
}
