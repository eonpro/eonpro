// API route for user's clinic management
import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { generateSignedUrl } from '@/lib/integrations/aws/s3Service';
import { isS3Enabled, s3Config } from '@/lib/integrations/aws/s3Config';

/** Refresh an S3 presigned URL that may have expired. Non-S3 URLs pass through unchanged. */
async function refreshBrandingUrl(url: string | null): Promise<string | null> {
  if (!url || !isS3Enabled()) return url;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const isS3Url =
      (host.includes('.s3.') && host.includes('amazonaws.com')) ||
      (host.endsWith('.amazonaws.com') && host.includes(s3Config.bucketName));
    const isCloudFrontUrl =
      s3Config.cloudFrontUrl && host === new URL(s3Config.cloudFrontUrl).hostname;
    if (!isS3Url && !isCloudFrontUrl) return url;
    const key = decodeURIComponent(
      parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname
    );
    if (!key) return url;
    return await generateSignedUrl(key, 'GET', 604800);
  } catch {
    return url;
  }
}

// GET /api/user/clinics - Get all clinics the user belongs to
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    // Get the user's primary clinic directly (simpler, more reliable approach)
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        clinicId: true,
        activeClinicId: true,
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            customDomain: true,
            logoUrl: true,
            iconUrl: true,
            faviconUrl: true,
            primaryColor: true,
            status: true,
          },
        },
      },
    });

    // Build clinics array from user's clinic
    const clinics: Array<{
      id: number;
      name: string;
      subdomain: string | null;
      customDomain: string | null;
      logoUrl: string | null;
      iconUrl: string | null;
      faviconUrl: string | null;
      primaryColor: string | null;
      status: string | null;
      role: string;
      isPrimary: boolean;
    }> = [];
    if (userData?.clinic) {
      clinics.push({
        ...userData.clinic,
        role: user.role,
        isPrimary: true,
      });
    }

    // Get additional clinics from UserClinic table
    try {
      const userClinics = await prisma.userClinic.findMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
              customDomain: true,
              logoUrl: true,
              iconUrl: true,
              faviconUrl: true,
              primaryColor: true,
              status: true,
            },
          },
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 100,
      });

      for (const uc of userClinics) {
        if (!clinics.find((c) => c.id === uc.clinic.id)) {
          clinics.push({
            ...uc.clinic,
            role: uc.role,
            isPrimary: uc.isPrimary,
          });
        }
      }
    } catch {
      // UserClinic table might not exist yet
    }

    // For provider users, also check ProviderClinic assignments
    if (user.role === 'provider') {
      try {
        const provider = await prisma.provider.findFirst({
          where: { user: { id: user.id } },
          select: { id: true },
        });

        if (provider) {
          const providerClinics = await prisma.providerClinic.findMany({
            where: {
              providerId: provider.id,
              isActive: true,
            },
            include: {
              clinic: {
                select: {
                  id: true,
                  name: true,
                  subdomain: true,
                  customDomain: true,
                  logoUrl: true,
                  iconUrl: true,
                  faviconUrl: true,
                  primaryColor: true,
                  status: true,
                },
              },
            },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            take: 100,
          });

          for (const pc of providerClinics) {
            if (!clinics.find((c) => c.id === pc.clinic.id)) {
              clinics.push({
                ...pc.clinic,
                role: 'provider',
                isPrimary: pc.isPrimary,
              });
            }
          }
        }
      } catch {
        // ProviderClinic table might not exist yet
      }
    }

    const selectedClinicCookie = req.cookies.get('selected-clinic')?.value;
    const selectedClinicId = selectedClinicCookie ? parseInt(selectedClinicCookie, 10) : NaN;
    const hasSelectedClinicAccess =
      !isNaN(selectedClinicId) && clinics.some((clinic) => clinic.id === selectedClinicId);

    const activeClinicId =
      (hasSelectedClinicAccess ? selectedClinicId : undefined) ||
      userData?.activeClinicId ||
      userData?.clinicId ||
      clinics[0]?.id;

    // Refresh S3 presigned URLs so branding images don't break after expiry
    const refreshedClinics = await Promise.all(
      clinics.map(async (clinic) => ({
        ...clinic,
        logoUrl: await refreshBrandingUrl(clinic.logoUrl),
        iconUrl: await refreshBrandingUrl(clinic.iconUrl),
        faviconUrl: await refreshBrandingUrl(clinic.faviconUrl),
      }))
    );

    return NextResponse.json({
      clinics: refreshedClinics,
      activeClinicId,
      hasMultipleClinics: clinics.length > 1,
    });
  } catch (error: unknown) {
    logger.error('Error fetching user clinics', {
      error: error instanceof Error ? error.message : String(error),
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to fetch clinics' }, { status: 500 });
  }
}

// PUT /api/user/clinics - Switch active clinic
async function handlePut(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const { clinicId } = body;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic ID is required' }, { status: 400 });
    }

    // Verify user has access to this clinic via UserClinic
    const hasUserClinicAccess = await prisma.userClinic.findFirst({
      where: {
        userId: user.id,
        clinicId: clinicId,
        isActive: true,
      },
    });

    // Check legacy clinicId
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { clinicId: true },
    });

    // For providers, also check ProviderClinic assignments
    let hasProviderClinicAccess = false;
    if (user.role === 'provider') {
      try {
        const provider = await prisma.provider.findFirst({
          where: { user: { id: user.id } },
          select: { id: true },
        });
        if (provider) {
          const pc = await prisma.providerClinic.findFirst({
            where: {
              providerId: provider.id,
              clinicId: clinicId,
              isActive: true,
            },
          });
          hasProviderClinicAccess = !!pc;
        }
      } catch {
        // ProviderClinic table might not exist yet
      }
    }

    if (!hasUserClinicAccess && !hasProviderClinicAccess && userData?.clinicId !== clinicId) {
      return NextResponse.json({ error: 'You do not have access to this clinic' }, { status: 403 });
    }

    // Update user's active clinic
    await prisma.user.update({
      where: { id: user.id },
      data: { activeClinicId: clinicId },
    });

    // Get the clinic details
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        subdomain: true,
        customDomain: true,
        logoUrl: true,
        primaryColor: true,
        status: true,
      },
    });

    const response = NextResponse.json({
      success: true,
      activeClinic: clinic,
      message: `Switched to ${clinic?.name}`,
    });

    // Keep edge middleware clinic resolution in sync for all subsequent requests.
    response.cookies.set('selected-clinic', String(clinicId), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });

    return response;
  } catch (error) {
    logger.error('Error switching clinic', error instanceof Error ? error : undefined);
    return NextResponse.json({ error: 'Failed to switch clinic' }, { status: 500 });
  }
}

export const GET = withAuth(handleGet);
export const PUT = withAuth(handlePut);
