// Runs the built engine over two spec files and prints the DiffResult as JSON.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [root, before, after] = process.argv.slice(2);
if (!root || !before || !after) {
  console.error("usage: run-apidrifter.mjs <repo-root> <before.json> <after.json>");
  process.exit(2);
}
const core = await import(pathToFileURL(`${root}/packages/core/dist/src/index.js`).href);
const a = core.parseDocument(readFileSync(before, "utf8"), { format: "json" });
const b = core.parseDocument(readFileSync(after, "utf8"), { format: "json" });
process.stdout.write(JSON.stringify(core.diff(a, b), null, 2));
