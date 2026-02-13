/**
 * Middleware for multi-clinic support
 * Resolves clinic from subdomain, custom domain, or session
 *
 * NOTE: This middleware runs in Edge Runtime, so it cannot use:
 * - Prisma (uses Node.js APIs)
 * - node:async_hooks
 * - node:crypto
 *
 * Clinic resolution from database is done via API calls from the client,
 * or from the JWT token which already contains clinicId.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { getRequestHost } from '@/lib/request-host';

// Edge-compatible JWT secret (don't import from config to avoid process.argv)
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return new TextEncoder().encode(secret);
};

// Routes that don't require clinic context (middleware skips clinic resolution; auth still applied in handlers)
// Free/public routes: no clinic cookie, no JWT — avoids timeout on cold start
const PUBLIC_ROUTES = [
  '/api/ping',
  '/api/version',
  '/api/ready',
  '/api/health',
  '/api/_health',
  '/api/sentry', // Sentry tunnel - must be public so events reach ingest without clinic context
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
  '/api/assets', // Static assets (e.g. EONPRO logo) used on login page before any clinic cookie
  '/_next',
  '/favicon.ico',
  '/clinic-select',
  '/login',
  '/register',
  '/api/affiliate/auth',
  '/api/affiliate/apply',
  '/affiliate/login',
  '/affiliate/apply',
  '/api/tickets', // Tickets API enforces clinic in handler; returns empty list when no clinic
  '/status', // Status page
];

// Routes that require super admin (no clinic context)
const SUPER_ADMIN_ROUTES = [
  '/admin/clinics',
  '/api/admin/clinics',
  '/super-admin',
  '/api/super-admin',
];

export async function clinicMiddleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Super admin routes don't need clinic context
  if (SUPER_ADMIN_ROUTES.some((route) => pathname.startsWith(route))) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-super-admin-route', 'true');

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // Resolve clinic (use host with URL fallback so SUBDOMAIN_CLINIC_ID_MAP works in Edge when Host header is wrong)
  const clinicId = await resolveClinic(request);

  // If no clinic found and route requires it, redirect to clinic selection
  if (!clinicId && !isPublicRoute(pathname)) {
    // For API routes, return error
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'No clinic context. Please specify clinic.' },
        { status: 400 }
      );
    }

    // For web routes, redirect to clinic selection
    return NextResponse.redirect(new URL('/clinic-select', request.url));
  }

  // Attach clinic ID to headers for API routes
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-clinic-id', clinicId?.toString() || '');

  // For subdomain-based routing, also set the clinic subdomain (host with URL fallback for Edge)
  const hostname = getRequestHostInEdge(request);
  const subdomain = extractSubdomain(hostname);
  if (subdomain) {
    requestHeaders.set('x-clinic-subdomain', subdomain);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

/** In Edge, Host/x-forwarded-host may be wrong; use request URL as fallback so SUBDOMAIN_CLINIC_ID_MAP works. */
function getRequestHostInEdge(request: NextRequest): string {
  const fromHeaders = getRequestHost(request);
  if (fromHeaders) return fromHeaders;
  try {
    if (request.url) return new URL(request.url).hostname;
  } catch {
    // ignore
  }
  return '';
}

async function resolveClinic(request: NextRequest): Promise<number | null> {
  // Priority 1: Check session/cookie (most common case)
  const clinicCookie = request.cookies.get('selected-clinic');
  if (clinicCookie) {
    const clinicId = parseInt(clinicCookie.value);
    if (!isNaN(clinicId)) {
      return clinicId;
    }
  }

  // Priority 2: Check authorization header (for API access)
  const authHeader = request.headers.get('authorization');
  const tokenFromCookie = request.cookies.get('auth-token')?.value;
  const token = authHeader?.replace('Bearer ', '') || tokenFromCookie;

  if (token) {
    const clinicId = await getClinicIdFromToken(token);
    if (clinicId) {
      return clinicId;
    }
  }

  // x-clinic-id is NOT trusted for isolation. Only JWT (above) or subdomain/cookie set tenant.
  // API routes that need x-clinic-id must validate: request is authenticated AND clinicId is in user's allowed clinics (done in auth layer).

  // Priority 3: Check subdomain (use host with URL fallback so SUBDOMAIN_CLINIC_ID_MAP works in Edge)
  const hostname = getRequestHostInEdge(request);
  const subdomain = extractSubdomain(hostname);
  if (subdomain && !['www', 'app', 'api', 'admin'].includes(subdomain)) {
    // 3a: Optional env map so Edge can set clinicId without DB (e.g. SUBDOMAIN_CLINIC_ID_MAP=ot:5,wellmedr:2,eonmeds:3)
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
    // 3b: No DB in Edge; API routes use x-clinic-subdomain for lookup
    return null;
  }

  // No default/fallback tenant: do not use DEFAULT_CLINIC_ID or "first clinic" for protected routes.
  return null;
}

function extractSubdomain(hostname: string): string | null {
  // Handle localhost specially
  if (hostname.includes('localhost')) {
    // For localhost:3001, check for clinic1.localhost:3001 format
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      return parts[0];
    }
    return null;
  }

  // For production domains
  const parts = hostname.split('.');
  if (parts.length >= 3) {
    return parts[0];
  }

  return null;
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

async function getClinicIdFromToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());

    // Return clinicId from JWT payload
    if (payload.clinicId && typeof payload.clinicId === 'number') {
      return payload.clinicId;
    }

    return null;
  } catch {
    // Token verification failed - invalid or expired
    return null;
  }
}

export default clinicMiddleware;
