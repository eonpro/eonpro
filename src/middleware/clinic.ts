/**
 * Clinic middleware - Edge runtime. Next.js 16 no longer ships ua-parser in next/server.
 */
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_ROUTES = [
  '/api/ping', '/api/version', '/api/ready', '/api/health', '/api/_health', '/api/sentry', '/api/debug-auth',
  '/api/auth/login', '/api/auth/refresh-token', '/api/auth/send-otp', '/api/auth/verify-otp',
  '/api/auth/reset-password', '/api/auth/validate-clinic-code', '/api/auth/verify-email',
  '/api/webhooks', '/api/webhooks/ping', '/api/clinic/resolve', '/api/clinic/list',
  '/api/patient-portal/branding',
  '/api/monitoring', '/api/assets', '/_next', '/favicon.ico', '/clinic-select', '/login',
  '/register', '/api/affiliate/auth', '/api/affiliate/apply', '/affiliate/login', '/affiliate/apply',
  '/affiliate/welcome', '/affiliate/forgot-password', '/affiliate/reset-password', '/affiliate/terms',
  '/affiliate/demo', '/affiliate', '/portal/affiliate', '/api/affiliate',
  '/api/tickets', '/status', '/', '/api/public',
  '/intake', '/api/intake-forms/config', '/patient-login',
];

const RESERVED_SUBDOMAINS = ['www', 'app', 'api', 'admin', 'staging'];
const SUPER_ADMIN_ROUTES = ['/admin/clinics', '/api/admin/clinics', '/super-admin', '/api/super-admin'];

function getHost(request: NextRequest): string {
  const h = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host') || '';
  if (h) return h.split(':')[0] ?? h;
  try { return request.url ? new URL(request.url).hostname : ''; } catch { return ''; }
}

function getSubdomain(host: string): string | null {
  if (host.includes('localhost')) { const p = host.split('.'); return p.length >= 2 ? p[0] : null; }
  const p = host.split('.'); return p.length >= 3 ? p[0] : null;
}

async function resolveClinic(request: NextRequest): Promise<number | null> {
  // Subdomain is AUTHORITATIVE when present — prevents cross-tenant leaks from
  // shared selected-clinic cookies (domain=.eonpro.io).
  const host = getHost(request);
  const sub = getSubdomain(host);
  if (sub && !RESERVED_SUBDOMAINS.includes(sub.toLowerCase())) {
    // Tier 1: env var map (zero latency)
    const map = process.env.SUBDOMAIN_CLINIC_ID_MAP;
    if (map) {
      for (const pair of map.split(',')) {
        const [k, v] = pair.split(':').map((s) => s.trim());
        if (k?.toLowerCase() === sub.toLowerCase() && v) {
          const id = parseInt(v, 10);
          if (!isNaN(id)) return id;
          break;
        }
      }
    }

    // Tier 2: resolve via public API (DB-backed, ~5-50ms).
    // This ensures subdomains not yet in the env map still resolve correctly
    // instead of falling through to cookies (which may be from a different clinic).
    try {
      const origin = request.nextUrl.origin;
      const res = await fetch(`${origin}/api/clinic/resolve?domain=${encodeURIComponent(host)}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.clinicId && typeof data.clinicId === 'number') return data.clinicId;
      }
    } catch { /* timeout or network error — fall through to cookie/JWT */ }
  }

  const c = request.cookies.get('selected-clinic');
  if (c) { const id = parseInt(c.value); if (!isNaN(id)) return id; }
  const token = request.headers.get('authorization')?.replace('Bearer ', '') || request.cookies.get('auth-token')?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET || ''));
      if (payload.clinicId && typeof payload.clinicId === 'number') return payload.clinicId;
    } catch { /* ignore */ }
  }
  return null;
}

export async function clinicMiddleware(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;

  // Clinic subdomains visiting root "/" should see the login page, not the marketing site.
  // The marketing page is only for the main app domain (app.eonpro.io, no subdomain, etc.).
  if (path === '/') {
    const host = getHost(request);
    const sub = getSubdomain(host);
    if (sub && !RESERVED_SUBDOMAINS.includes(sub.toLowerCase())) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  if (PUBLIC_ROUTES.some((r) => path === r || path.startsWith(r + '/'))) return NextResponse.next();
  if (SUPER_ADMIN_ROUTES.some((r) => path.startsWith(r))) {
    const h = new Headers(request.headers); h.set('x-super-admin-route', 'true');
    return NextResponse.next({ request: { headers: h } });
  }
  const clinicId = await resolveClinic(request);
  if (!clinicId) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'No clinic context.' }, { status: 400 });
    return NextResponse.redirect(new URL('/clinic-select', request.url));
  }
  const h = new Headers(request.headers);
  h.set('x-clinic-id', clinicId.toString());
  const sub = getSubdomain(getHost(request));
  if (sub) h.set('x-clinic-subdomain', sub);
  return NextResponse.next({ request: { headers: h } });
}
