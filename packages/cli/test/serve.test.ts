import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeAll, describe, expect, it } from "vitest";
import { InputError } from "../src/errors.js";
import { resolveInside } from "../src/io.js";
import { createServer, loadDocInput } from "../src/serve.js";

const spec = (idType: string) =>
  JSON.stringify({
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
                    properties: { id: { type: idType } },
                    required: ["id"],
                  },
                },
              },
            },
          },
        },
      },
    },
  });

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "driftwatch-serve-"));
  await writeFile(join(dir, "a.json"), spec("integer"));
  await writeFile(join(dir, "b.json"), spec("string"));
});

describe("path containment", () => {
  it("keeps paths inside the working directory", () => {
    expect(resolveInside("/work", "spec.json")).toBe("/work/spec.json");
    expect(resolveInside("/work", "sub/../spec.json")).toBe("/work/spec.json");
    expect(() => resolveInside("/work", "../etc/passwd")).toThrow(InputError);
    expect(() => resolveInside("/work", "/etc/passwd")).toThrow(InputError);
    expect(() => resolveInside("/work", "/workspace/x")).toThrow(InputError);
  });

  it("loadDocInput requires exactly one source and applies the URL policy", async () => {
    const options = { cwd: dir, env: {} };
    await expect(loadDocInput({}, options)).rejects.toThrow(/exactly one/);
    await expect(loadDocInput({ path: "a.json", content: "{}" }, options)).rejects.toThrow(
      /exactly one/,
    );
    await expect(loadDocInput({ path: "../x.json" }, options)).rejects.toThrow(/outside/);
    await expect(loadDocInput({ url: "http://example.com/x.json" }, options)).rejects.toThrow(
      /localhost/,
    );
    const doc = (await loadDocInput(
      { content: 'openapi: "3.1.0"\ninfo: {title: t, version: "1"}' },
      options,
    )) as {
      openapi: string;
    };
    expect(doc.openapi).toBe("3.1.0");
  });
});

describe("serve over an in-memory transport", () => {
  it("lists tools and runs diff_specs with structured results", async () => {
    const server = createServer({ cwd: dir, env: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name).sort()).toEqual(
        [
          "breaking_changes",
          "changelog",
          "diff_specs",
          "list_rules",
          "mcp_diff",
          "mcp_snapshot",
          "plan_requests",
          "run_requests",
          "verify_observations",
        ].sort(),
      );
      const result = await client.callTool({
        name: "diff_specs",
        arguments: { before: { path: "a.json" }, after: { path: "b.json" } },
      });
      const structured = result.structuredContent as {
        summary: { breaking: number };
        changes: Array<{ id: string }>;
      };
      expect(structured.summary.breaking).toBe(1);
      expect(structured.changes[0]?.id).toBe("response-property-type-changed");
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      expect(text).toContain("1 breaking");

      const escaped = await client.callTool({
        name: "diff_specs",
        arguments: { before: { path: "../a.json" }, after: { path: "b.json" } },
      });
      expect(escaped.isError).toBe(true);

      const rules = await client.callTool({ name: "list_rules", arguments: {} });
      expect((rules.structuredContent as { rules: unknown[] }).rules.length).toBeGreaterThan(100);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
