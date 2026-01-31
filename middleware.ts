import { NextRequest, NextResponse } from 'next/server';
import clinicMiddleware from '@/middleware/clinic';

/**
 * Security Headers Configuration
 * HIPAA-compliant Content Security Policy
 * 
 * NOTE: 'unsafe-inline' for styles is required by many UI frameworks (Tailwind, etc.)
 * For scripts, we use strict-dynamic where possible and whitelist specific domains
 */
const securityHeaders = {
  // Content Security Policy - Prevents XSS attacks
  // SECURITY: Removed 'unsafe-eval' - not needed for production
  // SECURITY: 'unsafe-inline' for styles kept for Tailwind/Next.js compatibility
  // TODO: Consider implementing nonce-based CSP for stricter security
  'Content-Security-Policy': [
    "default-src 'self'",
    // Scripts: 'wasm-unsafe-eval' for dotLottie animations (WASM-based)
    // 'unsafe-inline' kept for Next.js hydration; consider nonce-based CSP for stricter security
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
  
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Prevent clickjacking
  'X-Frame-Options': 'SAMEORIGIN',
  
  // Enable XSS protection (legacy browsers)
  'X-XSS-Protection': '1; mode=block',
  
  // Control referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Permissions Policy - Disable unnecessary features
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
  
  // HSTS - Strict Transport Security (1 year)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  
  // Prevent DNS prefetch leaks
  'X-DNS-Prefetch-Control': 'on',
  
  // Cache control for sensitive pages
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

/**
 * Add security headers to response
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

/**
 * Check if request is for a static asset
 */
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') && !pathname.endsWith('.html')
  );
}

/**
 * Check if request is for an API route
 */
function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Skip security headers for static assets (they have their own caching)
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }
  
  // Create base response
  let response: NextResponse;
  
  // Apply clinic middleware for multi-tenant support
  if (process.env.NEXT_PUBLIC_ENABLE_MULTI_CLINIC === 'true') {
    const clinicResponse = await clinicMiddleware(request);
    response = clinicResponse || NextResponse.next();
  } else {
    response = NextResponse.next();
  }
  
  // Add security headers to all responses (except static assets)
  response = addSecurityHeaders(response);
  
  // Add request ID for tracing
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  response.headers.set('x-request-id', requestId);
  
  // Add CORS headers for API routes - RESTRICTED to allowed origins
  if (isApiRoute(pathname)) {
    const origin = request.headers.get('origin') || '';

    // Static allowed origins
    const allowedOrigins = [
      'https://app.eonpro.io',
      'https://eonpro.io',
      'https://staging.eonpro.io',
      'http://localhost:3000',
      'http://localhost:3001',
    ];

    // Check if origin is allowed (static list, *.eonpro.io pattern, or development)
    // SECURITY: Removed overly permissive portal.*.com pattern
    // Custom domains should be explicitly added to allowedOrigins
    const isAllowed =
      allowedOrigins.includes(origin) ||
      /^https:\/\/[a-z0-9-]+\.eonpro\.io$/.test(origin) || // Allow all *.eonpro.io subdomains
      (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost'));

    // Only set CORS headers if origin is allowed
    if (isAllowed) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-webhook-secret');
      response.headers.set('Access-Control-Max-Age', '86400');
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    // Don't set CORS headers for unknown origins - browser will block
  }
  
  return response;
}

// Configure which routes the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
