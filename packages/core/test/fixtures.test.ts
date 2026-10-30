import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Change, diff } from "../src/index.js";
import { type ExpectedChange, loadFixtures } from "./helpers.js";

/**
 * Fixture contract tests. Each directory under test/fixtures/<kind>/<name>/ holds a
 * before document, an after document and expected.json: the list of changes the engine
 * must report, compared on id, severity and location (and message when present).
 *
 * Regenerate expectations after an intentional engine change with:
 *   UPDATE_FIXTURES=1 pnpm --filter @driftwatch/core test
 * and review the resulting diff by hand. The expected file is the contract.
 */

const UPDATE = process.env["UPDATE_FIXTURES"] === "1";

function slim(c: Change): ExpectedChange {
  return { id: c.id, severity: c.severity, location: c.location, message: c.message };
}

function describeList(list: ExpectedChange[]): string {
  return list
    .map((c) => `  ${c.severity.padEnd(8)} ${c.id}  @ ${JSON.stringify(c.location)}`)
    .join("\n");
}

const fixtures = loadFixtures();

describe("fixtures", () => {
  it("has fixtures", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const f of fixtures) {
    it(`${f.kind}/${f.name}`, () => {
      const result = diff(f.before, f.after);
      const actual = result.changes.map(slim);

      if (UPDATE || f.expected === undefined) {
        writeFileSync(f.expectedPath, `${JSON.stringify(actual, null, 2)}\n`);
        if (!UPDATE)
          throw new Error(`wrote missing expectations for ${f.kind}/${f.name}; review and re-run`);
        return;
      }

      const expected = f.expected;
      const actualCmp = actual.map((c, i) => {
        const e = expected[i];
        // Only compare message when the expectation includes one.
        return e !== undefined && e.message === undefined ? { ...c, message: undefined } : c;
      });
      const expectedCmp = expected.map((e) =>
        e.message === undefined ? { ...e, message: undefined } : e,
      );

      if (JSON.stringify(actualCmp) !== JSON.stringify(expectedCmp)) {
        const report = [
          `Fixture ${f.kind}/${f.name} produced different changes.`,
          "Expected:",
          describeList(expected),
          "Actual:",
          describeList(actual),
        ].join("\n");
        console.error(report);
      }
      expect(actualCmp).toEqual(expectedCmp);
    });
  }
});
