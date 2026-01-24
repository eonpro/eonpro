import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { relaxedRateLimiter } from '@/lib/security/rate-limiter-redis';

// Query params validation
const getBrandingQuerySchema = z.object({
  clinicId: z.string().regex(/^\d+$/, 'clinicId must be a number').transform(Number),
});

/**
 * GET /api/patient-portal/branding
 *
 * Fetches clinic branding for the patient portal
 * This is intentionally public as it's needed to render the login page
 * Query params: clinicId (required)
 *
 * Rate limited: 300 requests per minute (relaxed, for page loads)
 */
const getBrandingHandler = async (request: NextRequest) => {
  try {
    const { searchParams } = new URL(request.url);

    // Validate query params
    const parseResult = getBrandingQuerySchema.safeParse({
      clinicId: searchParams.get('clinicId'),
    });

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid clinicId parameter', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { clinicId } = parseResult.data;

    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        iconUrl: true,
        faviconUrl: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        customCss: true,
        settings: true,
        adminEmail: true,
        phone: true,
      },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Parse settings JSON for features and resources
    const settings = (clinic.settings as any) || {};
    const patientPortalSettings = settings.patientPortal || {};

    const branding = {
      clinicId: clinic.id,
      clinicName: clinic.name,
      logoUrl: clinic.logoUrl,
      iconUrl: clinic.iconUrl,
      faviconUrl: clinic.faviconUrl,
      primaryColor: clinic.primaryColor || '#4fa77e',
      secondaryColor: clinic.secondaryColor || '#3B82F6',
      accentColor: clinic.accentColor || patientPortalSettings.accentColor || '#d3f931',
      customCss: clinic.customCss,
      features: {
        showBMICalculator: patientPortalSettings.showBMICalculator ?? true,
        showCalorieCalculator: patientPortalSettings.showCalorieCalculator ?? true,
        showDoseCalculator: patientPortalSettings.showDoseCalculator ?? true,
        showShipmentTracking: patientPortalSettings.showShipmentTracking ?? true,
        showMedicationReminders: patientPortalSettings.showMedicationReminders ?? true,
        showWeightTracking: patientPortalSettings.showWeightTracking ?? true,
        showResources: patientPortalSettings.showResources ?? true,
        showBilling: patientPortalSettings.showBilling ?? true,
      },
      resourceVideos: patientPortalSettings.resourceVideos || [
        {
          id: 'injection-guide',
          title: 'How to Self-Inject',
          description: 'Step-by-step guide for subcutaneous injection',
          url: 'https://www.youtube.com/watch?v=example1',
          thumbnail: '/images/injection-thumbnail.jpg',
          category: 'tutorials',
        },
        {
          id: 'diet-tips',
          title: 'Diet Tips for Weight Loss',
          description: 'Nutrition guidelines while on GLP-1 medication',
          url: 'https://www.youtube.com/watch?v=example2',
          thumbnail: '/images/diet-thumbnail.jpg',
          category: 'nutrition',
        },
      ],
      supportEmail: clinic.adminEmail,
      supportPhone: clinic.phone,
    };

    return NextResponse.json(branding);
  } catch (error: any) {
    logger.error('Error fetching clinic branding:', { error: error.message });
    return NextResponse.json({ error: 'Failed to fetch clinic branding' }, { status: 500 });
  }
};

// Apply rate limiting to GET endpoint
export const GET = relaxedRateLimiter(getBrandingHandler);

// Update branding validation schema
const updateBrandingSchema = z.object({
  clinicId: z.number().int().positive(),
  logoUrl: z.string().url().nullable().optional(),
  iconUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  customCss: z.string().max(10000).optional(),
  features: z.object({
    showBMICalculator: z.boolean().optional(),
    showCalorieCalculator: z.boolean().optional(),
    showDoseCalculator: z.boolean().optional(),
    showShipmentTracking: z.boolean().optional(),
    showMedicationReminders: z.boolean().optional(),
    showWeightTracking: z.boolean().optional(),
    showResources: z.boolean().optional(),
    showBilling: z.boolean().optional(),
  }).optional(),
  resourceVideos: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    url: z.string().url(),
    thumbnail: z.string().optional(),
    category: z.string().optional(),
  })).optional(),
});

/**
 * PUT /api/patient-portal/branding
 *
 * Updates clinic branding settings (admin only)
 *
 * @security Requires authentication - admin/super_admin only
 */
export async function PUT(request: NextRequest) {
  // Import auth middleware
  const { verifyAuth } = await import('@/lib/auth/middleware');

  const authResult = await verifyAuth(request);
  if (!authResult.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = authResult.user!;

  // Only admins can update branding
  if (!['admin', 'super_admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden - admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();

    // Validate input
    const parseResult = updateBrandingSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid branding data', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { clinicId, ...brandingData } = parseResult.data;

    // Non-super-admin can only update their own clinic
    if (user.role !== 'super_admin' && user.clinicId !== clinicId) {
      return NextResponse.json({ error: 'Forbidden - can only update own clinic' }, { status: 403 });
    }

    // Verify the clinic exists
    const existingClinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!existingClinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Build update object
    const updateData: any = {};

    if (brandingData.logoUrl !== undefined) {
      updateData.logoUrl = brandingData.logoUrl;
    }
    if (brandingData.iconUrl !== undefined) {
      updateData.iconUrl = brandingData.iconUrl;
    }
    if (brandingData.faviconUrl !== undefined) {
      updateData.faviconUrl = brandingData.faviconUrl;
    }
    if (brandingData.primaryColor !== undefined) {
      updateData.primaryColor = brandingData.primaryColor;
    }
    if (brandingData.secondaryColor !== undefined) {
      updateData.secondaryColor = brandingData.secondaryColor;
    }
    if (brandingData.accentColor !== undefined) {
      updateData.accentColor = brandingData.accentColor;
    }
    if (brandingData.customCss !== undefined) {
      updateData.customCss = brandingData.customCss;
    }

    // Update settings JSON for patient portal specific settings
    if (brandingData.features || brandingData.accentColor || brandingData.resourceVideos) {
      const currentSettings = (existingClinic.settings as any) || {};
      updateData.settings = {
        ...currentSettings,
        patientPortal: {
          ...(currentSettings.patientPortal || {}),
          ...(brandingData.accentColor && { accentColor: brandingData.accentColor }),
          ...(brandingData.features && { ...brandingData.features }),
          ...(brandingData.resourceVideos && { resourceVideos: brandingData.resourceVideos }),
        },
      };
    }

    const updatedClinic = await prisma.clinic.update({
      where: { id: clinicId },
      data: updateData,
    });

    logger.info('Clinic branding updated', { clinicId, updatedBy: user.email });

    return NextResponse.json({
      success: true,
      clinic: {
        id: updatedClinic.id,
        name: updatedClinic.name,
        logoUrl: updatedClinic.logoUrl,
        primaryColor: updatedClinic.primaryColor,
      },
    });
  } catch (error: any) {
    logger.error('Error updating clinic branding:', { error: error.message });
    return NextResponse.json({ error: 'Failed to update clinic branding' }, { status: 500 });
  }
}
