import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";
import type { CliIo } from "../src/context.js";
import { EXIT_OK, EXIT_THRESHOLD, EXIT_USAGE } from "../src/errors.js";

const base = {
  openapi: "3.1.0",
  info: { title: "Pets", version: "1" },
  paths: {
    "/pets": {
      get: {
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { id: { type: "integer" } },
                  required: ["id"],
                },
              },
            },
          },
        },
      },
    },
  },
};

const broken = JSON.parse(JSON.stringify(base)) as typeof base;
broken.paths["/pets"].get.responses["200"].content["application/json"].schema.properties.id.type =
  "string";

const added = JSON.parse(JSON.stringify(base)) as typeof base;
added.info.version = "1.1";

function makeIo(cwd: string, fetchImpl?: typeof fetch): CliIo & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo & { out: string[]; err: string[] } = {
    out,
    err,
    stdout: (t) => {
      out.push(t);
    },
    stderr: (t) => {
      err.push(t);
    },
    isTTY: false,
    cwd,
    env: {},
  };
  if (fetchImpl !== undefined) io.fetchImpl = fetchImpl;
  return io;
}

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "driftwatch-cli-"));
  await writeFile(join(dir, "base.json"), JSON.stringify(base));
  await writeFile(join(dir, "broken.json"), JSON.stringify(broken));
  await writeFile(join(dir, "added.json"), JSON.stringify(added));
  await writeFile(
    join(dir, "config.json"),
    JSON.stringify({ severity: { "api-version-changed": "breaking" } }),
  );
});

describe("driftwatch diff/breaking/changelog", () => {
  it("exits 1 on a breaking change and prints json when not a TTY", async () => {
    const io = makeIo(dir);
    const code = await main(["breaking", "base.json", "broken.json"], io);
    expect(code).toBe(EXIT_THRESHOLD);
    const result = JSON.parse(io.out.join(""));
    expect(result.changes.map((c: { id: string }) => c.id)).toEqual([
      "response-property-type-changed",
    ]);
    expect(result.summary.breaking).toBe(1);
  });

  it("exits 0 on a clean diff and honors --fail-on", async () => {
    expect(await main(["diff", "base.json", "added.json"], makeIo(dir))).toBe(EXIT_OK);
    expect(await main(["diff", "base.json", "added.json", "--fail-on", "info"], makeIo(dir))).toBe(
      EXIT_THRESHOLD,
    );
  });

  it("applies a config file that escalates a rule", async () => {
    const io = makeIo(dir);
    expect(await main(["breaking", "base.json", "added.json", "--config", "config.json"], io)).toBe(
      EXIT_THRESHOLD,
    );
    expect(io.out.join("")).toContain("api-version-changed");
  });

  it("renders markdown for changelog", async () => {
    const io = makeIo(dir);
    expect(await main(["changelog", "base.json", "broken.json"], io)).toBe(EXIT_THRESHOLD);
    expect(io.out.join("")).toMatch(/^## /);
    expect(io.out.join("")).toContain("response-property-type-changed");
  });

  it("returns usage errors for bad invocations", async () => {
    expect(await main(["diff", "base.json"], makeIo(dir))).toBe(EXIT_USAGE);
    expect(await main(["diff", "base.json", "broken.json", "--bogus", "1"], makeIo(dir))).toBe(
      EXIT_USAGE,
    );
    expect(await main(["nonsense"], makeIo(dir))).toBe(EXIT_USAGE);
    expect(await main([], makeIo(dir))).toBe(EXIT_USAGE);
    expect(await main(["--help"], makeIo(dir))).toBe(EXIT_OK);
    expect(await main(["diff", "base.json", "missing.json"], makeIo(dir))).toBe(EXIT_USAGE);
  });

  it("rejects plain http URLs that are not local", async () => {
    const io = makeIo(dir);
    expect(await main(["diff", "base.json", "http://example.com/spec.json"], io)).toBe(EXIT_USAGE);
    expect(io.err.join("")).toMatch(/localhost/);
  });

  it("fetches https inputs through the policy with manual redirects", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://specs.example.com/old.json") {
        return new Response(null, { status: 301, headers: { location: "/new.json" } });
      }
      return new Response(JSON.stringify(broken), { status: 200 });
    }) as typeof fetch;
    const io = makeIo(dir, fetchImpl);
    expect(await main(["breaking", "base.json", "https://specs.example.com/old.json"], io)).toBe(
      EXIT_THRESHOLD,
    );
    expect(calls).toEqual([
      "https://specs.example.com/old.json",
      "https://specs.example.com/new.json",
    ]);
  });
});

describe("plan and run", () => {
  it("plan prints a request per operation with expected statuses", async () => {
    const io = makeIo(dir);
    expect(await main(["plan", "base.json"], io)).toBe(EXIT_OK);
    const plans = JSON.parse(io.out.join("")) as Array<{
      operationKey: string;
      expectedStatuses: string[];
    }>;
    expect(plans.map((p) => p.operationKey)).toEqual(["GET /pets"]);
    expect(plans[0]?.expectedStatuses).toEqual(["200"]);
  });

  it("run executes the plan, verifies responses and reports fixes for both sides", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ id: "not-an-integer", extra: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const io = makeIo(dir, fetchImpl);
    const code = await main(["run", "base.json", "--base-url", "http://localhost:9999"], io);
    expect(code).toBe(EXIT_THRESHOLD);
    expect(seen).toEqual(["http://localhost:9999/pets"]);
    const result = JSON.parse(io.out.join("")) as {
      findings: Array<{ id: string; fix: { implementation: string; spec: string } }>;
      coverage: { operations: number; observed: number };
    };
    const ids = result.findings.map((f) => f.id);
    expect(ids).toContain("response-type-mismatch");
    expect(ids).toContain("response-undocumented-property");
    expect(result.coverage).toEqual({ operations: 1, observed: 1, unmatchedObservations: 0 });
    for (const f of result.findings) {
      expect(f.fix.implementation.length).toBeGreaterThan(0);
      expect(f.fix.spec.length).toBeGreaterThan(0);
    }
  });

  it("run honors --methods, several filled entries per operation and --max-requests", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL | Request) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const filled = [
      { operationKey: "GET /pets", values: { "query:page": 1 } },
      { operationKey: "GET /pets", values: { "query:page": 2 } },
      { operationKey: "GET /pets", values: { "query:page": 3 } },
    ];
    await writeFile(join(dir, "filled.json"), JSON.stringify(filled));
    const io = makeIo(dir, fetchImpl);
    const code = await main(
      [
        "run",
        "base.json",
        "--base-url",
        "http://localhost:9999",
        "--plan",
        "filled.json",
        "--methods",
        "GET",
        "--max-requests",
        "2",
        "--user-agent",
        "survey/1",
      ],
      io,
    );
    expect(code).toBe(EXIT_OK);
    expect(seen.length).toBe(2);
    const result = JSON.parse(io.out.join("")) as { overBudget: number; findings: unknown[] };
    expect(result.overBudget).toBe(1);
    expect(result.findings).toEqual([]);
    const none = makeIo(dir, fetchImpl);
    seen.length = 0;
    expect(
      await main(
        ["run", "base.json", "--base-url", "http://localhost:9999", "--methods", "POST"],
        none,
      ),
    ).toBe(EXIT_OK);
    expect(seen).toEqual([]);
  });

  it("run records transport failures with --continue-on-error", async () => {
    const fetchImpl = (async () => {
      throw new Error("connection refused");
    }) as typeof fetch;
    const io = makeIo(dir, fetchImpl);
    const code = await main(
      ["run", "base.json", "--base-url", "http://localhost:9999", "--continue-on-error"],
      io,
    );
    expect(code).toBe(EXIT_OK);
    const result = JSON.parse(io.out.join("")) as { failures: Array<{ reason: string }> };
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.reason).toMatch(/connection refused/);
  });

  it("run rejects a non-localhost http base url", async () => {
    const io = makeIo(dir);
    expect(await main(["run", "base.json", "--base-url", "http://api.example.com"], io)).toBe(
      EXIT_USAGE,
    );
  });
});
