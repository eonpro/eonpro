import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { encrypt, decrypt } from '@/lib/security/encryption';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const doseSpotSettingsSchema = z
  .object({
    doseSpotEnabled: z.boolean().optional(),
    doseSpotBaseUrl: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v === '' ? null : v)),
    doseSpotTokenUrl: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v === '' ? null : v)),
    doseSpotSsoUrl: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v === '' ? null : v)),
    doseSpotClinicId: z.string().optional().nullable(),
    doseSpotClinicKey: z.string().optional().nullable(),
    doseSpotAdminId: z.string().optional().nullable(),
    doseSpotSubscriptionKey: z.string().optional().nullable(),
  })
  .passthrough();

type RouteParams = { params: Promise<{ id: string }> };

const MASKED_VALUE = '••••••••';

/**
 * GET /api/super-admin/clinics/[id]/dosespot
 * Get DoseSpot settings for a clinic (secrets masked)
 */
export const GET = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteParams) => {
    try {
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
          subdomain: true,
          doseSpotEnabled: true,
          doseSpotBaseUrl: true,
          doseSpotTokenUrl: true,
          doseSpotSsoUrl: true,
          doseSpotClinicId: true,
          doseSpotClinicKey: true,
          doseSpotAdminId: true,
          doseSpotSubscriptionKey: true,
        },
      });

      if (!clinic) {
        return Response.json({ error: 'Clinic not found' }, { status: 404 });
      }

      const hasCredentials = !!(
        clinic.doseSpotBaseUrl &&
        clinic.doseSpotClinicId &&
        clinic.doseSpotClinicKey &&
        clinic.doseSpotAdminId &&
        clinic.doseSpotSubscriptionKey
      );

      return Response.json({
        settings: {
          id: clinic.id,
          name: clinic.name,
          slug: clinic.subdomain,
          doseSpotEnabled: clinic.doseSpotEnabled,
          doseSpotBaseUrl: clinic.doseSpotBaseUrl,
          doseSpotTokenUrl: clinic.doseSpotTokenUrl,
          doseSpotSsoUrl: clinic.doseSpotSsoUrl,
          doseSpotClinicId: clinic.doseSpotClinicId,
          doseSpotClinicKey: clinic.doseSpotClinicKey ? MASKED_VALUE : null,
          doseSpotAdminId: clinic.doseSpotAdminId,
          doseSpotSubscriptionKey: clinic.doseSpotSubscriptionKey ? MASKED_VALUE : null,
          hasCredentials,
        },
      });
    } catch (error) {
      logger.error('Error fetching DoseSpot settings', {
        error: error instanceof Error ? error.message : String(error),
      });
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['super_admin'] }
);

/**
 * PUT /api/super-admin/clinics/[id]/dosespot
 * Update DoseSpot settings for a clinic
 */
export const PUT = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteParams) => {
    try {
      const { id } = await context!.params;
      const clinicId = parseInt(id, 10);

      if (isNaN(clinicId)) {
        return Response.json({ error: 'Invalid clinic ID' }, { status: 400 });
      }

      const body = await req.json();
      const parsed = doseSpotSettingsSchema.safeParse(body);

      if (!parsed.success) {
        return Response.json(
          { error: 'Validation failed', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const data = parsed.data;

      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: {
          id: true,
          doseSpotClinicKey: true,
          doseSpotSubscriptionKey: true,
        },
      });

      if (!clinic) {
        return Response.json({ error: 'Clinic not found' }, { status: 404 });
      }

      const updateData: Record<string, unknown> = {};

      if (data.doseSpotEnabled !== undefined) {
        updateData.doseSpotEnabled = data.doseSpotEnabled;
      }
      if (data.doseSpotBaseUrl !== undefined) {
        updateData.doseSpotBaseUrl = data.doseSpotBaseUrl;
      }
      if (data.doseSpotTokenUrl !== undefined) {
        updateData.doseSpotTokenUrl = data.doseSpotTokenUrl;
      }
      if (data.doseSpotSsoUrl !== undefined) {
        updateData.doseSpotSsoUrl = data.doseSpotSsoUrl;
      }
      if (data.doseSpotClinicId !== undefined) {
        updateData.doseSpotClinicId = data.doseSpotClinicId;
      }
      if (data.doseSpotAdminId !== undefined) {
        updateData.doseSpotAdminId = data.doseSpotAdminId;
      }

      if (data.doseSpotClinicKey !== undefined && data.doseSpotClinicKey !== MASKED_VALUE) {
        updateData.doseSpotClinicKey = data.doseSpotClinicKey
          ? encrypt(data.doseSpotClinicKey)
          : null;
      }

      if (
        data.doseSpotSubscriptionKey !== undefined &&
        data.doseSpotSubscriptionKey !== MASKED_VALUE
      ) {
        updateData.doseSpotSubscriptionKey = data.doseSpotSubscriptionKey
          ? encrypt(data.doseSpotSubscriptionKey)
          : null;
      }

      if (data.doseSpotEnabled) {
        const features = (
          await prisma.clinic.findUnique({
            where: { id: clinicId },
            select: { features: true },
          })
        )?.features as Record<string, unknown> | null;

        updateData.features = {
          ...(features || {}),
          DOSESPOT: true,
        };
      }

      await prisma.clinic.update({
        where: { id: clinicId },
        data: updateData,
      });

      logger.info('[DOSESPOT ADMIN] Settings updated', {
        clinicId,
        updatedBy: user.id,
        fieldsUpdated: Object.keys(updateData),
      });

      return Response.json({ success: true, message: 'DoseSpot settings saved' });
    } catch (error) {
      logger.error('Error saving DoseSpot settings', {
        error: error instanceof Error ? error.message : String(error),
      });
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { roles: ['super_admin'] }
);
