import { DriftwatchError } from "@driftwatch/core";
import { hasFlag, type ParsedArgs, parseArgs } from "./args.js";
import { breakingCommand, changelogCommand, diffCommand } from "./commands/diff.js";
import { MCP_BOOLEANS, mcpDiffCommand, mcpSnapshotCommand } from "./commands/mcp.js";
import { planCommand, RUN_BOOLEANS, runCommand, verifyCommand } from "./commands/verify.js";
import type { CliIo } from "./context.js";
import { EXIT_ENGINE, EXIT_OK, EXIT_USAGE, InputError, UsageError } from "./errors.js";
import { serveCommand } from "./serve.js";
import { VERSION } from "./version.js";

export const HELP = `driftwatch ${VERSION}

Usage:
  driftwatch diff <before> <after>            all changes between two specs or MCP snapshots
  driftwatch breaking <before> <after>        breaking changes only (exit 1 if any)
  driftwatch changelog <before> <after>       markdown changelog
  driftwatch mcp snapshot <url> [--out f]     snapshot a remote MCP server
  driftwatch mcp snapshot --stdio -- <cmd>    snapshot a local stdio MCP server
  driftwatch mcp diff <snapshot> <url|file>   diff a snapshot against a server or snapshot
  driftwatch plan <spec> [--out f]            requests the spec implies, with slots to fill
  driftwatch run <spec> --base-url <url>      execute requests, verify responses, report
  driftwatch verify <spec> --observations f   verify recorded observations
  driftwatch serve                            run as an MCP server over stdio

Inputs are file paths or https:// URLs (http:// only for localhost).

Common options:
  --format json|markdown|text   default: text on a terminal, json otherwise
  --config <file>               driftwatch.config.json or .driftwatch.yaml (auto-loaded from cwd)
  --fail-on breaking|warning|info   exit 1 at or above this level (default breaking)
  --timeout <ms>                network timeout (default 30000)
  --kind openapi|mcp            force the document kind for diff/breaking/changelog

mcp options:
  --out <file>                  write the snapshot to a file instead of stdout
  --stdio                       spawn the command after -- as a stdio server
  --env KEY=VALUE               environment for the spawned server (repeatable; PATH and HOME are passed)

run options:
  --plan <file>                 filled requests (array of {operationKey, values, body, headers})
  --header "Name: value"        extra request header (repeatable, redacted in observations)
  --bearer-env VAR              send Authorization: Bearer from an environment variable
  --max-body-bytes <n>          response body cap (default 8388608)
  --observations-out <file>     write redacted observations

Exit codes: 0 ok, 1 threshold exceeded, 2 usage or input error, 3 engine refused a document.
`;

const GLOBAL_BOOLEANS: ReadonlySet<string> = new Set([
  "help",
  "version",
  ...MCP_BOOLEANS,
  ...RUN_BOOLEANS,
]);

export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv, GLOBAL_BOOLEANS);
  } catch (err) {
    return report(err, io);
  }
  if (hasFlag(args, "version")) {
    io.stdout(`${VERSION}\n`);
    return EXIT_OK;
  }
  const [command, ...restPositionals] = args.positionals;
  if (command === undefined || hasFlag(args, "help") || command === "help") {
    io.stdout(HELP);
    return command === undefined && !hasFlag(args, "help") ? EXIT_USAGE : EXIT_OK;
  }
  const sub: ParsedArgs = { ...args, positionals: restPositionals };
  try {
    switch (command) {
      case "diff":
        return await diffCommand(sub, io);
      case "breaking":
        return await breakingCommand(sub, io);
      case "changelog":
        return await changelogCommand(sub, io);
      case "plan":
        return await planCommand(sub, io);
      case "run":
        return await runCommand(sub, io);
      case "verify":
        return await verifyCommand(sub, io);
      case "serve":
        return await serveCommand(io);
      case "mcp": {
        const [mcpCommand, ...mcpPositionals] = sub.positionals;
        const mcpArgs: ParsedArgs = { ...sub, positionals: mcpPositionals };
        if (mcpCommand === "snapshot") return await mcpSnapshotCommand(mcpArgs, io);
        if (mcpCommand === "diff") return await mcpDiffCommand(mcpArgs, io);
        throw new UsageError("usage: driftwatch mcp <snapshot|diff> ...");
      }
      default:
        throw new UsageError(`unknown command ${command}; run driftwatch --help`);
    }
  } catch (err) {
    return report(err, io);
  }
}

function report(err: unknown, io: CliIo): number {
  if (err instanceof UsageError || err instanceof InputError) {
    io.stderr(`driftwatch: ${err.message}\n`);
    return EXIT_USAGE;
  }
  if (err instanceof DriftwatchError) {
    io.stderr(`driftwatch: ${err.code}: ${err.message}\n`);
    return EXIT_ENGINE;
  }
  const message = err instanceof Error ? err.message : String(err);
  io.stderr(`driftwatch: unexpected error: ${message}\n`);
  return EXIT_ENGINE;
}

export function defaultIo(): CliIo {
  return {
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    isTTY: process.stdout.isTTY === true,
    cwd: process.cwd(),
    env: process.env,
  };
}
