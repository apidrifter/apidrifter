import { DEFAULT_LIMITS, ApidrifterError, type Limits } from "./types.js";

export function resolveLimits(partial?: Partial<Limits>): Limits {
  const limits: Limits = { ...DEFAULT_LIMITS, ...(partial ?? {}) };
  for (const [k, v] of Object.entries(limits)) {
    if (!Number.isFinite(v) || v <= 0) {
      throw new ApidrifterError("invalid-config", `limit ${k} must be a positive number`);
    }
  }
  return limits;
}

/**
 * Walk a parsed value and enforce depth and node-count limits. Iterative, so a deeply
 * nested document cannot overflow our own stack before we reject it.
 */
export function enforceShape(value: unknown, limits: Limits): void {
  let nodes = 0;
  const stack: Array<{ v: unknown; d: number }> = [{ v: value, d: 0 }];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    nodes++;
    if (nodes > limits.maxNodes) {
      throw new ApidrifterError(
        "document-too-many-nodes",
        `document has more than ${limits.maxNodes} values`,
      );
    }
    if (item.d > limits.maxDepth) {
      throw new ApidrifterError(
        "document-too-deep",
        `document nests deeper than ${limits.maxDepth}`,
      );
    }
    const v = item.v;
    if (Array.isArray(v)) {
      for (const child of v) stack.push({ v: child, d: item.d + 1 });
    } else if (v !== null && typeof v === "object") {
      for (const child of Object.values(v as Record<string, unknown>)) {
        stack.push({ v: child, d: item.d + 1 });
      }
    }
  }
}
