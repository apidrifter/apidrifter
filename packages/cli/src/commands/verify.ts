import { flag, flagAll, intFlag, type ParsedArgs, rejectUnknownFlags } from "../args.js";
import { type CliIo, commonOptions, withFlags } from "../context.js";
import {
  type FilledRequest,
  type Observation,
  plan,
  renderVerifyMarkdown,
  renderVerifyText,
  type VerifyResult,
  verify,
} from "../core-verify.js";
import { EXIT_OK, EXIT_THRESHOLD, InputError, UsageError } from "../errors.js";
import { buildRequest, executeRequests, parseHeaderFlags } from "../executor.js";
import { loadDocument, loadJsonFile, writeTextFile } from "../io.js";
import { exceeds, type Format } from "../output.js";
import { checkUrl } from "../url-policy.js";

const PLAN_FLAGS = withFlags("out");
const RUN_FLAGS = withFlags(
  "base-url",
  "plan",
  "header",
  "bearer-env",
  "max-body-bytes",
  "observations-out",
);
const VERIFY_FLAGS = withFlags("observations");

export interface Skipped {
  operationKey: string;
  missing: string[];
}

export async function planCommand(args: ParsedArgs, io: CliIo): Promise<number> {
  rejectUnknownFlags(args, PLAN_FLAGS);
  const [specPath, extra] = args.positionals;
  if (specPath === undefined || extra !== undefined)
    throw new UsageError("usage: driftwatch plan <spec>");
  const spec = await loadDocument(specPath, { cwd: io.cwd, fetch: fetchOpts(args, io) });
  const planned = await plan(spec);
  const text = `${JSON.stringify(planned, null, 2)}\n`;
  const out = flag(args, "out");
  if (out === undefined) io.stdout(text);
  else {
    await writeTextFile(out, io.cwd, text);
    io.stderr(`wrote plan with ${planned.length} requests to ${out}\n`);
  }
  return EXIT_OK;
}

export async function runCommand(args: ParsedArgs, io: CliIo): Promise<number> {
  rejectUnknownFlags(args, RUN_FLAGS);
  const [specPath, extra] = args.positionals;
  if (specPath === undefined || extra !== undefined) {
    throw new UsageError("usage: driftwatch run <spec> --base-url <url> [--plan filled.json]");
  }
  const baseUrlRaw = flag(args, "base-url");
  if (baseUrlRaw === undefined) throw new UsageError("--base-url is required");
  const baseCheck = checkUrl(baseUrlRaw);
  if (!baseCheck.ok) throw new InputError(baseCheck.reason);

  const { format, level, config } = await commonOptions(args, io);
  const timeoutMs = intFlag(args, "timeout", 30_000);
  const maxBodyBytes = intFlag(args, "max-body-bytes", 8 * 1024 * 1024);

  const spec = await loadDocument(specPath, { cwd: io.cwd, fetch: fetchOpts(args, io) });
  const planned = await plan(spec);

  const headers = parseHeaderFlags(flagAll(args, "header"));
  const bearerEnv = flag(args, "bearer-env");
  if (bearerEnv !== undefined) {
    const token = io.env[bearerEnv];
    if (token === undefined || token.length === 0) {
      throw new InputError(`environment variable ${bearerEnv} is not set`);
    }
    headers["authorization"] = `Bearer ${token}`;
  }
  const redact = new Set(Object.keys(headers));

  const filledPath = flag(args, "plan");
  const filled = filledPath === undefined ? [] : await loadFilled(filledPath, io);
  const filledByKey = new Map(filled.map((f) => [f.operationKey, f] as const));

  const skipped: Skipped[] = [];
  const requests = [];
  for (const p of planned) {
    const built = buildRequest(p, filledByKey.get(p.operationKey), baseCheck.url.href, headers);
    if (built.ok) requests.push(built.request);
    else skipped.push({ operationKey: p.operationKey, missing: built.missing });
  }

  const observations = await executeRequests(requests, {
    timeoutMs,
    maxBodyBytes,
    redact,
    ...(io.fetchImpl === undefined ? {} : { fetchImpl: io.fetchImpl }),
  });
  const observationsOut = flag(args, "observations-out");
  if (observationsOut !== undefined) {
    await writeTextFile(observationsOut, io.cwd, `${JSON.stringify(observations, null, 2)}\n`);
  }

  const result = await verify(spec, observations, { config });
  io.stdout(await renderVerify(result, format, skipped));
  return exceeds(result.summary, level) ? EXIT_THRESHOLD : EXIT_OK;
}

export async function verifyCommand(args: ParsedArgs, io: CliIo): Promise<number> {
  rejectUnknownFlags(args, VERIFY_FLAGS);
  const [specPath, extra] = args.positionals;
  const observationsPath = flag(args, "observations");
  if (specPath === undefined || extra !== undefined || observationsPath === undefined) {
    throw new UsageError("usage: driftwatch verify <spec> --observations <file>");
  }
  const { format, level, config } = await commonOptions(args, io);
  const spec = await loadDocument(specPath, { cwd: io.cwd, fetch: fetchOpts(args, io) });
  const observations = await loadObservations(observationsPath, io);
  const result = await verify(spec, observations, { config });
  io.stdout(await renderVerify(result, format, []));
  return exceeds(result.summary, level) ? EXIT_THRESHOLD : EXIT_OK;
}

export async function renderVerify(
  result: VerifyResult,
  format: Format,
  skipped: Skipped[],
): Promise<string> {
  if (format === "json") return `${JSON.stringify({ ...result, skipped }, null, 2)}\n`;
  const body =
    format === "markdown" ? await renderVerifyMarkdown(result) : await renderVerifyText(result);
  if (skipped.length === 0) return body;
  const lines = skipped.map((s) =>
    format === "markdown"
      ? `- skipped \`${s.operationKey}\`: missing values for ${s.missing.join(", ")}`
      : `skipped ${s.operationKey}: missing values for ${s.missing.join(", ")}`,
  );
  const heading = format === "markdown" ? `\n### Skipped (${skipped.length})\n\n` : "\n";
  return `${body}${heading}${lines.join("\n")}\n`;
}

function fetchOpts(args: ParsedArgs, io: CliIo) {
  return {
    timeoutMs: intFlag(args, "timeout", 30_000),
    ...(io.fetchImpl === undefined ? {} : { fetchImpl: io.fetchImpl }),
  };
}

async function loadFilled(path: string, io: CliIo): Promise<FilledRequest[]> {
  const raw = await loadJsonFile(path, io.cwd);
  const list = Array.isArray(raw)
    ? raw
    : isObject(raw) && Array.isArray(raw["requests"])
      ? raw["requests"]
      : undefined;
  if (list === undefined) throw new InputError(`${path}: expected an array of filled requests`);
  return list.map((item, i) => {
    if (!isObject(item) || typeof item["operationKey"] !== "string") {
      throw new InputError(`${path}: entry ${i} needs an operationKey`);
    }
    return item as unknown as FilledRequest;
  });
}

async function loadObservations(path: string, io: CliIo): Promise<Observation[]> {
  const raw = await loadJsonFile(path, io.cwd);
  const list = Array.isArray(raw)
    ? raw
    : isObject(raw) && Array.isArray(raw["observations"])
      ? raw["observations"]
      : undefined;
  if (list === undefined) throw new InputError(`${path}: expected an array of observations`);
  return list.map((item, i) => {
    if (!isObject(item) || !isObject(item["request"]) || !isObject(item["response"])) {
      throw new InputError(`${path}: entry ${i} needs request and response objects`);
    }
    return item as unknown as Observation;
  });
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
