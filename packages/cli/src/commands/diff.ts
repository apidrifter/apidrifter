import { type DiffResult, diff, renderMarkdown } from "@apidrifter/core";
import { flag, intFlag, type ParsedArgs, rejectUnknownFlags } from "../args.js";
import { type CliIo, commonOptions, withFlags } from "../context.js";
import { EXIT_OK, EXIT_THRESHOLD, UsageError } from "../errors.js";
import { loadDocument } from "../io.js";
import { breakingOnly, exceeds, renderDiff } from "../output.js";

const FLAGS = withFlags("kind");

async function loadPair(args: ParsedArgs, io: CliIo, command: string): Promise<DiffResult> {
  rejectUnknownFlags(args, FLAGS);
  const [before, after, extra] = args.positionals;
  if (before === undefined || after === undefined || extra !== undefined) {
    throw new UsageError(`usage: apidrifter ${command} <before> <after>`);
  }
  const { config } = await commonOptions(args, io);
  const timeoutMs = intFlag(args, "timeout", 30_000);
  const fetchOpts = {
    timeoutMs,
    ...(io.fetchImpl === undefined ? {} : { fetchImpl: io.fetchImpl }),
  };
  const [b, a] = await Promise.all([
    loadDocument(before, { cwd: io.cwd, fetch: fetchOpts }),
    loadDocument(after, { cwd: io.cwd, fetch: fetchOpts }),
  ]);
  const kindRaw = flag(args, "kind");
  if (kindRaw !== undefined && kindRaw !== "openapi" && kindRaw !== "mcp") {
    throw new UsageError("--kind must be openapi or mcp");
  }
  return diff(b, a, { config, ...(kindRaw === undefined ? {} : { kind: kindRaw }) });
}

export async function diffCommand(args: ParsedArgs, io: CliIo): Promise<number> {
  const result = await loadPair(args, io, "diff");
  const { format, level, footer } = await commonOptions(args, io);
  io.stdout(renderDiff(result, format, footer));
  return exceeds(result.summary, level) ? EXIT_THRESHOLD : EXIT_OK;
}

export async function breakingCommand(args: ParsedArgs, io: CliIo): Promise<number> {
  const result = breakingOnly(await loadPair(args, io, "breaking"));
  const { format, footer } = await commonOptions(args, io);
  io.stdout(renderDiff(result, format, footer));
  return result.hasBreaking ? EXIT_THRESHOLD : EXIT_OK;
}

export async function changelogCommand(args: ParsedArgs, io: CliIo): Promise<number> {
  const result = await loadPair(args, io, "changelog");
  const { level, footer } = await commonOptions(args, io);
  io.stdout(renderMarkdown(result, { footer }));
  return exceeds(result.summary, level) ? EXIT_THRESHOLD : EXIT_OK;
}
