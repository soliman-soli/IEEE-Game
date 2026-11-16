const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i;

export function isLocalhostUrl(url: string): boolean {
  return LOCALHOST_RE.test(url.trim());
}

/**
 * Resolves the canonical public origin from an incoming HTTP request or deployment env vars.
 */
export function resolveOriginFromRequest(request: Request): string {
  const headers = request.headers;
  const rawHost =
    headers.get("x-forwarded-host") ||
    headers.get("host") ||
    "";
  const host = rawHost.split(",")[0]?.trim();

  if (host) {
    const rawProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const isLocalHost =
      host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const proto = rawProto || (isLocalHost ? "http" : "https");
    return `${proto}://${host}`;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    return siteUrl.replace(/\/+$/, "");
  }

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) {
    const cleaned = vercelProd.replace(/\/+$/, "");
    return cleaned.startsWith("http") ? cleaned : `https://${cleaned}`;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    const cleaned = vercelUrl.replace(/\/+$/, "");
    return cleaned.startsWith("http") ? cleaned : `https://${cleaned}`;
  }

  return new URL(request.url).origin;
}
