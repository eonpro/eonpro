/**
 * Affiliate Landing Page Data API
 *
 * GET /api/affiliate/landing/[code]
 *
 * Public endpoint (no auth) that resolves a ref code to display data
 * for the affiliate landing page. Returns only non-sensitive data:
 * affiliate display name, clinic branding, and ref code validity.
 *
 * @security Public - no PHI, no sensitive data exposed
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { createRateLimiter } from '@/lib/security/rate-limiter-redis';

// Rate limit: generous for public landing pages but protect against scraping
const landingRateLimiter = createRateLimiter({
  identifier: 'affiliate-landing',
  windowSeconds: 60,
  maxRequests: 60,
  message: 'Too many requests. Please try again later.',
});

interface RouteContext {
  params: Promise<{ code: string }>;
}

async function handleGet(
  request: NextRequest,
  context: RouteContext
): Promise<Response> {
  try {
    const { code } = await context.params;

    if (!code || code.length < 2 || code.length > 50) {
      return NextResponse.json(
        { error: 'Invalid ref code', valid: false },
        { status: 400 }
      );
    }

    // Resolve clinic from domain
    const domain = request.headers.get('host') || '';
    const clinic = await resolveClinicFromDomain(domain);

    // Look up the ref code with affiliate and clinic data
    const refCodeRecord = await prisma.affiliateRefCode.findFirst({
      where: {
        refCode: code.toUpperCase(),
        isActive: true,
        ...(clinic ? { clinicId: clinic.id } : {}),
        affiliate: {
          status: 'ACTIVE',
        },
      },
      select: {
        refCode: true,
        affiliate: {
          select: {
            displayName: true,
            status: true,
          },
        },
        clinic: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            settings: true,
          },
        },
      },
    });

    // If not found with uppercase, try case-insensitive
    const record =
      refCodeRecord ||
      (await prisma.affiliateRefCode.findFirst({
        where: {
          refCode: { equals: code, mode: 'insensitive' },
          isActive: true,
          ...(clinic ? { clinicId: clinic.id } : {}),
          affiliate: {
            status: 'ACTIVE',
          },
        },
        select: {
          refCode: true,
          affiliate: {
            select: {
              displayName: true,
              status: true,
            },
          },
          clinic: {
            select: {
              id: true,
              name: true,
              logoUrl: true,
              settings: true,
            },
          },
        },
      }));

    if (!record) {
      return NextResponse.json(
        {
          valid: false,
          refCode: code,
          affiliateName: null,
          clinicName: null,
        },
        {
          status: 200, // 200 so the page can show a fallback gracefully
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          },
        }
      );
    }

    // Extract clinic branding from settings
    const settings = record.clinic.settings as Record<string, unknown> | null;
    const affiliatePortal = settings?.affiliatePortal as Record<string, unknown> | null;

    const response = NextResponse.json(
      {
        valid: true,
        refCode: record.refCode,
        affiliateName: record.affiliate.displayName,
        clinicId: record.clinic.id,
        clinicName: record.clinic.name,
        logoUrl: record.clinic.logoUrl || null,
        branding: {
          primaryColor: affiliatePortal?.primaryColor || '#0f172a',
          accentColor: affiliatePortal?.accentColor || '#10b981',
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );

    return response;
  } catch (error) {
    logger.error('[AffiliateLanding] Error fetching landing data', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to load page data', valid: false },
      { status: 500 }
    );
  }
}

export const GET = landingRateLimiter(
  (req: NextRequest) => {
    // Extract context from the request URL for route params
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const codeIndex = pathParts.indexOf('landing') + 1;
    const code = pathParts[codeIndex] || '';
    return handleGet(req, { params: Promise.resolve({ code }) });
  }
);

/**
 * Resolve clinic from domain string (reused pattern)
 */
async function resolveClinicFromDomain(domain: string) {
  const normalizedDomain = domain.split(':')[0].toLowerCase();

  // Try custom domain first
  let clinic = await prisma.clinic.findFirst({
    where: {
      customDomain: normalizedDomain,
      status: 'ACTIVE',
    },
    select: { id: true, name: true },
  });

  if (clinic) return clinic;

  // Extract subdomain
  const parts = normalizedDomain.split('.');
  const skipSubdomains = ['www', 'app', 'api', 'admin', 'staging', 'portal'];

  // For localhost
  if (normalizedDomain.includes('localhost')) {
    if (parts.length >= 2 && !skipSubdomains.includes(parts[0])) {
      clinic = await prisma.clinic.findFirst({
        where: { subdomain: parts[0], status: 'ACTIVE' },
        select: { id: true, name: true },
      });
    }
  }
  // For eonpro.io subdomains
  else if (normalizedDomain.endsWith('.eonpro.io') && parts.length >= 3) {
    if (!skipSubdomains.includes(parts[0])) {
      clinic = await prisma.clinic.findFirst({
        where: { subdomain: parts[0], status: 'ACTIVE' },
        select: { id: true, name: true },
      });
    }
  }
  // For other subdomains
  else if (parts.length >= 3 && !skipSubdomains.includes(parts[0])) {
    clinic = await prisma.clinic.findFirst({
      where: { subdomain: parts[0], status: 'ACTIVE' },
      select: { id: true, name: true },
    });
  }

  return clinic;
}
