/**
 * Root middleware - runs on every request (Edge Runtime).
 * Next.js 16 no longer bundles ua-parser in next/server, so standard imports are safe.
 *
 * IMPORTANT: This file MUST live at src/middleware.ts (not project root) when using src/ directory.
 * Next.js 16 only discovers middleware adjacent to the app/ directory.
 */
import { NextRequest, NextResponse } from 'next/server';
import { clinicMiddleware } from './middleware/clinic';

const securityHeaders: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://js.stripe.com https://challenges.cloudflare.com https://lottie.host https://maps.googleapis.com https://*.googleapis.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' https://fonts.gstatic.com data:",
    "connect-src 'self' https://api.stripe.com https://vitals.vercel-insights.com https://o4508611993468928.ingest.us.sentry.io https://lottie.host https://cdn.jsdelivr.net https://unpkg.com https://maps.googleapis.com https://*.googleapis.com wss: ws:",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com https://*.zoom.us https://maps.googleapis.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': [
    'camera=(self)',
    'microphone=(self)',
    'geolocation=()',
    'interest-cohort=()',
    'accelerometer=()',
    'gyroscope=()',
    'magnetometer=()',
    'payment=(self)',
    'usb=()',
    'sync-xhr=()',
  ].join(', '),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-DNS-Prefetch-Control': 'on',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

function addSecurityHeaders(response: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(securityHeaders)) {
    response.headers.set(k, v);
  }
  return response;
}

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    (pathname.includes('.') && !pathname.endsWith('.html'))
  );
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

function getPatientPortalBasePath(): string {
  return process.env.NEXT_PUBLIC_PATIENT_PORTAL_PATH || '/portal';
}

function isAffiliatePortalRoute(pathname: string): boolean {
  const portalBase = getPatientPortalBasePath();
  return (
    pathname === `${portalBase}/affiliate` ||
    pathname.startsWith(`${portalBase}/affiliate/`)
  );
}

function isPatientPortalRoute(pathname: string): boolean {
  const portalBase = getPatientPortalBasePath();
  if (isAffiliatePortalRoute(pathname)) return false;
  return pathname === portalBase || pathname.startsWith(portalBase + '/');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAffiliatePortalRoute(pathname)) {
    const token =
      request.cookies.get('affiliate_session')?.value ||
      request.cookies.get('auth-token')?.value;
    if (!token || token.split('.').length !== 3) {
      const loginUrl = new URL('/affiliate/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      loginUrl.searchParams.set('reason', 'no_session');
      return NextResponse.redirect(loginUrl);
    }
  }

  if (isPatientPortalRoute(pathname)) {
    const token =
      request.cookies.get('patient-token')?.value || request.cookies.get('auth-token')?.value;
    if (!token || token.split('.').length !== 3) {
      const portalPath = getPatientPortalBasePath();
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', portalPath);
      loginUrl.searchParams.set('reason', 'no_session');
      return NextResponse.redirect(loginUrl);
    }
  }

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  let response: NextResponse;
  if (process.env.NEXT_PUBLIC_ENABLE_MULTI_CLINIC === 'true') {
    response = await clinicMiddleware(request);
  } else {
    response = NextResponse.next();
  }

  response = addSecurityHeaders(response);
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  response.headers.set('x-request-id', requestId);

  if (isApiRoute(pathname)) {
    const origin = request.headers.get('origin') || '';
    const allowedOrigins = [
      'https://app.eonpro.io',
      'https://eonpro.io',
      'https://staging.eonpro.io',
      'http://localhost:3000',
      'http://localhost:3001',
    ];
    const isAllowed =
      allowedOrigins.includes(origin) ||
      /^https:\/\/[a-z0-9-]+\.eonpro\.io$/.test(origin) ||
      (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost'));
    if (isAllowed) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-webhook-secret');
      response.headers.set('Access-Control-Max-Age', '86400');
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
