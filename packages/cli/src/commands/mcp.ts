import { diff } from "@apidrifter/core";
import { flag, flagAll, hasFlag, intFlag, type ParsedArgs, rejectUnknownFlags } from "../args.js";
import { type CliIo, commonOptions, withFlags } from "../context.js";
import { EXIT_OK, EXIT_THRESHOLD, UsageError } from "../errors.js";
import { loadDocument, writeTextFile } from "../io.js";
import { httpTarget, type McpTarget, snapshotMcp, stdioTarget } from "../mcp-client.js";
import { exceeds, renderDiff } from "../output.js";
import { isUrlLike } from "../url-policy.js";

const SNAPSHOT_FLAGS = withFlags("out", "stdio", "env");
const DIFF_FLAGS = withFlags("stdio", "env");
export const MCP_BOOLEANS: ReadonlySet<string> = new Set(["stdio"]);

function targetFrom(positional: string | undefined, args: ParsedArgs, io: CliIo): McpTarget {
  if (hasFlag(args, "stdio")) {
    if (positional !== undefined) {
      throw new UsageError("with --stdio, give the server command after --, not as an argument");
    }
    return stdioTarget(args.rest, flagAll(args, "env"), io.env);
  }
  if (positional === undefined)
    throw new UsageError("missing MCP server URL (or use --stdio -- <command>)");
  return httpTarget(positional);
}

export async function mcpSnapshotCommand(args: ParsedArgs, io: CliIo): Promise<number> {
  rejectUnknownFlags(args, SNAPSHOT_FLAGS);
  const [positional, extra] = args.positionals;
  if (extra !== undefined)
    throw new UsageError("usage: apidrifter mcp snapshot <url> | --stdio -- <command>");
  const target = targetFrom(positional, args, io);
  const snapshot = await snapshotMcp(target, { timeoutMs: intFlag(args, "timeout", 30_000) });
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  const out = flag(args, "out");
  if (out === undefined) io.stdout(text);
  else {
    await writeTextFile(out, io.cwd, text);
    io.stderr(`wrote snapshot with ${snapshot.tools?.length ?? 0} tools to ${out}\n`);
  }
  return EXIT_OK;
}

export async function mcpDiffCommand(args: ParsedArgs, io: CliIo): Promise<number> {
  rejectUnknownFlags(args, DIFF_FLAGS);
  const [snapshotPath, second, extra] = args.positionals;
  if (snapshotPath === undefined || extra !== undefined) {
    throw new UsageError(
      "usage: apidrifter mcp diff <snapshot> <url | snapshot> | --stdio -- <command>",
    );
  }
  const before = await loadDocument(snapshotPath, { cwd: io.cwd });
  let after: unknown;
  if (!hasFlag(args, "stdio") && second !== undefined && !isUrlLike(second)) {
    after = await loadDocument(second, { cwd: io.cwd });
  } else {
    after = await snapshotMcp(targetFrom(second, args, io), {
      timeoutMs: intFlag(args, "timeout", 30_000),
    });
  }
  const { format, level, config } = await commonOptions(args, io);
  const result = diff(before, after, { kind: "mcp", config });
  io.stdout(renderDiff(result, format));
  return exceeds(result.summary, level) ? EXIT_THRESHOLD : EXIT_OK;
}
