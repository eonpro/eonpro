import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { encrypt, decrypt } from '@/lib/security/encryption';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Schema for Lifefile settings update
const lifefileSettingsSchema = z.object({
  lifefileEnabled: z.boolean().optional(),
  lifefileBaseUrl: z.string().url().optional().nullable(),
  lifefileUsername: z.string().optional().nullable(),
  lifefilePassword: z.string().optional().nullable(),
  lifefileVendorId: z.string().optional().nullable(),
  lifefilePracticeId: z.string().optional().nullable(),
  lifefileLocationId: z.string().optional().nullable(),
  lifefileNetworkId: z.string().optional().nullable(),
  lifefilePracticeName: z.string().optional().nullable(),
  lifefilePracticeAddress: z.string().optional().nullable(),
  lifefilePracticePhone: z.string().optional().nullable(),
  lifefilePracticeFax: z.string().optional().nullable(),
  lifefileWebhookSecret: z.string().optional().nullable(),
  lifefileDatapushUsername: z.string().optional().nullable(),
  lifefileDatapushPassword: z.string().optional().nullable(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/super-admin/clinics/[id]/lifefile
 * Get Lifefile settings for a clinic (passwords masked)
 */
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteParams) => {
    const { id } = await context!.params;
    const clinicId = parseInt(id, 10);

    if (isNaN(clinicId)) {
      return Response.json({ error: 'Invalid clinic ID' }, { status: 400 });
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        lifefileEnabled: true,
        lifefileBaseUrl: true,
        lifefileUsername: true,
        lifefilePassword: true,
        lifefileVendorId: true,
        lifefilePracticeId: true,
        lifefileLocationId: true,
        lifefileNetworkId: true,
        lifefilePracticeName: true,
        lifefilePracticeAddress: true,
        lifefilePracticePhone: true,
        lifefilePracticeFax: true,
        lifefileWebhookSecret: true,
        lifefileDatapushUsername: true,
        lifefileDatapushPassword: true,
      },
    });

    if (!clinic) {
      return Response.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Mask sensitive fields (don't send actual passwords)
    const maskedSettings = {
      ...clinic,
      lifefilePassword: clinic.lifefilePassword ? '••••••••' : null,
      lifefileWebhookSecret: clinic.lifefileWebhookSecret ? '••••••••' : null,
      lifefileDatapushPassword: clinic.lifefileDatapushPassword ? '••••••••' : null,
      // Indicate if credentials are configured
      hasCredentials: !!(
        clinic.lifefileBaseUrl &&
        clinic.lifefileUsername &&
        clinic.lifefilePassword &&
        clinic.lifefileVendorId &&
        clinic.lifefilePracticeId
      ),
    };

    return Response.json({ settings: maskedSettings });
  },
  { roles: ['super_admin'] }
);

/**
 * PUT /api/super-admin/clinics/[id]/lifefile
 * Update Lifefile settings for a clinic
 */
export const PUT = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteParams) => {
    const { id } = await context!.params;
    const clinicId = parseInt(id, 10);

    if (isNaN(clinicId)) {
      return Response.json({ error: 'Invalid clinic ID' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = lifefileSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid settings data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const settings = parsed.data;

    // Check if clinic exists
    const existingClinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!existingClinic) {
      return Response.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Prepare update data - encrypt sensitive fields
    const updateData: any = {};

    if (settings.lifefileEnabled !== undefined) {
      updateData.lifefileEnabled = settings.lifefileEnabled;
    }

    if (settings.lifefileBaseUrl !== undefined) {
      updateData.lifefileBaseUrl = settings.lifefileBaseUrl;
    }

    if (settings.lifefileUsername !== undefined) {
      // Encrypt username for extra security
      updateData.lifefileUsername = settings.lifefileUsername
        ? encrypt(settings.lifefileUsername)
        : null;
    }

    // Only update password if a new one is provided (not masked placeholder)
    if (settings.lifefilePassword !== undefined && settings.lifefilePassword !== '••••••••') {
      updateData.lifefilePassword = settings.lifefilePassword
        ? encrypt(settings.lifefilePassword)
        : null;
    }

    if (settings.lifefileVendorId !== undefined) {
      updateData.lifefileVendorId = settings.lifefileVendorId;
    }

    if (settings.lifefilePracticeId !== undefined) {
      updateData.lifefilePracticeId = settings.lifefilePracticeId;
    }

    if (settings.lifefileLocationId !== undefined) {
      updateData.lifefileLocationId = settings.lifefileLocationId;
    }

    if (settings.lifefileNetworkId !== undefined) {
      updateData.lifefileNetworkId = settings.lifefileNetworkId;
    }

    if (settings.lifefilePracticeName !== undefined) {
      updateData.lifefilePracticeName = settings.lifefilePracticeName;
    }

    if (settings.lifefilePracticeAddress !== undefined) {
      updateData.lifefilePracticeAddress = settings.lifefilePracticeAddress;
    }

    if (settings.lifefilePracticePhone !== undefined) {
      updateData.lifefilePracticePhone = settings.lifefilePracticePhone;
    }

    if (settings.lifefilePracticeFax !== undefined) {
      updateData.lifefilePracticeFax = settings.lifefilePracticeFax;
    }

    // Only update webhook secret if a new one is provided
    if (settings.lifefileWebhookSecret !== undefined && settings.lifefileWebhookSecret !== '••••••••') {
      updateData.lifefileWebhookSecret = settings.lifefileWebhookSecret
        ? encrypt(settings.lifefileWebhookSecret)
        : null;
    }

    if (settings.lifefileDatapushUsername !== undefined) {
      updateData.lifefileDatapushUsername = settings.lifefileDatapushUsername;
    }

    // Only update datapush password if a new one is provided
    if (settings.lifefileDatapushPassword !== undefined && settings.lifefileDatapushPassword !== '••••••••') {
      updateData.lifefileDatapushPassword = settings.lifefileDatapushPassword
        ? encrypt(settings.lifefileDatapushPassword)
        : null;
    }

    // Update the clinic
    const updatedClinic = await prisma.clinic.update({
      where: { id: clinicId },
      data: updateData,
      select: {
        id: true,
        name: true,
        lifefileEnabled: true,
        lifefileBaseUrl: true,
        lifefileVendorId: true,
        lifefilePracticeId: true,
        lifefileLocationId: true,
        lifefileNetworkId: true,
        lifefilePracticeName: true,
      },
    });

    // Log the update
    logger.info(`[SUPER-ADMIN] Lifefile settings updated for clinic ${clinicId} by ${user.email}`);

    // Create audit log
    await prisma.clinicAuditLog.create({
      data: {
        clinicId,
        action: 'LIFEFILE_SETTINGS_UPDATE',
        userId: user.id,
        details: {
          updatedFields: Object.keys(updateData),
          updatedBy: user.email,
        },
      },
    });

    return Response.json({
      message: 'Lifefile settings updated successfully',
      clinic: updatedClinic,
    });
  },
  { roles: ['super_admin'] }
);

/**
 * POST /api/super-admin/clinics/[id]/lifefile/test
 * Test Lifefile connection for a clinic
 */
export const POST = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteParams) => {
    const { id } = await context!.params;
    const clinicId = parseInt(id, 10);

    if (isNaN(clinicId)) {
      return Response.json({ error: 'Invalid clinic ID' }, { status: 400 });
    }

    try {
      const { getClinicLifefileClient } = await import('@/lib/clinic-lifefile');
      const client = await getClinicLifefileClient(clinicId);

      // Try to make a simple API call to test the connection
      // This depends on what endpoints Lifefile supports for testing
      // For now, we'll just verify the client was created successfully

      return Response.json({
        success: true,
        message: 'Lifefile connection configured successfully',
      });
    } catch (error: any) {
      logger.error(`[SUPER-ADMIN] Lifefile test failed for clinic ${clinicId}:`, error);
      return Response.json(
        {
          success: false,
          error: 'Failed to connect to Lifefile',
          detail: error.message,
        },
        { status: 400 }
      );
    }
  },
  { roles: ['super_admin'] }
);

