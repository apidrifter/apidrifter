/**
 * Thin adapter over the core verify engine. Kept async so command code reads the same
 * whether the engine is bundled or loaded lazily in a future split package.
 */
import {
  plan as corePlan,
  renderVerifyMarkdown as coreRenderVerifyMarkdown,
  renderVerifyText as coreRenderVerifyText,
  verify as coreVerify,
  type Limits,
  type Observation,
  type PlannedRequest,
  type VerifyOptions,
  type VerifyResult,
} from "@driftwatch/core";

export type {
  FilledRequest,
  Finding,
  Observation,
  PlannedParameter,
  PlannedRequest,
  VerifyOptions,
  VerifyResult,
} from "@driftwatch/core";

export async function plan(
  spec: unknown,
  options?: { limits?: Partial<Limits> },
): Promise<PlannedRequest[]> {
  return corePlan(spec, options);
}

export async function verify(
  spec: unknown,
  observations: Observation[],
  options?: VerifyOptions,
): Promise<VerifyResult> {
  return coreVerify(spec, observations, options);
}

export async function renderVerifyMarkdown(result: VerifyResult): Promise<string> {
  return coreRenderVerifyMarkdown(result);
}

export async function renderVerifyText(result: VerifyResult): Promise<string> {
  return coreRenderVerifyText(result);
}

/** Always true now that the engine ships in core; kept for callers written against the split. */
export async function verifyAvailable(): Promise<boolean> {
  return true;
}
