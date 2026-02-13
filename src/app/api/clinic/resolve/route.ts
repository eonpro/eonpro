import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { basePrisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';
import { withApiHandler } from '@/domains/shared/errors';

/**
 * GET /api/clinic/resolve
 *
 * Resolves a clinic from subdomain or custom domain.
 * This is a PUBLIC endpoint used for login page branding.
 *
 * Query params:
 * - domain: The full hostname (e.g., "wellmedr.eonpro.io" or "portal.wellmedr.com")
 *
 * Returns clinic branding info (public data only - no sensitive fields).
 *
 * Caching: Responses send Cache-Control: no-store. Any server-side caller must use
 * fetch(..., { cache: 'no-store' }) so branding changes take effect immediately.
 */
// Default EONPRO payload for main app / unknown subdomains (no DB)
const defaultBrandingPayload = {
  clinicId: null,
  name: 'EONPRO',
  subdomain: null,
  customDomain: null,
  isMainApp: true,
  branding: {
    logoUrl: null,
    iconUrl: null,
    faviconUrl: null,
    primaryColor: '#4fa77e',
    secondaryColor: '#3B82F6',
    accentColor: '#d3f931',
    buttonTextColor: 'auto' as const,
  },
  contact: {
    supportEmail: 'support@eonpro.io',
    phone: null,
  },
};

function isMainAppDomain(domain: string): boolean {
  const normalized = domain.split(':')[0].toLowerCase();
  return (
    normalized.includes('app.eonpro.io') ||
    normalized === 'app.eonpro.io' ||
    normalized === 'localhost' ||
    normalized.startsWith('localhost:')
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // Support both 'domain' and '_main' parameters (some proxies may rename params)
    const domain = searchParams.get('domain') || searchParams.get('_main');

    if (!domain) {
      logger.warn('[ClinicResolve] Missing domain parameter', {
        params: Object.fromEntries(searchParams.entries()),
        url: request.url,
      });
      return NextResponse.json(
        { error: 'domain parameter is required', code: 'DOMAIN_REQUIRED' },
        { status: 400 }
      );
    }

    // Short-circuit for main app domain: no DB call, avoids timeouts and load
    if (isMainAppDomain(domain)) {
      return NextResponse.json(defaultBrandingPayload, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      });
    }

    logger.info('[ClinicResolve] Resolving clinic for domain', { domain });

    // Try to resolve clinic
    const clinic = await resolveClinicFromDomain(domain);

    if (!clinic) {
      logger.info('[ClinicResolve] No clinic found for domain', { domain });

      // For unknown *.eonpro.io subdomains (e.g. otmens.eonpro.io with no clinic yet),
      // return 200 with default branding so the login page still works and no 404 is thrown.
      const normalizedDomain = domain.split(':')[0].toLowerCase();
      if (normalizedDomain.endsWith('.eonpro.io')) {
        logger.info('[ClinicResolve] Unknown eonpro.io subdomain, returning default branding', {
          domain: normalizedDomain,
        });
        logger.info('[ClinicResolve] eonpro.io subdomain result', {
          domain: normalizedDomain,
          resolved: false,
          clinicId: null,
        });
        return NextResponse.json(defaultBrandingPayload, {
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
      }

      return NextResponse.json(
        { error: 'Clinic not found for this domain', code: 'CLINIC_NOT_FOUND' },
        { status: 404 }
      );
    }

    logger.info('[ClinicResolve] Clinic resolved', {
      domain,
      clinicId: clinic.id,
      clinicName: clinic.name,
    });

    // Observability: one-line summary for *.eonpro.io (no PHI) for production diagnosis
    const normalized = domain.split(':')[0].toLowerCase();
    if (normalized.endsWith('.eonpro.io')) {
      logger.info('[ClinicResolve] eonpro.io subdomain result', {
        domain: normalized,
        resolved: true,
        clinicId: clinic.id,
      });
    }

    // Return only public branding data
    const buttonTextColor = clinic.buttonTextColor ?? 'auto';
    const backgroundColor = clinic.backgroundColor ?? '#F9FAFB';

    return NextResponse.json(
      {
        clinicId: clinic.id,
        name: clinic.name,
        subdomain: clinic.subdomain,
        customDomain: clinic.customDomain,
        branding: {
          logoUrl: clinic.logoUrl,
          iconUrl: clinic.iconUrl,
          faviconUrl: clinic.faviconUrl,
          primaryColor: clinic.primaryColor || '#4fa77e',
          secondaryColor: clinic.secondaryColor || '#3B82F6',
          accentColor: clinic.accentColor || '#d3f931',
          buttonTextColor: buttonTextColor,
          backgroundColor: backgroundColor,
        },
        contact: {
          supportEmail: clinic.supportEmail,
          phone: clinic.phone,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (error) {
    const errorId = crypto.randomUUID().slice(0, 8);
    const searchParams = new URL(request.url).searchParams;
    const domainParam = searchParams.get('domain') || searchParams.get('_main');

    // Log full error for debugging (Sentry, Vercel logs)
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    const errCode =
      error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;
    logger.error(`[CLINIC_RESOLVE_GET] Error ${errorId} - returning default branding:`, {
      error: errMessage,
      prismaCode: errCode,
      stack: error instanceof Error ? error.stack : undefined,
      domain: domainParam,
      url: request.url,
    });

    // NEVER return 500/503 from this endpoint - login must never be blocked.
    // Return 200 with default EONPRO branding so users can always log in.
    return NextResponse.json(defaultBrandingPayload, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Clinic-Resolve-Fallback': 'true',
        'X-Clinic-Resolve-Error-Id': errorId,
      },
    });
  }
}

export const GET = withApiHandler(resolveHandler);

/**
 * Resolve clinic from domain string.
 * Handles both custom domains and subdomains.
 */
async function resolveClinicFromDomain(domain: string) {
  // Normalize domain (remove port, lowercase)
  const normalizedDomain = domain.split(':')[0].toLowerCase();

  // First, try to match custom domain exactly
  // Using basePrisma since this is a public endpoint (no auth/clinic context)
  let clinic = await basePrisma.clinic.findFirst({
    where: {
      customDomain: normalizedDomain,
      status: 'ACTIVE',
    },
    select: {
      id: true,
      name: true,
      subdomain: true,
      customDomain: true,
      logoUrl: true,
      iconUrl: true,
      faviconUrl: true,
      primaryColor: true,
      secondaryColor: true,
      accentColor: true,
      supportEmail: true,
      phone: true,
      buttonTextColor: true,
      backgroundColor: true,
    },
  });

  if (clinic) {
    return clinic;
  }

  // Extract subdomain from domain
  // Handle patterns like:
  // - wellmedr.eonpro.io -> subdomain: wellmedr
  // - wellmedr.localhost:3000 -> subdomain: wellmedr
  // - app.eonpro.io -> no subdomain (main app)

  const parts = normalizedDomain.split('.');

  // For localhost (e.g., wellmedr.localhost)
  if (normalizedDomain.includes('localhost')) {
    if (parts.length >= 2 && parts[0] !== 'localhost' && parts[0] !== 'www') {
      const subdomain = parts[0];
      clinic = await basePrisma.clinic.findFirst({
        where: {
          subdomain: { equals: subdomain, mode: 'insensitive' },
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          subdomain: true,
          customDomain: true,
          logoUrl: true,
          iconUrl: true,
          faviconUrl: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
          supportEmail: true,
          phone: true,
          buttonTextColor: true,
          backgroundColor: true,
        },
      });
    }
  }
  // For eonpro.io domains (e.g., wellmedr.eonpro.io)
  else if (normalizedDomain.endsWith('.eonpro.io')) {
    // Skip common subdomains that aren't clinic-specific
    const skipSubdomains = ['www', 'app', 'api', 'admin', 'staging'];

    if (parts.length >= 3 && !skipSubdomains.includes(parts[0])) {
      const subdomain = parts[0];
      logger.info('[ClinicResolve] Looking up eonpro.io subdomain', {
        subdomain,
        domain: normalizedDomain,
        parts,
      });

      clinic = await basePrisma.clinic.findFirst({
        where: {
          subdomain: { equals: subdomain, mode: 'insensitive' },
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          subdomain: true,
          customDomain: true,
          logoUrl: true,
          iconUrl: true,
          faviconUrl: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
          supportEmail: true,
          phone: true,
          buttonTextColor: true,
          backgroundColor: true,
        },
      });

      if (!clinic) {
        logger.warn('[ClinicResolve] No ACTIVE clinic found for subdomain', {
          subdomain,
          domain: normalizedDomain,
        });
      }
    } else {
      logger.info('[ClinicResolve] Subdomain skipped or invalid', {
        subdomain: parts[0],
        partsLength: parts.length,
        isSkipped: skipSubdomains.includes(parts[0]),
      });
    }
  }
  // For other domains with subdomains (e.g., clinic.somedomain.com)
  else if (parts.length >= 3) {
    const subdomain = parts[0];
    const skipSubdomains = ['www', 'app', 'api', 'admin', 'staging', 'portal'];

    if (!skipSubdomains.includes(subdomain)) {
      clinic = await basePrisma.clinic.findFirst({
        where: {
          subdomain: { equals: subdomain, mode: 'insensitive' },
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          subdomain: true,
          customDomain: true,
          logoUrl: true,
          iconUrl: true,
          faviconUrl: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
          supportEmail: true,
          phone: true,
          buttonTextColor: true,
          backgroundColor: true,
        },
      });
    }
  }

  return clinic;
}
