import type { McpSnapshotDocument } from "@apidrifter/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InputError, UsageError } from "./errors.js";
import { errorMessage } from "./fetch-text.js";
import { checkUrl } from "./url-policy.js";
import { VERSION } from "./version.js";

export type McpTarget =
  | { kind: "http"; url: URL }
  | { kind: "stdio"; command: string; args: string[]; env: Record<string, string> };

export interface SnapshotOptions {
  timeoutMs: number;
  now?: () => string;
}

/** JSON-RPC "method not found"; servers without a capability answer this way. */
const METHOD_NOT_FOUND = -32601;

/** Build a stdio target from `-- <command> [args...]` and `--env KEY=VALUE` flags. */
export function stdioTarget(
  rest: readonly string[],
  envFlags: readonly string[],
  processEnv: Record<string, string | undefined>,
): McpTarget {
  const [command, ...args] = rest;
  if (command === undefined || command.length === 0) {
    throw new UsageError("--stdio requires a command after --, e.g. --stdio -- npx my-server");
  }
  const env: Record<string, string> = {};
  for (const key of ["PATH", "HOME"]) {
    const v = processEnv[key];
    if (v !== undefined) env[key] = v;
  }
  for (const raw of envFlags) {
    const eq = raw.indexOf("=");
    if (eq <= 0) throw new UsageError(`--env must look like KEY=VALUE, got ${JSON.stringify(raw)}`);
    env[raw.slice(0, eq)] = raw.slice(eq + 1);
  }
  return { kind: "stdio", command, args, env };
}

export function httpTarget(raw: string): McpTarget {
  const check = checkUrl(raw);
  if (!check.ok) throw new InputError(check.reason);
  return { kind: "http", url: check.url };
}

/** Connect to an MCP server, list everything it advertises, and disconnect. */
export async function snapshotMcp(
  target: McpTarget,
  options: SnapshotOptions,
): Promise<McpSnapshotDocument> {
  const transport =
    target.kind === "http"
      ? new StreamableHTTPClientTransport(target.url)
      : new StdioClientTransport({
          command: target.command,
          args: target.args,
          env: target.env,
          stderr: "ignore",
        });
  const client = new Client({ name: "apidrifter", version: VERSION });
  const requestOptions = { timeout: options.timeoutMs };
  try {
    try {
      await client.connect(transport, requestOptions);
    } catch (err) {
      throw new InputError(`could not connect to MCP server: ${errorMessage(err)}`);
    }
    const caps = client.getServerCapabilities() ?? {};
    const version = client.getServerVersion();
    const instructions = client.getInstructions();

    const server: NonNullable<McpSnapshotDocument["server"]> = {
      capabilities: caps as Record<string, unknown>,
    };
    if (version?.name !== undefined) server.name = version.name;
    if (version?.version !== undefined) server.version = version.version;
    if (instructions !== undefined) server.instructions = instructions;

    const snapshot: McpSnapshotDocument = {
      apidrifter: 1,
      kind: "mcp",
      capturedAt: (options.now ?? (() => new Date().toISOString()))(),
      server,
      tools: [],
      resources: [],
      resourceTemplates: [],
      prompts: [],
    };

    if (caps.tools !== undefined) {
      snapshot.tools = await paginate(
        (cursor) => client.listTools(cursor === undefined ? undefined : { cursor }, requestOptions),
        (page) => page.tools.map(pickTool),
      );
    }
    if (caps.resources !== undefined) {
      snapshot.resources = await paginate(
        (cursor) =>
          client.listResources(cursor === undefined ? undefined : { cursor }, requestOptions),
        (page) => page.resources.map(pickResource),
      );
      snapshot.resourceTemplates = await paginate(
        (cursor) =>
          client.listResourceTemplates(
            cursor === undefined ? undefined : { cursor },
            requestOptions,
          ),
        (page) => page.resourceTemplates.map(pickTemplate),
      );
    }
    if (caps.prompts !== undefined) {
      snapshot.prompts = await paginate(
        (cursor) =>
          client.listPrompts(cursor === undefined ? undefined : { cursor }, requestOptions),
        (page) => page.prompts.map(pickPrompt),
      );
    }
    return snapshot;
  } finally {
    await client.close().catch(() => undefined);
  }
}

const MAX_PAGES = 1000;

async function paginate<P extends { nextCursor?: string | undefined }, T>(
  fetchPage: (cursor: string | undefined) => Promise<P>,
  pick: (page: P) => T[],
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    let page: P;
    try {
      page = await fetchPage(cursor);
    } catch (err) {
      if (isMethodNotFound(err)) return out;
      throw new InputError(`MCP list request failed: ${errorMessage(err)}`);
    }
    out.push(...pick(page));
    if (page.nextCursor === undefined || page.nextCursor === cursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

function isMethodNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === METHOD_NOT_FOUND) return true;
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && /method not found/i.test(message);
}

type Rec = Record<string, unknown>;

function pickTool(t: Rec): Rec {
  return pick(t, ["name", "title", "description", "inputSchema", "outputSchema", "annotations"]);
}

function pickResource(r: Rec): Rec {
  return pick(r, ["uri", "name", "title", "description", "mimeType"]);
}

function pickTemplate(r: Rec): Rec {
  return pick(r, ["uriTemplate", "name", "title", "description", "mimeType"]);
}

function pickPrompt(p: Rec): Rec {
  return pick(p, ["name", "title", "description", "arguments"]);
}

function pick(obj: Rec, keys: string[]): Rec {
  const out: Rec = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}
