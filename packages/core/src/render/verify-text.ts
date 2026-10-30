import type { Severity } from "../types.js";
import type { VerifyResult } from "../verify/types.js";
import { formatLocation } from "./location.js";

const ORDER: Severity[] = ["breaking", "warning", "info"];
const LABEL: Record<Severity, string> = {
  breaking: "BREAKING",
  warning: "WARNING ",
  info: "INFO    ",
};

/** Plain text for terminals. No color codes; the CLI adds those if it wants them. */
export function renderVerifyText(result: VerifyResult): string {
  const lines: string[] = [];
  for (const severity of ORDER) {
    for (const f of result.findings.filter((x) => x.severity === severity)) {
      const obs = f.observation === undefined ? "" : `  [observation ${f.observation}]`;
      lines.push(`${LABEL[severity]} ${f.id}${obs}`);
      lines.push(`         ${formatLocation(f.location)}`);
      lines.push(`         ${f.message}`);
      lines.push(`         spec is truth -> ${f.fix.implementation}`);
      lines.push(`         implementation is truth -> ${f.fix.spec}`);
    }
  }
  const s = result.summary;
  const c = result.coverage;
  if (lines.length > 0) lines.push("");
  lines.push(
    `${s.breaking} breaking, ${s.warning} warning, ${s.info} info${s.suppressed > 0 ? `, ${s.suppressed} suppressed` : ""}`,
  );
  lines.push(
    `coverage: ${c.observed}/${c.operations} operations observed, ${c.unmatchedObservations} unmatched observations`,
  );
  return `${lines.join("\n")}\n`;
}
