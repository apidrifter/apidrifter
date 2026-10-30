import { listRules } from "../src/rules/registry.js";
import { listFindingRules } from "../src/verify/rules.js";

/** Prints docs/rules.md to stdout. Run via `pnpm rules:docs` after building. */
const rules = listRules();
const findings = listFindingRules();
const lines: string[] = [
  "# Rules reference",
  "",
  "Generated from `packages/core/src/rules/registry.ts` and `packages/core/src/verify/rules.ts`. Do not edit by hand.",
  "",
  "## Change rules",
  "",
  `${rules.length} rules reported by \`diff\`. Severity is the default and can be overridden in config.`,
  "",
  "| ID | Severity | Source | Description |",
  "|----|----------|--------|-------------|",
];
for (const r of rules) {
  lines.push(
    `| \`${r.id}\` | ${r.severity} | ${r.source} | ${r.description.replace(/\|/g, "\\|")} |`,
  );
}
lines.push(
  "",
  "## Finding rules",
  "",
  `${findings.length} findings reported by \`verify\`. Each finding carries a fix for either source of truth.`,
  "",
  "| ID | Severity | Source | Description |",
  "|----|----------|--------|-------------|",
);
for (const r of findings) {
  lines.push(
    `| \`${r.id}\` | ${r.severity} | ${r.source} | ${r.description.replace(/\|/g, "\\|")} |`,
  );
}
process.stdout.write(`${lines.join("\n")}\n`);
