import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/clinic/resolve
 *
 * Resolves a clinic from subdomain or custom domain.
 * This is a PUBLIC endpoint used for login page branding.
 *
 * Query params:
 * - domain: The full hostname (e.g., "wellmedr.eonpro.io" or "portal.wellmedr.com")
 *
 * Returns clinic branding info (public data only - no sensitive fields)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');

    if (!domain) {
      return NextResponse.json({ error: 'domain parameter is required' }, { status: 400 });
    }

    logger.info('[ClinicResolve] Resolving clinic for domain', { domain });

    // Try to resolve clinic
    const clinic = await resolveClinicFromDomain(domain);

    if (!clinic) {
      logger.info('[ClinicResolve] No clinic found for domain', { domain });
      return NextResponse.json({ error: 'Clinic not found for this domain' }, { status: 404 });
    }

    logger.info('[ClinicResolve] Clinic resolved', { domain, clinicId: clinic.id, clinicName: clinic.name });

    // Return only public branding data
    // Note: buttonTextColor is optional - if column doesn't exist yet, default to 'auto'
    const buttonTextColor = (clinic as any).buttonTextColor || 'auto';

    return NextResponse.json({
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
      },
      contact: {
        supportEmail: clinic.supportEmail,
        phone: clinic.phone,
      },
    });
  } catch (error: any) {
    logger.error('[ClinicResolve] Error resolving clinic', { error: error.message });
    return NextResponse.json({ error: 'Failed to resolve clinic' }, { status: 500 });
  }
}

/**
 * Resolve clinic from domain string.
 * Handles both custom domains and subdomains.
 */
async function resolveClinicFromDomain(domain: string) {
  // Normalize domain (remove port, lowercase)
  const normalizedDomain = domain.split(':')[0].toLowerCase();

  // First, try to match custom domain exactly
  let clinic = await prisma.clinic.findFirst({
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
      clinic = await prisma.clinic.findFirst({
        where: {
          subdomain,
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
      clinic = await prisma.clinic.findFirst({
        where: {
          subdomain,
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
        },
      });
    }
  }
  // For other domains with subdomains (e.g., clinic.somedomain.com)
  else if (parts.length >= 3) {
    const subdomain = parts[0];
    const skipSubdomains = ['www', 'app', 'api', 'admin', 'staging', 'portal'];

    if (!skipSubdomains.includes(subdomain)) {
      clinic = await prisma.clinic.findFirst({
        where: {
          subdomain,
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
        },
      });
    }
  }

  return clinic;
}
