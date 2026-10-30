import type { DiffResult, Severity } from "../types.js";
import { formatLocation } from "./location.js";

const ORDER: Severity[] = ["breaking", "warning", "info"];
const LABEL: Record<Severity, string> = {
  breaking: "BREAKING",
  warning: "WARNING ",
  info: "INFO    ",
};

/** Plain text for terminals. No color codes; the CLI adds those if it wants them. */
export function renderText(result: DiffResult): string {
  const lines: string[] = [];
  for (const severity of ORDER) {
    for (const c of result.changes.filter((x) => x.severity === severity)) {
      lines.push(`${LABEL[severity]} ${c.id}`);
      lines.push(`         ${formatLocation(c.location)}`);
      lines.push(`         ${c.message}`);
    }
  }
  const s = result.summary;
  if (lines.length > 0) lines.push("");
  lines.push(
    `${s.breaking} breaking, ${s.warning} warning, ${s.info} info${s.suppressed > 0 ? `, ${s.suppressed} suppressed` : ""}`,
  );
  return `${lines.join("\n")}\n`;
}
