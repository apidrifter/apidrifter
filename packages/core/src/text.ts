/**
 * String hygiene for untrusted input. Everything that reaches a message, a rendered page
 * or a terminal goes through here.
 */

// C0 controls except \t \n \r, DEL, C1 controls, and Unicode line/paragraph separators.
// biome-ignore lint/suspicious/noControlCharactersInRegex: this is the point
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/g;
// ANSI / terminal escape sequences (CSI, OSC, and single-char escapes).
// biome-ignore lint/suspicious/noControlCharactersInRegex: this is the point
const ANSI = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001B]*(?:\u0007|\u001B\\)|[@-Z\\-_])/g;
// Bidi overrides and zero-width characters used to disguise text.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/** Strip control characters, escape sequences and invisible characters; collapse whitespace. */
export function clean(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(ANSI, "")
    .replace(CONTROL, "")
    .replace(INVISIBLE, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** UTF-8 byte length without allocating a buffer. */
export function byteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/** Truncate to a byte budget on a character boundary, appending an ellipsis if cut. */
export function truncate(s: string, maxBytes: number): string {
  if (byteLength(s) <= maxBytes) return s;
  let out = "";
  let used = 0;
  for (const ch of s) {
    const b = byteLength(ch);
    if (used + b > maxBytes - 1) break;
    out += ch;
    used += b;
  }
  return `${out}\u2026`;
}

/** Clean and truncate in one step. */
export function safeString(input: unknown, maxBytes: number): string {
  return truncate(clean(input), maxBytes);
}

/**
 * Produce a small, serializable copy of a value for `before`/`after` fields. Strings are
 * cleaned; the whole value is clipped to a byte budget by falling back to a truncated
 * JSON string when it does not fit.
 */
export function clip(value: unknown, maxBytes: number): unknown {
  if (value === undefined) return undefined;
  const sanitized = sanitizeValue(value, 0);
  const json = JSON.stringify(sanitized);
  if (json === undefined) return undefined;
  if (byteLength(json) <= maxBytes) return sanitized;
  return truncate(json, maxBytes);
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 32) return "\u2026";
  if (typeof value === "string") return clean(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((v) => sanitizeValue(v, depth + 1));
  if (value instanceof Set) return [...value].slice(0, 100).map((v) => sanitizeValue(v, depth + 1));
  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    let i = 0;
    for (const [k, v] of value) {
      if (i++ >= 100) break;
      out[clean(String(k))] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let i = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (i++ >= 100) break;
      out[clean(k)] = sanitizeValue(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/** Quote third-party text for inclusion in a message so it reads as data, not instruction. */
export function quote(input: unknown, maxBytes = 120): string {
  const s = safeString(input, maxBytes);
  return s.length === 0 ? '""' : JSON.stringify(s);
}
