import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logger';
import { basePrisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { resolveSubdomainClinicId, hasClinicAccess } from '@/lib/auth/middleware-cache';
import { getRequestHost } from '@/lib/request-host';

function extractSubdomain(host: string): string | null {
  if (!host || !host.includes('.')) return null;
  const parts = host.split('.');
  const isLocalhostWithSub = host.includes('localhost') && parts.length >= 2;
  const sub = parts.length >= 3 || isLocalhostWithSub ? parts[0] ?? null : null;
  const reserved = ['www', 'app', 'api', 'admin', 'staging'];
  return sub && !reserved.includes(sub.toLowerCase()) ? sub : null;
}

/**
 * GET /api/clinic/current
 * Get the current clinic context for the authenticated user.
 *
 * When the request is from a clinic subdomain (e.g. ot.eonpro.io), returns that
 * clinic if the user has access — so after switching portals (logout from one,
 * navigate to another) the UI shows the correct clinic without requiring a
 * manual "Switch to this clinic" or refresh.
 */
async function handler(request: NextRequest, user: AuthUser) {
  try {
    let clinicId = user.clinicId;

    // Prefer subdomain clinic when on a clinic subdomain (e.g. ot.eonpro.io).
    // Ensures "current" matches the portal the user is on after logout → different clinic.
    const host = getRequestHost(request);
    const subdomain = extractSubdomain(host);
    if (subdomain && user.role !== 'patient') {
      const subdomainClinicId = await resolveSubdomainClinicId(subdomain);
      if (subdomainClinicId != null) {
        const userHasAccess =
          user.role === 'super_admin' ||
          user.clinicId === subdomainClinicId ||
          (await hasClinicAccess(user.id, subdomainClinicId, user.providerId));
        if (userHasAccess) {
          clinicId = subdomainClinicId;
        }
      }
    }

    if (!clinicId) {
      return NextResponse.json({ error: 'No clinic context available' }, { status: 404 });
    }

    // Use basePrisma since we're explicitly selecting the clinic
    const clinic = await basePrisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        subdomain: true,
        customDomain: true,
        status: true,
        logoUrl: true,
        faviconUrl: true,
        primaryColor: true,
        secondaryColor: true,
        settings: true,
        features: true,
        billingPlan: true,
        timezone: true,
        // Only include counts for admin+ roles
        ...(user.role === 'super_admin' || user.role === 'admin'
          ? {
              _count: {
                select: {
                  patients: true,
                  providers: true,
                  users: true,
                },
              },
            }
          : {}),
      },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Allow TRIAL status clinics too
    if (!['ACTIVE', 'TRIAL'].includes(clinic.status)) {
      return NextResponse.json({ error: 'Clinic is not active' }, { status: 403 });
    }

    return NextResponse.json(clinic);
  } catch (error) {
    logger.error('Error fetching current clinic:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to fetch clinic information' }, { status: 500 });
  }
}

export const GET = withAuth(handler);
