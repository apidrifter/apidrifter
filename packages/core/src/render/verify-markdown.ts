import type { Severity } from "../types.js";
import type { Finding, VerifyResult } from "../verify/types.js";
import { type FooterOptions, renderFooter } from "./footer.js";
import { formatLocation } from "./location.js";

const ORDER: Severity[] = ["breaking", "warning", "info"];
const HEADINGS: Record<Severity, string> = {
  breaking: "Breaking",
  warning: "Warnings",
  info: "Info",
};

/** Escape text for safe inclusion in Markdown. Third-party strings never render as markup. */
function esc(s: string): string {
  // Only characters that can open inline markup or HTML. Punctuation that matters solely at
  // line start (lists, headings) is left alone because our text never starts a line.
  return s.replace(/[\\`*_[\]<>]/g, "\\$&");
}

function code(s: string): string {
  return `\`${s.replace(/`/g, "'")}\``;
}

export interface VerifyMarkdownOptions {
  title?: string;
  /** Attribution footer. On by default; pass `false` to omit it. */
  footer?: FooterOptions;
}

export function renderVerifyMarkdown(
  result: VerifyResult,
  options: VerifyMarkdownOptions = {},
): string {
  const lines: string[] = [];
  lines.push(`## ${esc(options.title ?? "Verification report")}`);
  lines.push("");
  const s = result.summary;
  lines.push(
    `${s.breaking} breaking, ${s.warning} warning, ${s.info} info${s.suppressed > 0 ? `, ${s.suppressed} suppressed` : ""}.`,
  );
  const c = result.coverage;
  lines.push(
    `Coverage: ${c.observed} of ${c.operations} operations observed, ${c.unmatchedObservations} observation${c.unmatchedObservations === 1 ? "" : "s"} matched no operation.`,
  );
  lines.push("");
  for (const severity of ORDER) {
    const group = result.findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    lines.push(`### ${HEADINGS[severity]} (${group.length})`);
    lines.push("");
    for (const f of group) lines.push(...renderFinding(f));
    lines.push("");
  }
  if (result.findings.length === 0) lines.push("No findings.");
  return `${lines.join("\n").trimEnd()}\n${renderFooter(options.footer)}`;
}

function renderFinding(f: Finding): string[] {
  const obs = f.observation === undefined ? "" : ` (observation ${f.observation})`;
  return [
    `- ${code(f.id)} at ${code(formatLocation(f.location))}${obs}: ${esc(f.message)}`,
    `  - If the spec is the source of truth: ${esc(f.fix.implementation)}`,
    `  - If the implementation is the source of truth: ${esc(f.fix.spec)}`,
  ];
}
