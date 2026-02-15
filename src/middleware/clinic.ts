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
  '/api/monitoring', '/api/assets', '/_next', '/favicon.ico', '/clinic-select', '/login',
  '/register', '/api/affiliate/auth', '/api/affiliate/apply', '/affiliate/login', '/affiliate/apply',
  '/portal/affiliate', '/api/affiliate',
  '/api/tickets', '/status', '/',
];

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
  const c = request.cookies.get('selected-clinic');
  if (c) { const id = parseInt(c.value); if (!isNaN(id)) return id; }
  const token = request.headers.get('authorization')?.replace('Bearer ', '') || request.cookies.get('auth-token')?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET || ''));
      if (payload.clinicId && typeof payload.clinicId === 'number') return payload.clinicId;
    } catch { /* ignore */ }
  }
  const host = getHost(request);
  const sub = getSubdomain(host);
  if (sub && !['www', 'app', 'api', 'admin'].includes(sub)) {
    const map = process.env.SUBDOMAIN_CLINIC_ID_MAP;
    if (map) for (const pair of map.split(',')) {
      const [k, v] = pair.split(':').map((s) => s.trim());
      if (k?.toLowerCase() === sub.toLowerCase() && v) { const id = parseInt(v, 10); if (!isNaN(id)) return id; break; }
    }
    return null;
  }
  return null;
}

export async function clinicMiddleware(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
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
