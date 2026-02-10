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

/**
 * True when we should set auth cookies with domain=.eonpro.io (shared across subdomains).
 * In production we always use .eonpro.io so wellmedr/ot/eonmeds get the cookie even when
 * the request host is wrong (e.g. Vercel internal URL). Set EONPRO_COOKIE_DOMAIN="" to disable.
 */
export function shouldUseEonproCookieDomain(_host: string): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  if (process.env.EONPRO_COOKIE_DOMAIN === '') return false;
  return process.env.EONPRO_COOKIE_DOMAIN === '.eonpro.io' || !process.env.EONPRO_COOKIE_DOMAIN;
}
