/**
 * Resolve the request host for subdomain and routing logic.
 * Prefer X-Forwarded-Host when behind a proxy (Vercel, load balancers) so we see the original host.
 */
export function getRequestHost(request: { headers: Headers }): string {
  return (
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host') ||
    ''
  );
}

/**
 * Host plus fallback from request URL (NextRequest).
 * Use when setting cookies so we get the correct host even if proxy doesn't forward it.
 */
export function getRequestHostWithUrlFallback(
  request: { headers: Headers; url?: string; nextUrl?: { hostname: string } }
): string {
  const fromHeaders = getRequestHost(request);
  if (fromHeaders) return fromHeaders;
  try {
    if (request.nextUrl?.hostname) return request.nextUrl.hostname;
    if (request.url) return new URL(request.url).hostname;
  } catch {
    // ignore
  }
  return '';
}

/** True when we should set auth cookies with domain=.eonpro.io (shared across subdomains). */
export function shouldUseEonproCookieDomain(host: string): boolean {
  if (!host || process.env.NODE_ENV !== 'production') return false;
  if (host.endsWith('.eonpro.io')) return true;
  return process.env.EONPRO_COOKIE_DOMAIN === '.eonpro.io';
}
