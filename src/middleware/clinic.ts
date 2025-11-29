/**
 * Middleware for multi-clinic support
 * Resolves clinic from subdomain, custom domain, or session
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../lib/logger';

import { prisma } from '@/lib/db';

// Routes that don't require clinic context
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/refresh-token',
  '/api/webhooks',
  '/_next',
  '/favicon.ico',
  '/clinic-select',
  '/api/clinic/list',
];

// Routes that require super admin (no clinic context)
const SUPER_ADMIN_ROUTES = [
  '/admin/clinics',
  '/api/admin/clinics',
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
  // Priority 1: Check subdomain
  const hostname = request.headers.get('host') || '';
  const subdomain = extractSubdomain(hostname);
  
  if (subdomain && !['www', 'app', 'api', 'admin'].includes(subdomain)) {
    try {
      const clinic = await prisma.clinic.findUnique({
        where: { subdomain },
        select: { id: true, status: true }
      });
      
      if (clinic?.status === 'ACTIVE') {
        return clinic.id;
      }
    } catch (error) {
      logger.error('Error resolving clinic from subdomain:', error);
    }
  }
  
  // Priority 2: Check custom domain
  try {
    const clinic = await prisma.clinic.findFirst({
      where: { 
        customDomain: hostname.split(':')[0], // Remove port if present
        status: 'ACTIVE'
      },
      select: { id: true }
    });
    
    if (clinic) {
      return clinic.id;
    }
  } catch (error) {
    logger.error('Error resolving clinic from custom domain:', error);
  }
  
  // Priority 3: Check session/cookie
  const clinicCookie = request.cookies.get('selected-clinic');
  if (clinicCookie) {
    return parseInt(clinicCookie.value);
  }
  
  // Priority 4: Check authorization header (for API access)
  const authHeader = request.headers.get('authorization');
  if (authHeader) {
    // Parse JWT and extract clinic ID
    // This would need to be implemented with your JWT library
    const token = authHeader.replace('Bearer ', '');
    const clinicId = await getClinicIdFromToken(token);
    if (clinicId) {
      return clinicId;
    }
  }
  
  // Priority 5: Default clinic (for migration period)
  // Remove this after all users are migrated to multi-clinic
  if (process.env.USE_DEFAULT_CLINIC === 'true') {
    try {
      const defaultClinic = await prisma.clinic.findFirst({
        where: { subdomain: 'main', status: 'ACTIVE' },
        select: { id: true }
      });
      
      if (defaultClinic) {
        return defaultClinic.id;
      }
    } catch (error) {
      logger.error('Error fetching default clinic:', error);
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
    // TODO: Implement JWT parsing and verification
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // return decoded.clinicId || null;
    return null;
  } catch (error) {
    return null;
  }
}

export default clinicMiddleware;
