/** Footer options shared by the Markdown renderers. `false` turns the footer off. */
export type FooterOptions = { version?: string } | false;

/**
 * The attribution line at the end of a Markdown report: a horizontal rule and one line
 * pointing at the project. Text and JSON output never carry it. The version is passed in
 * by the caller because the core has no package.json access.
 */
export function renderFooter(footer: FooterOptions | undefined): string {
  if (footer === false) return "";
  const version = footer?.version;
  const suffix = version === undefined || version === "" ? "" : ` v${version}`;
  return `\n---\n\nFound with [apidrifter](https://apidrifter.com)${suffix}\n`;
}
