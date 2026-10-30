/**
 * The verify engine (`plan`, `verify` and its renderers) is being implemented in core on a
 * parallel branch against the same contract. This module is the only place the CLI touches
 * those names, and it resolves them lazily so the rest of the CLI loads and works without
 * them. A static named import would fail at module link time and take `diff` down with it.
 *
 * MERGE NOTE: when core exports plan/verify/renderVerifyMarkdown/renderVerifyText, replace
 * the body of `api()` with `return await import("@driftwatch/core")` typed as VerifyApi
 * (or static imports), and delete verify-types.ts (see its header).
 */
import type { Limits } from "@driftwatch/core";
import { InputError } from "./errors.js";
import type { Observation, PlannedRequest, VerifyOptions, VerifyResult } from "./verify-types.js";

export type {
  FilledRequest,
  Finding,
  Observation,
  PlannedParameter,
  PlannedRequest,
  VerifyOptions,
  VerifyResult,
} from "./verify-types.js";

interface VerifyApi {
  plan: (spec: unknown, options?: { limits?: Partial<Limits> }) => PlannedRequest[];
  verify: (spec: unknown, observations: Observation[], options?: VerifyOptions) => VerifyResult;
  renderVerifyMarkdown: (result: VerifyResult) => string;
  renderVerifyText: (result: VerifyResult) => string;
}

const NAMES = ["plan", "verify", "renderVerifyMarkdown", "renderVerifyText"] as const;

let cached: VerifyApi | undefined;

async function api(): Promise<VerifyApi> {
  if (cached !== undefined) return cached;
  const mod = (await import("@driftwatch/core")) as unknown as Partial<VerifyApi>;
  const missing = NAMES.filter((k) => typeof mod[k] !== "function");
  if (missing.length > 0) {
    throw new InputError(
      `this build of @driftwatch/core does not include the verify engine (missing ${missing.join(", ")})`,
    );
  }
  cached = mod as VerifyApi;
  return cached;
}

export async function plan(
  spec: unknown,
  options?: { limits?: Partial<Limits> },
): Promise<PlannedRequest[]> {
  return (await api()).plan(spec, options);
}

export async function verify(
  spec: unknown,
  observations: Observation[],
  options?: VerifyOptions,
): Promise<VerifyResult> {
  return (await api()).verify(spec, observations, options);
}

export async function renderVerifyMarkdown(result: VerifyResult): Promise<string> {
  return (await api()).renderVerifyMarkdown(result);
}

export async function renderVerifyText(result: VerifyResult): Promise<string> {
  return (await api()).renderVerifyText(result);
}

/** Availability check, for callers that want to fail early with a clear message. */
export async function verifyAvailable(): Promise<boolean> {
  try {
    await api();
    return true;
  } catch {
    return false;
  }
}
