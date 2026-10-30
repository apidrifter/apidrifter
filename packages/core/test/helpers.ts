import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Location, parseDocument } from "../src/index.js";

export const FIXTURE_ROOT = fileURLToPath(new URL("./fixtures/", import.meta.url));

export interface ExpectedChange {
  id: string;
  severity: string;
  location: Location;
  message?: string;
}

export interface Fixture {
  kind: string;
  name: string;
  dir: string;
  before: unknown;
  after: unknown;
  expectedPath: string;
  expected: ExpectedChange[] | undefined;
}

function readDoc(dir: string, base: string): unknown {
  for (const ext of ["json", "yaml", "yml"]) {
    const p = join(dir, `${base}.${ext}`);
    if (existsSync(p)) {
      const text = readFileSync(p, "utf8");
      return parseDocument(text, { format: ext === "json" ? "json" : "yaml" });
    }
  }
  throw new Error(`fixture ${dir} has no ${base}.(json|yaml)`);
}

/** Load every fixture directory under test/fixtures/<kind>/<name>/. Sorted for determinism. */
export function loadFixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const kind of readdirSync(FIXTURE_ROOT).sort()) {
    const kindDir = join(FIXTURE_ROOT, kind);
    for (const name of readdirSync(kindDir).sort()) {
      const dir = join(kindDir, name);
      if (
        !existsSync(join(dir, "expected.json")) &&
        !existsSync(join(dir, "before.json")) &&
        !existsSync(join(dir, "before.yaml"))
      ) {
        continue;
      }
      const expectedPath = join(dir, "expected.json");
      const expected = existsSync(expectedPath)
        ? (JSON.parse(readFileSync(expectedPath, "utf8")) as ExpectedChange[])
        : undefined;
      out.push({
        kind,
        name,
        dir,
        before: readDoc(dir, "before"),
        after: readDoc(dir, "after"),
        expectedPath,
        expected,
      });
    }
  }
  return out;
}
