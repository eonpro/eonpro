/**
 * Clinic Portal Settings API
 * Allows clinic admins to customize their patient portal
 * 
 * PUT /api/admin/clinic/portal-settings
 * GET /api/admin/clinic/portal-settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const treatmentTypeSchema = z.enum([
  'weight_loss',
  'hormone_therapy',
  'mens_health',
  'womens_health',
  'sexual_health',
  'anti_aging',
  'general_wellness',
  'custom',
]);

const medicationCategorySchema = z.enum([
  'glp1',
  'testosterone',
  'hcg',
  'peptides',
  'vitamins',
  'compounded',
  'other',
]);

const treatmentProtocolSchema = z.object({
  id: z.string(),
  name: z.string().max(100),
  description: z.string().max(500).optional(),
  medicationCategories: z.array(medicationCategorySchema),
  durationWeeks: z.number().min(1).max(104),
  checkInFrequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']),
  requiresWeightTracking: z.boolean(),
  requiresPhotos: z.boolean(),
  requiresLabWork: z.boolean(),
});

const resourceVideoSchema = z.object({
  id: z.string(),
  title: z.string().max(200),
  description: z.string().max(500).optional(),
  url: z.string().url(),
  thumbnail: z.string().optional(),
  category: z.string().max(50).optional(),
});

const dietaryPlanSchema = z.object({
  id: z.string(),
  name: z.string().max(100),
  description: z.string().max(500).optional(),
  calorieTarget: z.number().min(800).max(5000),
  pdfUrl: z.string().url().nullable().optional(),
});

const portalSettingsSchema = z.object({
  // Treatment configuration
  treatmentTypes: z.array(treatmentTypeSchema).optional(),
  primaryTreatment: treatmentTypeSchema.optional(),
  treatmentProtocols: z.array(treatmentProtocolSchema).optional(),
  medicationCategories: z.array(medicationCategorySchema).optional(),

  // Feature flags
  features: z.object({
    showBMICalculator: z.boolean().optional(),
    showCalorieCalculator: z.boolean().optional(),
    showDoseCalculator: z.boolean().optional(),
    showShipmentTracking: z.boolean().optional(),
    showMedicationReminders: z.boolean().optional(),
    showWeightTracking: z.boolean().optional(),
    showResources: z.boolean().optional(),
    showBilling: z.boolean().optional(),
    showProgressPhotos: z.boolean().optional(),
    showLabResults: z.boolean().optional(),
    showDietaryPlans: z.boolean().optional(),
    showExerciseTracking: z.boolean().optional(),
    showWaterTracking: z.boolean().optional(),
    showSleepTracking: z.boolean().optional(),
    showSymptomChecker: z.boolean().optional(),
    showHealthScore: z.boolean().optional(),
    showAchievements: z.boolean().optional(),
    showCommunityChat: z.boolean().optional(),
    showAppointments: z.boolean().optional(),
    showTelehealth: z.boolean().optional(),
    showChat: z.boolean().optional(),
    showCarePlan: z.boolean().optional(),
    showCareTeam: z.boolean().optional(),
  }).optional(),

  // Content customization
  welcomeMessage: z.string().max(500).nullable().optional(),
  dashboardMessage: z.string().max(500).nullable().optional(),
  
  // Resources
  resourceVideos: z.array(resourceVideoSchema).optional(),
  dietaryPlans: z.array(dietaryPlanSchema).optional(),
  
  // Support
  supportHours: z.string().max(200).nullable().optional(),
  emergencyContact: z.string().max(50).nullable().optional(),
});

// ============================================================================
// GET - Fetch current portal settings
// ============================================================================

export const GET = withAuth(async (request: NextRequest, user: AuthUser) => {
  // Only admins can access this
  if (!['admin', 'super_admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const clinicId = user.role === 'super_admin' 
    ? parseInt(request.nextUrl.searchParams.get('clinicId') || '0')
    : user.clinicId;

  if (!clinicId) {
    return NextResponse.json({ error: 'Clinic ID required' }, { status: 400 });
  }

  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        settings: true,
        features: true,
      },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    const settings = (clinic.settings as any) || {};
    const patientPortal = settings.patientPortal || {};
    const treatment = settings.treatment || {};

    return NextResponse.json({
      clinicId: clinic.id,
      clinicName: clinic.name,
      treatmentTypes: treatment.treatmentTypes || ['weight_loss'],
      primaryTreatment: treatment.primaryTreatment || 'weight_loss',
      treatmentProtocols: treatment.protocols || [],
      medicationCategories: treatment.medicationCategories || ['glp1'],
      features: {
        showBMICalculator: patientPortal.showBMICalculator ?? true,
        showCalorieCalculator: patientPortal.showCalorieCalculator ?? true,
        showDoseCalculator: patientPortal.showDoseCalculator ?? true,
        showShipmentTracking: patientPortal.showShipmentTracking ?? true,
        showMedicationReminders: patientPortal.showMedicationReminders ?? true,
        showWeightTracking: patientPortal.showWeightTracking ?? true,
        showResources: patientPortal.showResources ?? true,
        showBilling: patientPortal.showBilling ?? true,
        showProgressPhotos: patientPortal.showProgressPhotos ?? false,
        showLabResults: patientPortal.showLabResults ?? false,
        showDietaryPlans: patientPortal.showDietaryPlans ?? true,
        showExerciseTracking: patientPortal.showExerciseTracking ?? true,
        showWaterTracking: patientPortal.showWaterTracking ?? true,
        showSleepTracking: patientPortal.showSleepTracking ?? true,
        showSymptomChecker: patientPortal.showSymptomChecker ?? true,
        showHealthScore: patientPortal.showHealthScore ?? true,
        showAchievements: patientPortal.showAchievements ?? true,
        showCommunityChat: patientPortal.showCommunityChat ?? false,
        showAppointments: patientPortal.showAppointments ?? true,
        showTelehealth: patientPortal.showTelehealth ?? false,
        showChat: patientPortal.showChat ?? true,
        showCarePlan: patientPortal.showCarePlan ?? true,
        showCareTeam: patientPortal.showCareTeam ?? true,
      },
      welcomeMessage: patientPortal.welcomeMessage || null,
      dashboardMessage: patientPortal.dashboardMessage || null,
      resourceVideos: patientPortal.resourceVideos || [],
      dietaryPlans: patientPortal.dietaryPlans || [],
      supportHours: patientPortal.supportHours || null,
      emergencyContact: patientPortal.emergencyContact || null,
    });
  } catch (error) {
    logger.error('Error fetching portal settings:', { error, clinicId });
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}, { roles: ['admin', 'super_admin'] });

// ============================================================================
// PUT - Update portal settings
// ============================================================================

export const PUT = withAuth(async (request: NextRequest, user: AuthUser) => {
  // Only admins can access this
  if (!['admin', 'super_admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const clinicId = body.clinicId || user.clinicId;

    // Non-super admins can only update their own clinic
    if (user.role !== 'super_admin' && user.clinicId !== clinicId) {
      return NextResponse.json({ error: 'Cannot update another clinic' }, { status: 403 });
    }

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic ID required' }, { status: 400 });
    }

    // Validate input
    const parseResult = portalSettingsSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid settings', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Fetch existing clinic
    const existingClinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, settings: true },
    });

    if (!existingClinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Merge with existing settings
    const existingSettings = (existingClinic.settings as any) || {};
    const updatedSettings = {
      ...existingSettings,
      patientPortal: {
        ...(existingSettings.patientPortal || {}),
        ...(data.features && { ...data.features }),
        ...(data.welcomeMessage !== undefined && { welcomeMessage: data.welcomeMessage }),
        ...(data.dashboardMessage !== undefined && { dashboardMessage: data.dashboardMessage }),
        ...(data.resourceVideos && { resourceVideos: data.resourceVideos }),
        ...(data.dietaryPlans && { dietaryPlans: data.dietaryPlans }),
        ...(data.supportHours !== undefined && { supportHours: data.supportHours }),
        ...(data.emergencyContact !== undefined && { emergencyContact: data.emergencyContact }),
      },
      treatment: {
        ...(existingSettings.treatment || {}),
        ...(data.treatmentTypes && { treatmentTypes: data.treatmentTypes }),
        ...(data.primaryTreatment && { primaryTreatment: data.primaryTreatment }),
        ...(data.treatmentProtocols && { protocols: data.treatmentProtocols }),
        ...(data.medicationCategories && { medicationCategories: data.medicationCategories }),
      },
    };

    // Update clinic
    await prisma.clinic.update({
      where: { id: clinicId },
      data: { settings: updatedSettings },
    });

    logger.info('Portal settings updated', { clinicId, updatedBy: user.email });

    return NextResponse.json({
      success: true,
      message: 'Portal settings updated successfully',
    });
  } catch (error) {
    logger.error('Error updating portal settings:', { error });
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}, { roles: ['admin', 'super_admin'] });
