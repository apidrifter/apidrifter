import { InputError } from "./errors.js";
import { checkRedirect, checkUrl } from "./url-policy.js";
import { VERSION } from "./version.js";

export interface FetchTextOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
}

const DEFAULTS = { timeoutMs: 30_000, maxBytes: 32 * 1024 * 1024, maxRedirects: 5 };

/**
 * Fetch a text document with manual redirect handling, a size cap and a timeout. Every hop
 * goes through the URL policy.
 */
export async function fetchText(input: string, options: FetchTextOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
  const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects;
  const fetchImpl = options.fetchImpl ?? fetch;

  const first = checkUrl(input);
  if (!first.ok) throw new InputError(first.reason);
  let url = first.url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "user-agent": `driftwatch/${VERSION}`,
          accept: "application/json, application/yaml, text/yaml, text/plain;q=0.9, */*;q=0.1",
          ...(options.headers ?? {}),
        },
      });
    } catch (err) {
      throw new InputError(`could not fetch ${url.href}: ${errorMessage(err)}`);
    }
    if (isRedirect(res.status)) {
      const location = res.headers.get("location");
      if (location === null) {
        throw new InputError(`redirect from ${url.href} without a Location header`);
      }
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new InputError(`invalid redirect target from ${url.href}`);
      }
      const check = checkRedirect(url, next);
      if (!check.ok) throw new InputError(check.reason);
      url = check.url;
      continue;
    }
    if (!res.ok) throw new InputError(`fetch of ${url.href} returned HTTP ${res.status}`);
    return readBounded(res, maxBytes, url.href);
  }
  throw new InputError(`too many redirects fetching ${input}`);
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** Read a response body up to a byte limit, failing instead of truncating. */
export async function readBounded(res: Response, maxBytes: number, label: string): Promise<string> {
  const body = res.body;
  if (body === null) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new InputError(`response from ${label} exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    joined.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(joined);
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    const causeMsg = cause instanceof Error ? ` (${cause.message})` : "";
    return `${err.message}${causeMsg}`;
  }
  return String(err);
}
