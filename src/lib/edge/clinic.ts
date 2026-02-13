/**
 * Edge-safe clinic resolution for middleware.
 *
 * Middleware may only import from src/lib/edge/*. This module provides:
 * - Host resolution (headers + URL fallback)
 * - JWT verification for clinicId
 * - Subdomain parsing + SUBDOMAIN_CLINIC_ID_MAP
 * - clinicMiddleware orchestration
 *
 * EDGE RUNTIME: No __dirname, path, fs, logger, prisma, userAgent.
 * Uses: next-server-shim, jose (JWT), Web APIs only.
 */

import type { NextRequest } from './next-server-shim';
import { NextResponse } from './next-server-shim';
import { jwtVerify } from 'jose';

// Routes that don't require clinic context (auth still applied in handlers)
const PUBLIC_ROUTES = [
  '/api/ping',
  '/api/version',
  '/api/ready',
  '/api/health',
  '/api/_health',
  '/api/sentry',
  '/api/auth/login',
  '/api/auth/refresh-token',
  '/api/auth/send-otp',
  '/api/auth/verify-otp',
  '/api/auth/reset-password',
  '/api/auth/validate-clinic-code',
  '/api/auth/verify-email',
  '/api/webhooks',
  '/api/webhooks/ping',
  '/api/clinic/resolve',
  '/api/clinic/list',
  '/api/monitoring',
  '/api/assets',
  '/_next',
  '/favicon.ico',
  '/clinic-select',
  '/login',
  '/register',
  '/api/affiliate/auth',
  '/api/affiliate/apply',
  '/affiliate/login',
  '/affiliate/apply',
  '/api/tickets',
  '/status',
  '/', // Root: page.tsx redirects to login if unauthenticated
];

const SUPER_ADMIN_ROUTES = [
  '/admin/clinics',
  '/api/admin/clinics',
  '/super-admin',
  '/api/super-admin',
];

/** Edge-safe host from headers or URL. No path/fs/__dirname. */
export function getRequestHostInEdge(request: NextRequest): string {
  const fromHeaders =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host') ||
    '';
  if (fromHeaders) return fromHeaders.split(':')[0] ?? fromHeaders;
  try {
    if (request.url) return new URL(request.url).hostname;
  } catch {
    // ignore
  }
  return '';
}

/** Extract subdomain from hostname. */
export function extractSubdomain(hostname: string): string | null {
  if (hostname.includes('localhost')) {
    const parts = hostname.split('.');
    if (parts.length >= 2) return parts[0];
    return null;
  }
  const parts = hostname.split('.');
  if (parts.length >= 3) return parts[0];
  return null;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  return new TextEncoder().encode(secret);
}

/** Extract clinicId from JWT payload. Edge-safe (jose uses Web Crypto). */
export async function getClinicIdFromToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (payload.clinicId && typeof payload.clinicId === 'number') {
      return payload.clinicId;
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveClinic(request: NextRequest): Promise<number | null> {
  const clinicCookie = request.cookies.get('selected-clinic');
  if (clinicCookie) {
    const clinicId = parseInt(clinicCookie.value);
    if (!isNaN(clinicId)) return clinicId;
  }

  const authHeader = request.headers.get('authorization');
  const tokenFromCookie = request.cookies.get('auth-token')?.value;
  const token = authHeader?.replace('Bearer ', '') || tokenFromCookie;
  if (token) {
    const clinicId = await getClinicIdFromToken(token);
    if (clinicId) return clinicId;
  }

  const hostname = getRequestHostInEdge(request);
  const subdomain = extractSubdomain(hostname);
  if (subdomain && !['www', 'app', 'api', 'admin'].includes(subdomain)) {
    const mapEnv = process.env.SUBDOMAIN_CLINIC_ID_MAP;
    if (mapEnv && typeof mapEnv === 'string') {
      const normalizedSub = subdomain.toLowerCase();
      for (const pair of mapEnv.split(',')) {
        const [key, val] = pair.split(':').map((s) => s.trim());
        if (key?.toLowerCase() === normalizedSub && val) {
          const id = parseInt(val, 10);
          if (!isNaN(id)) return id;
          break;
        }
      }
    }
    return null;
  }

  return null;
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

/** Clinic middleware: resolves clinic from cookie, JWT, or subdomain env map. */
export async function clinicMiddleware(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  if (SUPER_ADMIN_ROUTES.some((route) => pathname.startsWith(route))) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-super-admin-route', 'true');
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const clinicId = await resolveClinic(request);

  if (!clinicId && !isPublicRoute(pathname)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'No clinic context. Please specify clinic.' },
        { status: 400 }
      );
    }
    return NextResponse.redirect(new URL('/clinic-select', request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-clinic-id', clinicId?.toString() || '');
  const hostname = getRequestHostInEdge(request);
  const subdomain = extractSubdomain(hostname);
  if (subdomain) {
    requestHeaders.set('x-clinic-subdomain', subdomain);
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}
