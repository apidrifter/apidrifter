import { readFile } from "node:fs/promises";
import { type DiffResult, diff, listRules, renderMarkdown } from "@apidrifter/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { CliIo } from "./context.js";
import {
  type FilledRequest,
  type Observation,
  plan,
  type VerifyResult,
  verify,
} from "./core-verify.js";
import { InputError } from "./errors.js";
import { buildRequest, executeRequests } from "./executor.js";
import { fetchText } from "./fetch-text.js";
import { formatFromName, parseText, resolveInside } from "./io.js";
import { httpTarget, snapshotMcp } from "./mcp-client.js";
import { breakingOnly } from "./output.js";
import { checkUrl } from "./url-policy.js";
import { VERSION } from "./version.js";

/**
 * `apidrifter serve`: the same engine as an MCP server over stdio, so an agent can drive
 * the diff and verify loop from any client. Paths are confined to the working directory,
 * URLs go through the same policy as the CLI, and summaries carry counts and IDs only;
 * third-party text stays inside the structured result.
 */

const docInput = z
  .object({
    path: z.string().optional().describe("File path, relative to the server's working directory"),
    url: z.string().optional().describe("https:// URL (http:// only for localhost)"),
    content: z.string().optional().describe("Inline JSON or YAML text"),
  })
  .describe("Exactly one of path, url or content");

type DocInput = z.infer<typeof docInput>;

const filledRequest = z.object({
  operationKey: z.string(),
  values: z.record(z.string(), z.unknown()).optional(),
  mediaType: z.string().optional(),
  body: z.unknown().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

const observation = z.object({
  id: z.string().optional(),
  operationKey: z.string().optional(),
  request: z.object({
    method: z.string(),
    path: z.string(),
    query: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    mediaType: z.string().optional(),
    body: z.unknown().optional(),
  }),
  response: z.object({
    status: z.number().int(),
    headers: z.record(z.string(), z.string()).optional(),
    mediaType: z.string().optional(),
    body: z.unknown().optional(),
  }),
  capturedAt: z.string().optional(),
});

export interface ServeOptions {
  cwd: string;
  fetchImpl?: typeof fetch;
  env: Record<string, string | undefined>;
}

export async function loadDocInput(input: DocInput, options: ServeOptions): Promise<unknown> {
  const given = [input.path, input.url, input.content].filter((v) => v !== undefined).length;
  if (given !== 1) throw new InputError("give exactly one of path, url or content");
  if (input.content !== undefined) return parseText(input.content, "auto", "content");
  if (input.url !== undefined) {
    const check = checkUrl(input.url);
    if (!check.ok) throw new InputError(check.reason);
    const text = await fetchText(
      input.url,
      options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl },
    );
    return parseText(text, formatFromName(check.url.pathname), input.url);
  }
  const path = resolveInside(options.cwd, input.path ?? "");
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new InputError(`file not found: ${input.path ?? ""}`);
  }
  return parseText(text, formatFromName(path), input.path ?? "");
}

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function ok(summary: string, result: unknown): ToolResult {
  return {
    content: [{ type: "text", text: summary }],
    structuredContent: result as Record<string, unknown>,
  };
}

function fail(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : "unknown error";
  return { content: [{ type: "text", text: message }], isError: true };
}

function diffSummary(r: DiffResult): string {
  const ids = [...new Set(r.changes.map((c) => c.id))].slice(0, 20).join(", ");
  return `${r.kind}: ${r.summary.breaking} breaking, ${r.summary.warning} warning, ${r.summary.info} info${ids ? `; rules: ${ids}` : ""}`;
}

function verifySummary(r: VerifyResult): string {
  const ids = [...new Set(r.findings.map((f) => f.id))].slice(0, 20).join(", ");
  return `${r.summary.breaking} breaking, ${r.summary.warning} warning, ${r.summary.info} info; ${r.coverage.observed}/${r.coverage.operations} operations observed${ids ? `; findings: ${ids}` : ""}`;
}

export function createServer(options: ServeOptions): McpServer {
  const server = new McpServer({ name: "apidrifter", version: VERSION });

  const runDiff = async (before: DocInput, after: DocInput, kind?: "openapi" | "mcp") => {
    const [b, a] = await Promise.all([loadDocInput(before, options), loadDocInput(after, options)]);
    return diff(b, a, kind === undefined ? {} : { kind });
  };

  const pairInput = {
    before: docInput,
    after: docInput,
    kind: z.enum(["openapi", "mcp"]).optional(),
  };

  server.registerTool(
    "diff_specs",
    {
      description:
        "Diff two OpenAPI documents or MCP snapshots; every change with severity, stable rule ID and location.",
      inputSchema: pairInput,
    },
    async ({ before, after, kind }) => {
      try {
        const r = await runDiff(before, after, kind);
        return ok(diffSummary(r), r);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "breaking_changes",
    { description: "Only the breaking changes between two documents.", inputSchema: pairInput },
    async ({ before, after, kind }) => {
      try {
        const r = breakingOnly(await runDiff(before, after, kind));
        return ok(diffSummary(r), r);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "changelog",
    { description: "Markdown changelog between two documents.", inputSchema: pairInput },
    async ({ before, after, kind }) => {
      try {
        const r = await runDiff(before, after, kind);
        return ok(diffSummary(r), { markdown: renderMarkdown(r), result: r });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "mcp_snapshot",
    {
      description:
        "Connect to a remote MCP server over Streamable HTTP and snapshot its tools, resources and prompts.",
      inputSchema: { url: z.string(), timeoutMs: z.number().int().positive().optional() },
    },
    async ({ url, timeoutMs }) => {
      try {
        const snapshot = await snapshotMcp(httpTarget(url), { timeoutMs: timeoutMs ?? 30_000 });
        return ok(
          `${snapshot.tools?.length ?? 0} tools, ${snapshot.resources?.length ?? 0} resources, ${snapshot.prompts?.length ?? 0} prompts`,
          snapshot,
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "mcp_diff",
    {
      description: "Diff a saved MCP snapshot against a live server (by URL) or another snapshot.",
      inputSchema: {
        snapshot: docInput,
        target: z.union([z.object({ url: z.string() }), docInput]),
        timeoutMs: z.number().int().positive().optional(),
      },
    },
    async ({ snapshot, target, timeoutMs }) => {
      try {
        const before = await loadDocInput(snapshot, options);
        const after =
          "url" in target &&
          target.url !== undefined &&
          !("path" in target) &&
          !("content" in target)
            ? await snapshotMcp(httpTarget(target.url), { timeoutMs: timeoutMs ?? 30_000 })
            : await loadDocInput(target as DocInput, options);
        const r = diff(before, after, { kind: "mcp" });
        return ok(diffSummary(r), r);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "plan_requests",
    {
      description:
        "Requests the spec implies, with the parameter and body slots a caller must fill.",
      inputSchema: { spec: docInput },
    },
    async ({ spec }) => {
      try {
        const planned = await plan(await loadDocInput(spec, options));
        return ok(`${planned.length} operations planned`, { requests: planned });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "run_requests",
    {
      description:
        "Execute planned requests against a base URL using the filled values, then verify responses against the spec.",
      inputSchema: {
        spec: docInput,
        baseUrl: z.string(),
        filled: z.array(filledRequest).optional(),
        headers: z.record(z.string(), z.string()).optional(),
        bearerEnv: z
          .string()
          .optional()
          .describe(
            "Name of an environment variable holding a bearer token; never pass the token itself",
          ),
        timeoutMs: z.number().int().positive().optional(),
        maxBodyBytes: z.number().int().positive().optional(),
      },
    },
    async ({ spec, baseUrl, filled, headers, bearerEnv, timeoutMs, maxBodyBytes }) => {
      try {
        const base = checkUrl(baseUrl);
        if (!base.ok) throw new InputError(base.reason);
        const specDoc = await loadDocInput(spec, options);
        const planned = await plan(specDoc);
        const extra: Record<string, string> = {};
        for (const [k, v] of Object.entries(headers ?? {})) extra[k.toLowerCase()] = v;
        if (bearerEnv !== undefined) {
          const token = options.env[bearerEnv];
          if (token === undefined || token.length === 0)
            throw new InputError(`environment variable ${bearerEnv} is not set`);
          extra["authorization"] = `Bearer ${token}`;
        }
        const byKey = new Map(
          (filled ?? []).map((f) => [f.operationKey, f as FilledRequest] as const),
        );
        const requests = [];
        const skipped: Array<{ operationKey: string; missing: string[] }> = [];
        for (const p of planned) {
          const built = buildRequest(p, byKey.get(p.operationKey), base.url.href, extra);
          if (built.ok) requests.push(built.request);
          else skipped.push({ operationKey: p.operationKey, missing: built.missing });
        }
        const observations = await executeRequests(requests, {
          timeoutMs: timeoutMs ?? 30_000,
          maxBodyBytes: maxBodyBytes ?? 8 * 1024 * 1024,
          redact: new Set(Object.keys(extra)),
          ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        });
        const result = await verify(specDoc, observations);
        return ok(`${verifySummary(result)}; ${skipped.length} skipped`, {
          ...result,
          skipped,
          observations,
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "verify_observations",
    {
      description: "Verify recorded request/response observations against a spec.",
      inputSchema: { spec: docInput, observations: z.union([z.array(observation), docInput]) },
    },
    async ({ spec, observations: obsInput }) => {
      try {
        const specDoc = await loadDocInput(spec, options);
        let observations: Observation[];
        if (Array.isArray(obsInput)) observations = obsInput as Observation[];
        else {
          const loaded = await loadDocInput(obsInput, options);
          if (!Array.isArray(loaded))
            throw new InputError("observations document must be an array");
          observations = loaded as Observation[];
        }
        const result = await verify(specDoc, observations);
        return ok(verifySummary(result), result);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "list_rules",
    { description: "Every change rule ID with its default severity and meaning.", inputSchema: {} },
    async () => {
      const rules = listRules();
      return ok(`${rules.length} rules`, { rules });
    },
  );

  return server;
}

export async function serveCommand(io: CliIo): Promise<number> {
  const server = createServer({
    cwd: io.cwd,
    env: io.env,
    ...(io.fetchImpl === undefined ? {} : { fetchImpl: io.fetchImpl }),
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
  });
  return 0;
}
