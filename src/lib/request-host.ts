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
