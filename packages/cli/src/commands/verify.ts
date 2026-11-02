import { flag, flagAll, hasFlag, intFlag, type ParsedArgs, rejectUnknownFlags } from "../args.js";
import { type CliIo, commonOptions, withFlags } from "../context.js";
import {
  type FilledRequest,
  type Observation,
  type PlannedRequest,
  plan,
  renderVerifyMarkdown,
  renderVerifyText,
  type VerifyResult,
  verify,
} from "../core-verify.js";
import { EXIT_OK, EXIT_THRESHOLD, InputError, UsageError } from "../errors.js";
import {
  type BuiltRequest,
  buildRequest,
  executeRequests,
  parseHeaderFlags,
  type RequestFailure,
} from "../executor.js";
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
  "methods",
  "only-filled",
  "max-requests",
  "delay-ms",
  "user-agent",
  "continue-on-error",
);
/** Boolean flags of the run command, registered with the parser by cli.ts. */
export const RUN_BOOLEANS: ReadonlySet<string> = new Set(["only-filled", "continue-on-error"]);
const VERIFY_FLAGS = withFlags("observations");

export interface Skipped {
  operationKey: string;
  missing: string[];
}

export async function planCommand(args: ParsedArgs, io: CliIo): Promise<number> {
  rejectUnknownFlags(args, PLAN_FLAGS);
  const [specPath, extra] = args.positionals;
  if (specPath === undefined || extra !== undefined)
    throw new UsageError("usage: apidrifter plan <spec>");
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
    throw new UsageError("usage: apidrifter run <spec> --base-url <url> [--plan filled.json]");
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
  // Several filled entries for one operation mean several observations of it.
  const filledByKey = new Map<string, FilledRequest[]>();
  for (const f of filled) {
    const list = filledByKey.get(f.operationKey) ?? [];
    list.push(f);
    filledByKey.set(f.operationKey, list);
  }
  const methods = flag(args, "methods")
    ?.split(",")
    .map((m) => m.trim().toUpperCase())
    .filter((m) => m.length > 0);
  const onlyFilled = hasFlag(args, "only-filled");
  const maxRequests = intFlag(args, "max-requests", Number.MAX_SAFE_INTEGER);

  const skipped: Skipped[] = [];
  const requests: BuiltRequest[] = [];
  const plannedByKey = new Map(planned.map((p) => [p.operationKey, p] as const));
  const allowed = (p: PlannedRequest) =>
    methods === undefined || methods.includes(p.method.toUpperCase());
  const add = (p: PlannedRequest, entry: FilledRequest | undefined) => {
    const built = buildRequest(p, entry, baseCheck.url.href, headers);
    if (built.ok) requests.push(built.request);
    else skipped.push({ operationKey: p.operationKey, missing: built.missing });
  };
  if (onlyFilled) {
    // The filled plan's order is the caller's priority; it decides what a budget keeps.
    for (const entry of filled) {
      const p = plannedByKey.get(entry.operationKey);
      if (p === undefined || !allowed(p)) continue;
      add(p, entry);
    }
  } else {
    for (const p of planned) {
      if (!allowed(p)) continue;
      for (const entry of filledByKey.get(p.operationKey) ?? [undefined]) add(p, entry);
    }
  }
  const budgeted = requests.slice(0, maxRequests);
  const overBudget = requests.length - budgeted.length;

  const failures: RequestFailure[] = [];
  const userAgent = flag(args, "user-agent");
  const observations = await executeRequests(budgeted, {
    timeoutMs,
    maxBodyBytes,
    redact,
    delayMs: intFlag(args, "delay-ms", 0),
    continueOnError: hasFlag(args, "continue-on-error"),
    failures,
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(io.fetchImpl === undefined ? {} : { fetchImpl: io.fetchImpl }),
  });
  const observationsOut = flag(args, "observations-out");
  if (observationsOut !== undefined) {
    await writeTextFile(observationsOut, io.cwd, `${JSON.stringify(observations, null, 2)}\n`);
  }

  const result = await verify(spec, observations, { config });
  io.stdout(await renderVerify(result, format, skipped, failures, overBudget));
  return exceeds(result.summary, level) ? EXIT_THRESHOLD : EXIT_OK;
}

export async function verifyCommand(args: ParsedArgs, io: CliIo): Promise<number> {
  rejectUnknownFlags(args, VERIFY_FLAGS);
  const [specPath, extra] = args.positionals;
  const observationsPath = flag(args, "observations");
  if (specPath === undefined || extra !== undefined || observationsPath === undefined) {
    throw new UsageError("usage: apidrifter verify <spec> --observations <file>");
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
  failures: RequestFailure[] = [],
  overBudget = 0,
): Promise<string> {
  if (format === "json") {
    return `${JSON.stringify({ ...result, skipped, failures, overBudget }, null, 2)}\n`;
  }
  const body =
    format === "markdown" ? await renderVerifyMarkdown(result) : await renderVerifyText(result);
  const md = format === "markdown";
  const sections: string[] = [];
  if (skipped.length > 0) {
    const lines = skipped.map((s) =>
      md
        ? `- skipped \`${s.operationKey}\`: missing values for ${s.missing.join(", ")}`
        : `skipped ${s.operationKey}: missing values for ${s.missing.join(", ")}`,
    );
    sections.push(`${md ? `\n### Skipped (${skipped.length})\n\n` : "\n"}${lines.join("\n")}\n`);
  }
  if (failures.length > 0) {
    const lines = failures.map((f) =>
      md
        ? `- failed \`${f.method} ${f.path}\`: ${f.reason}`
        : `failed ${f.method} ${f.path}: ${f.reason}`,
    );
    sections.push(
      `${md ? `\n### Failed requests (${failures.length})\n\n` : "\n"}${lines.join("\n")}\n`,
    );
  }
  if (overBudget > 0) {
    sections.push(`${md ? "\n" : "\n"}${overBudget} request(s) not sent: over --max-requests\n`);
  }
  return `${body}${sections.join("")}`;
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
