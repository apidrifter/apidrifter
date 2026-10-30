/**
 * URL policy for everything the CLI fetches or connects to. HTTPS anywhere; plain HTTP only
 * to the local machine, because the CLI's main job includes hitting a dev server.
 */
export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

export function isUrlLike(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return LOCAL_HOSTS.has(h) || h.endsWith(".localhost") || h.startsWith("127.");
}

export function checkUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: `not a valid URL: ${raw}` };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "URLs with embedded credentials are not allowed" };
  }
  if (url.protocol === "https:") return { ok: true, url };
  if (url.protocol === "http:") {
    if (isLocalHost(url.hostname)) return { ok: true, url };
    return { ok: false, reason: `plain http is only allowed for localhost, got ${url.hostname}` };
  }
  return { ok: false, reason: `unsupported URL scheme ${url.protocol}` };
}

/** A redirect may not downgrade from https to http, except to the local machine. */
export function checkRedirect(from: URL, to: URL): UrlCheck {
  const check = checkUrl(to.href);
  if (!check.ok) return check;
  if (from.protocol === "https:" && to.protocol !== "https:" && !isLocalHost(to.hostname)) {
    return { ok: false, reason: "redirect would downgrade from https to http" };
  }
  return check;
}
