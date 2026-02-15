import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { relaxedRateLimiter } from '@/lib/security/rate-limiter-redis';
import { getTreatmentTypeFromOrder } from '@/lib/patient-portal/treatment-from-prescription';
import type { PortalTreatmentType } from '@/lib/patient-portal/types';

// Query params validation
const getBrandingQuerySchema = z.object({
  clinicId: z.string().regex(/^\d+$/, 'clinicId must be a number').transform(Number),
});

/**
 * When request is from an authenticated patient, resolve their treatment type from
 * their most recent order/prescription so portal features match their treatment (e.g.
 * semaglutide → weight loss tools, testosterone → hormone/bloodwork tools).
 */
async function resolvePatientTreatmentType(patientId: number): Promise<PortalTreatmentType | null> {
  try {
    const order = await prisma.order.findFirst({
      where: {
        patientId,
        cancelledAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        primaryMedName: true,
        rxs: { select: { medName: true } },
      },
    });
    if (!order) return null;
    return getTreatmentTypeFromOrder({
      primaryMedName: order.primaryMedName,
      rxs: order.rxs,
    });
  } catch (err) {
    logger.warn('Failed to resolve patient treatment from orders', {
      patientId,
      error: (err as Error).message,
    });
    return null;
  }
}

/**
 * GET /api/patient-portal/branding
 *
 * PUBLIC (no auth required) by design: used by the login/landing page to render
 * clinic branding before the user signs in. Auth is optional; when present and
 * user is a patient, primaryTreatment is resolved from their prescription.
 *
 * RESPONSE ALLOWLIST (no PHI): Only public branding and feature flags are returned.
 * - Clinic: id, name, logoUrl, iconUrl, faviconUrl, colors, customCss
 * - Settings: patientPortal (features, messages, resourceVideos, dietaryPlans, support*)
 * - Contact: supportEmail, supportPhone, supportHours, emergencyContact (public-facing)
 * - No patient data, no internal IDs beyond clinicId, no PII.
 *
 * Query params: clinicId (required). Rate limited: 300/min.
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

    // Optional: resolve patient-specific treatment when authenticated as patient
    let patientTreatment: PortalTreatmentType | null = null;
    try {
      const { verifyAuth } = await import('@/lib/auth/middleware');
      const authResult = await verifyAuth(request);
      if (authResult.success && authResult.user?.role === 'patient' && authResult.user.patientId) {
        patientTreatment = await resolvePatientTreatmentType(authResult.user.patientId);
      }
    } catch {
      // Non-blocking: continue with clinic default
    }

    // Note: Not selecting buttonTextColor directly as it may not exist in production DB
    // if migration hasn't run yet. We'll add it back once migration is deployed.
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

    // Parse settings JSON for features and resources (allowlist: no PHI)
    const settings = (clinic.settings as Record<string, unknown> | null) ?? {};
    const patientPortalSettings = (settings.patientPortal as Record<string, unknown>) ?? {};
    const treatmentSettings = (settings.treatment as Record<string, unknown>) ?? {};

    // Use patient's treatment from prescription when available; else clinic default
    const primaryTreatment: PortalTreatmentType =
      patientTreatment ??
      (treatmentSettings.primaryTreatment as PortalTreatmentType) ??
      'weight_loss';

    // buttonTextColor defaults to 'auto' until migration is deployed
    const branding = {
      clinicId: clinic.id,
      clinicName: clinic.name,
      logoUrl: clinic.logoUrl,
      iconUrl: clinic.iconUrl,
      faviconUrl: clinic.faviconUrl,
      primaryColor: clinic.primaryColor || '#4fa77e',
      secondaryColor: clinic.secondaryColor || '#3B82F6',
      accentColor: clinic.accentColor || patientPortalSettings.accentColor || '#d3f931',
      buttonTextColor:
        (clinic as { buttonTextColor?: string }).buttonTextColor ?? 'auto',
      customCss: clinic.customCss,

      // Treatment configuration (primaryTreatment per-patient when auth present)
      treatmentTypes: treatmentSettings.treatmentTypes || ['weight_loss'],
      primaryTreatment,
      treatmentProtocols: treatmentSettings.protocols || [],
      medicationCategories: treatmentSettings.medicationCategories || ['glp1'],

      // Feature flags - core features
      features: {
        showBMICalculator: patientPortalSettings.showBMICalculator ?? true,
        showCalorieCalculator: patientPortalSettings.showCalorieCalculator ?? true,
        showDoseCalculator: patientPortalSettings.showDoseCalculator ?? true,
        showShipmentTracking: patientPortalSettings.showShipmentTracking ?? true,
        showMedicationReminders: patientPortalSettings.showMedicationReminders ?? true,
        showWeightTracking: patientPortalSettings.showWeightTracking ?? true,
        showResources: patientPortalSettings.showResources ?? true,
        showBilling: patientPortalSettings.showBilling ?? true,
        // Treatment-specific features
        showProgressPhotos: patientPortalSettings.showProgressPhotos ?? false,
        showLabResults: patientPortalSettings.showLabResults ?? false,
        showDocuments: patientPortalSettings.showDocuments ?? true,
        showDietaryPlans: patientPortalSettings.showDietaryPlans ?? true,
        showExerciseTracking: patientPortalSettings.showExerciseTracking ?? true,
        showWaterTracking: patientPortalSettings.showWaterTracking ?? true,
        showSleepTracking: patientPortalSettings.showSleepTracking ?? true,
        showSymptomChecker: patientPortalSettings.showSymptomChecker ?? true,
        showHealthScore: patientPortalSettings.showHealthScore ?? true,
        showAchievements: patientPortalSettings.showAchievements ?? true,
        showCommunityChat: patientPortalSettings.showCommunityChat ?? false,
        showAppointments: patientPortalSettings.showAppointments ?? true,
        showTelehealth: patientPortalSettings.showTelehealth ?? false,
        showChat: patientPortalSettings.showChat ?? true,
        showCarePlan: patientPortalSettings.showCarePlan ?? true,
        showCareTeam: patientPortalSettings.showCareTeam ?? true,
      },

      // Content customization
      welcomeMessage: patientPortalSettings.welcomeMessage || null,
      dashboardMessage: patientPortalSettings.dashboardMessage || null,

      // Resource videos configurable per clinic
      resourceVideos: patientPortalSettings.resourceVideos || [],

      // Dietary plans configurable per clinic
      dietaryPlans: patientPortalSettings.dietaryPlans || [],

      // Contact info
      supportEmail: clinic.adminEmail,
      supportPhone: clinic.phone,
      supportHours: patientPortalSettings.supportHours || null,
      emergencyContact: patientPortalSettings.emergencyContact || null,

      // Auto-invite (enterprise patient portal)
      autoInviteOnFirstPayment: patientPortalSettings.autoInviteOnFirstPayment ?? false,
      autoInviteOnFirstOrder: patientPortalSettings.autoInviteOnFirstOrder ?? false,
    };

    return NextResponse.json(branding);
  } catch (error) {
    logger.error(
      'Error fetching clinic branding',
      error instanceof Error ? error : undefined
    );
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
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  secondaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  buttonTextColor: z.enum(['auto', 'light', 'dark']).optional(),
  customCss: z.string().max(10000).optional(),
  features: z
    .object({
      showBMICalculator: z.boolean().optional(),
      showCalorieCalculator: z.boolean().optional(),
      showDoseCalculator: z.boolean().optional(),
      showShipmentTracking: z.boolean().optional(),
      showMedicationReminders: z.boolean().optional(),
      showWeightTracking: z.boolean().optional(),
      showResources: z.boolean().optional(),
      showBilling: z.boolean().optional(),
    })
    .optional(),
  resourceVideos: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().optional(),
        url: z.string().url(),
        thumbnail: z.string().optional(),
        category: z.string().optional(),
      })
    )
    .optional(),
  autoInviteOnFirstPayment: z.boolean().optional(),
  autoInviteOnFirstOrder: z.boolean().optional(),
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
      return NextResponse.json(
        { error: 'Forbidden - can only update own clinic' },
        { status: 403 }
      );
    }

    // Verify the clinic exists (use select for backwards compatibility)
    const existingClinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, settings: true },
    });

    if (!existingClinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Build update object
    const updateData: Record<string, unknown> = {};

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
    if (brandingData.buttonTextColor !== undefined) {
      updateData.buttonTextColor = brandingData.buttonTextColor;
    }
    if (brandingData.customCss !== undefined) {
      updateData.customCss = brandingData.customCss;
    }

    // Update settings JSON for patient portal specific settings
    if (
      brandingData.features ||
      brandingData.accentColor ||
      brandingData.resourceVideos ||
      brandingData.autoInviteOnFirstPayment !== undefined ||
      brandingData.autoInviteOnFirstOrder !== undefined
    ) {
      const currentSettings = (existingClinic.settings as Record<string, unknown>) ?? {};
      updateData.settings = {
        ...currentSettings,
        patientPortal: {
          ...(currentSettings.patientPortal || {}),
          ...(brandingData.accentColor && { accentColor: brandingData.accentColor }),
          ...(brandingData.features && { ...brandingData.features }),
          ...(brandingData.resourceVideos && { resourceVideos: brandingData.resourceVideos }),
          ...(brandingData.autoInviteOnFirstPayment !== undefined && {
            autoInviteOnFirstPayment: brandingData.autoInviteOnFirstPayment,
          }),
          ...(brandingData.autoInviteOnFirstOrder !== undefined && {
            autoInviteOnFirstOrder: brandingData.autoInviteOnFirstOrder,
          }),
        },
      };
    }

    const updatedClinic = await prisma.clinic.update({
      where: { id: clinicId },
      data: updateData as Prisma.ClinicUpdateInput,
    });

    logger.info('Clinic branding updated', { clinicId, userId: user.id });

    return NextResponse.json({
      success: true,
      clinic: {
        id: updatedClinic.id,
        name: updatedClinic.name,
        logoUrl: updatedClinic.logoUrl,
        primaryColor: updatedClinic.primaryColor,
      },
    });
  } catch (error) {
    logger.error(
      'Error updating clinic branding',
      error instanceof Error ? error : undefined
    );
    return NextResponse.json({ error: 'Failed to update clinic branding' }, { status: 500 });
  }
}
