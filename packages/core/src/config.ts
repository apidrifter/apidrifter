import { fingerprint } from "./fingerprint.js";
import { RULES } from "./rules/registry.js";
import type { Change, Config, Severity } from "./types.js";
import { ApidrifterError } from "./types.js";
import { FINDING_RULES } from "./verify/rules.js";

const SEVERITIES: ReadonlySet<string> = new Set(["breaking", "warning", "info", "ignore"]);
const MAX_PATTERN = 256;

function defaultKnownIds(): ReadonlySet<string> {
  return new Set([...RULES.keys(), ...FINDING_RULES.keys()]);
}

/**
 * Validate a config object from an untrusted file. Throws `invalid-config`. `knownIds`
 * defaults to every change rule and finding rule, so one config file serves both diffing
 * and verification.
 */
export function validateConfig(
  raw: unknown,
  knownIds: ReadonlySet<string> = defaultKnownIds(),
): Config {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApidrifterError("invalid-config", "config must be an object");
  }
  const obj = raw as Record<string, unknown>;
  const config: Config = {};
  if (obj["severity"] !== undefined) {
    if (
      typeof obj["severity"] !== "object" ||
      obj["severity"] === null ||
      Array.isArray(obj["severity"])
    ) {
      throw new ApidrifterError("invalid-config", "severity must be an object of rule id to level");
    }
    const sev: Record<string, Severity | "ignore"> = {};
    for (const [id, level] of Object.entries(obj["severity"] as Record<string, unknown>)) {
      if (typeof level !== "string" || !SEVERITIES.has(level)) {
        throw new ApidrifterError(
          "invalid-config",
          `severity for ${id} must be breaking, warning, info or ignore`,
        );
      }
      if (!knownIds.has(id)) throw new ApidrifterError("invalid-config", `unknown rule id ${id}`);
      sev[id] = level as Severity | "ignore";
    }
    config.severity = sev;
  }
  if (obj["ignore"] !== undefined) {
    const ig = obj["ignore"];
    if (typeof ig !== "object" || ig === null || Array.isArray(ig)) {
      throw new ApidrifterError("invalid-config", "ignore must be an object");
    }
    const ignore: NonNullable<Config["ignore"]> = {};
    const igObj = ig as Record<string, unknown>;
    if (igObj["ids"] !== undefined) {
      ignore.ids = stringList(igObj["ids"], "ignore.ids");
      for (const id of ignore.ids)
        if (!knownIds.has(id)) throw new ApidrifterError("invalid-config", `unknown rule id ${id}`);
    }
    if (igObj["subjects"] !== undefined) {
      ignore.subjects = stringList(igObj["subjects"], "ignore.subjects");
      for (const p of ignore.subjects) {
        if (p.length > MAX_PATTERN)
          throw new ApidrifterError("invalid-config", "ignore.subjects pattern too long");
      }
    }
    config.ignore = ignore;
  }
  if (obj["baseline"] !== undefined) config.baseline = stringList(obj["baseline"], "baseline");
  return config;
}

function stringList(v: unknown, name: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) {
    throw new ApidrifterError("invalid-config", `${name} must be a list of strings`);
  }
  return v as string[];
}

/**
 * Compile a subject pattern. `*` matches within a path segment, `**` across segments.
 * The pattern is built from escaped literals and two fixed wildcards, so it cannot
 * backtrack catastrophically.
 */
export function compileSubjectPattern(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i++;
      } else {
        re += "[^/]*";
      }
    } else {
      re += (c ?? "").replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

export interface ApplyResult {
  changes: Change[];
  suppressed: number;
}

/** Apply severity overrides, ignores and baseline. Pure; returns new change objects. */
export function applyConfig(changes: Change[], config: Config): ApplyResult {
  const patterns = (config.ignore?.subjects ?? []).map(compileSubjectPattern);
  const ignoredIds = new Set(config.ignore?.ids ?? []);
  const baseline = new Set(config.baseline ?? []);
  const out: Change[] = [];
  let suppressed = 0;
  for (const change of changes) {
    if (ignoredIds.has(change.id)) {
      suppressed++;
      continue;
    }
    const override = config.severity?.[change.id];
    if (override === "ignore") {
      suppressed++;
      continue;
    }
    const subject = change.location.subject;
    if (subject !== undefined && patterns.some((p) => p.test(subject))) {
      suppressed++;
      continue;
    }
    if (baseline.size > 0 && baseline.has(fingerprint(change))) {
      suppressed++;
      continue;
    }
    out.push(override === undefined ? change : { ...change, severity: override });
  }
  return { changes: out, suppressed };
}
