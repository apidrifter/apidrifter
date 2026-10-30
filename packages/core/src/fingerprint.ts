import type { Change } from "./types.js";

/**
 * Stable identity for a change across runs, used by the `baseline` config to accept
 * reviewed changes. FNV-1a 64-bit over a canonical serialization. Not cryptographic and
 * does not need to be: collisions only cause a change to be wrongly suppressed within a
 * single user's own baseline.
 */
export function fingerprint(change: Change): string {
  const canonical = JSON.stringify([
    change.id,
    change.location.kind,
    change.location.subject ?? "",
    change.location.part ?? "",
    change.location.name ?? "",
    change.location.mediaType ?? "",
    change.location.pointer ?? "",
    stable(change.before),
    stable(change.after),
  ]);
  return fnv1a64(canonical);
}

function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = stable((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

function fnv1a64(input: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  const bytes = new TextEncoder().encode(input);
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}
