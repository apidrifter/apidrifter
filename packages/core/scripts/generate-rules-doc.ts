import { listRules } from "../src/rules/registry.js";

/** Prints docs/rules.md to stdout. Run via `pnpm rules:docs` after building. */
const rules = listRules();
const lines: string[] = [
  "# Rules reference",
  "",
  "Generated from `packages/core/src/rules/registry.ts`. Do not edit by hand.",
  "",
  `${rules.length} rules. Severity is the default and can be overridden in config.`,
  "",
  "| ID | Severity | Source | Description |",
  "|----|----------|--------|-------------|",
];
for (const r of rules) {
  lines.push(
    `| \`${r.id}\` | ${r.severity} | ${r.source} | ${r.description.replace(/\|/g, "\\|")} |`,
  );
}
process.stdout.write(`${lines.join("\n")}\n`);
