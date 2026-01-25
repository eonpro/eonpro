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

// Edge-compatible JWT secret (don't import from config to avoid process.argv)
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return new TextEncoder().encode(secret);
};

// Routes that don't require clinic context
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/refresh-token',
  '/api/webhooks',
  '/api/clinic/resolve',
  '/api/health',
  '/api/ready',
  '/api/monitoring',
  '/_next',
  '/favicon.ico',
  '/clinic-select',
  '/api/clinic/list',
  '/login',
  '/register',
  '/api/affiliate/auth',
  '/api/affiliate/apply',
  '/affiliate/login',
  '/affiliate/apply',
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
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }
  
  // Super admin routes don't need clinic context
  if (SUPER_ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-super-admin-route', 'true');
    
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }
  
  // Resolve clinic
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
  
  // For subdomain-based routing, also set the clinic subdomain
  const hostname = request.headers.get('host') || '';
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
  
  // Priority 3: Check x-clinic-id header (for API clients)
  const clinicIdHeader = request.headers.get('x-clinic-id');
  if (clinicIdHeader) {
    const clinicId = parseInt(clinicIdHeader);
    if (!isNaN(clinicId)) {
      return clinicId;
    }
  }
  
  // Priority 4: Check subdomain (handled by client-side redirect if needed)
  // NOTE: We can't do DB lookups in Edge Runtime, so subdomain->clinicId
  // mapping must be done by the client calling /api/clinic/resolve
  const hostname = request.headers.get('host') || '';
  const subdomain = extractSubdomain(hostname);
  if (subdomain && !['www', 'app', 'api', 'admin'].includes(subdomain)) {
    // Set header so API routes can look up the clinic
    // The actual DB lookup happens in the API route
    return null; // Will trigger redirect to clinic-select or use default
  }
  
  // Priority 5: Default clinic ID from env (for single-clinic deployments)
  const defaultClinicId = process.env.DEFAULT_CLINIC_ID;
  if (defaultClinicId) {
    const clinicId = parseInt(defaultClinicId);
    if (!isNaN(clinicId)) {
      return clinicId;
    }
  }
  
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
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
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
