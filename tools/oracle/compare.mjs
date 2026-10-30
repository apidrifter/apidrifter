// Compares an oasdiff changelog (JSON) with a Driftwatch DiffResult and writes a
// Markdown report of disagreements.
import { readFileSync } from "node:fs";

const [oasPath, dwPath] = process.argv.slice(2);
const oas = JSON.parse(readFileSync(oasPath, "utf8"));
const dw = JSON.parse(readFileSync(dwPath, "utf8"));

// oasdiff changelog entries: { id, text, level (3=ERR,2=WARN,1=INFO), operation, path }
const levelName = { 3: "breaking", 2: "warning", 1: "info" };
const normPath = (p) => (p ?? "").replace(/\{[^}]*\}/g, "{}").replace(/\/+$/, "") || "/";
const oasEntries = (Array.isArray(oas) ? oas : []).map((e) => ({
  tool: "oasdiff",
  id: e.id,
  severity: levelName[e.level] ?? String(e.level),
  op: e.operation && e.path ? `${e.operation.toUpperCase()} ${normPath(e.path)}` : "document",
  text: e.text,
}));
const dwEntries = dw.changes.map((c) => {
  const subject = c.location.subject;
  const op = subject
    ? `${subject.split(" ")[0]} ${normPath(subject.split(" ").slice(1).join(" "))}`
    : "document";
  return { tool: "driftwatch", id: c.id, severity: c.severity, op, text: c.message };
});

const key = (e) => `${e.op}|${e.id}`;
const oasByKey = new Map(oasEntries.map((e) => [key(e), e]));
const dwByKey = new Map(dwEntries.map((e) => [key(e), e]));

const onlyOas = oasEntries.filter((e) => !dwByKey.has(key(e)));
const onlyDw = dwEntries.filter((e) => !oasByKey.has(key(e)));
const severityDiff = oasEntries
  .filter((e) => dwByKey.has(key(e)) && dwByKey.get(key(e)).severity !== e.severity)
  .map((e) => ({ ...e, driftwatch: dwByKey.get(key(e)).severity }));

const opsOas = new Set(oasEntries.map((e) => e.op));
const opsDw = new Set(dwEntries.map((e) => e.op));
const opsOnlyOas = [...opsOas].filter((o) => !opsDw.has(o)).sort();
const opsOnlyDw = [...opsDw].filter((o) => !opsOas.has(o)).sort();

const lines = [];
lines.push("# Oracle report", "");
lines.push(`oasdiff: ${oasEntries.length} entries. driftwatch: ${dwEntries.length} entries.`, "");
lines.push(`## Operations with changes only in oasdiff (${opsOnlyOas.length})`, "");
for (const o of opsOnlyOas) lines.push(`- ${o}`);
lines.push("", `## Operations with changes only in driftwatch (${opsOnlyDw.length})`, "");
for (const o of opsOnlyDw) lines.push(`- ${o}`);
lines.push("", `## Matching IDs with different severity (${severityDiff.length})`, "");
for (const e of severityDiff)
  lines.push(`- ${e.op} ${e.id}: oasdiff=${e.severity} driftwatch=${e.driftwatch}`);
lines.push("", `## Entries only in oasdiff (${onlyOas.length})`, "");
for (const e of onlyOas) lines.push(`- ${e.severity} ${e.op} ${e.id}: ${e.text}`);
lines.push("", `## Entries only in driftwatch (${onlyDw.length})`, "");
for (const e of onlyDw) lines.push(`- ${e.severity} ${e.op} ${e.id}: ${e.text}`);
process.stdout.write(`${lines.join("\n")}\n`);
