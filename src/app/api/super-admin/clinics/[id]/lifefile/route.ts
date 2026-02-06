import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { encrypt, decrypt } from '@/lib/security/encryption';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Schema for Lifefile settings update
const lifefileSettingsSchema = z.object({
  // Outbound (sending TO Lifefile)
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
  // Inbound (receiving FROM Lifefile)
  lifefileInboundEnabled: z.boolean().optional(),
  lifefileInboundPath: z.string().optional().nullable(),
  lifefileInboundUsername: z.string().optional().nullable(),
  lifefileInboundPassword: z.string().optional().nullable(),
  lifefileInboundSecret: z.string().optional().nullable(),
  lifefileInboundAllowedIPs: z.string().optional().nullable(),
  lifefileInboundEvents: z.array(z.string()).optional(),
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
        slug: true,
        // Outbound settings
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
        // Inbound settings
        lifefileInboundEnabled: true,
        lifefileInboundPath: true,
        lifefileInboundUsername: true,
        lifefileInboundPassword: true,
        lifefileInboundSecret: true,
        lifefileInboundAllowedIPs: true,
        lifefileInboundEvents: true,
      },
    });

    if (!clinic) {
      return Response.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Decrypt username for display, mask passwords
    let decryptedUsername = clinic.lifefileUsername;
    if (clinic.lifefileUsername) {
      try {
        const decrypted = decrypt(clinic.lifefileUsername);
        if (decrypted) {
          decryptedUsername = decrypted;
        }
      } catch (e) {
        // If decryption fails, show placeholder - don't expose encrypted value
        logger.warn(`Failed to decrypt username for clinic ${clinicId}, showing placeholder`);
        decryptedUsername = '[encrypted - please re-enter]';
      }
    }

    // Decrypt inbound username
    let decryptedInboundUsername = clinic.lifefileInboundUsername;
    if (clinic.lifefileInboundUsername) {
      try {
        const decrypted = decrypt(clinic.lifefileInboundUsername);
        if (decrypted) {
          decryptedInboundUsername = decrypted;
        }
      } catch (e) {
        logger.warn(`Failed to decrypt inbound username for clinic ${clinicId}, showing placeholder`);
        decryptedInboundUsername = '[encrypted - please re-enter]';
      }
    }

    // Generate webhook URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://app.eonpro.io';
    const inboundWebhookUrl = clinic.lifefileInboundPath
      ? `${baseUrl}/api/webhooks/lifefile/inbound/${clinic.lifefileInboundPath}`
      : null;

    // Mask sensitive fields (don't send actual passwords)
    const maskedSettings = {
      ...clinic,
      // Outbound
      lifefileUsername: decryptedUsername,
      lifefilePassword: clinic.lifefilePassword ? '••••••••' : null,
      lifefileWebhookSecret: clinic.lifefileWebhookSecret ? '••••••••' : null,
      lifefileDatapushPassword: clinic.lifefileDatapushPassword ? '••••••••' : null,
      // Inbound
      lifefileInboundUsername: decryptedInboundUsername,
      lifefileInboundPassword: clinic.lifefileInboundPassword ? '••••••••' : null,
      lifefileInboundSecret: clinic.lifefileInboundSecret ? '••••••••' : null,
      // Computed fields
      hasCredentials: !!(
        clinic.lifefileBaseUrl &&
        clinic.lifefileUsername &&
        clinic.lifefilePassword &&
        clinic.lifefileVendorId &&
        clinic.lifefilePracticeId
      ),
      hasInboundCredentials: !!(
        clinic.lifefileInboundPath &&
        clinic.lifefileInboundUsername &&
        clinic.lifefileInboundPassword
      ),
      inboundWebhookUrl,
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

    // Check if clinic exists (select only needed fields for backwards compatibility)
    const existingClinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { id: true, name: true },
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
      // Skip if placeholder from failed decryption
      if (settings.lifefileUsername === '[encrypted - please re-enter]') {
        // Don't update - keep existing value
      } else if (settings.lifefileUsername) {
        // Check if value looks already encrypted (3 base64 parts with colons)
        const parts = settings.lifefileUsername.split(':');
        const looksEncrypted = parts.length === 3 && 
          parts.every((p: string) => /^[A-Za-z0-9+/]+=*$/.test(p));
        
        if (looksEncrypted) {
          // Already encrypted - store as-is to prevent double encryption
          logger.warn(`[LIFEFILE] Username for clinic ${clinicId} appears already encrypted, storing as-is`);
          updateData.lifefileUsername = settings.lifefileUsername;
        } else {
          // Encrypt plaintext username
          updateData.lifefileUsername = encrypt(settings.lifefileUsername);
        }
      } else {
        updateData.lifefileUsername = null;
      }
    }

    // Only update password if a new one is provided (not masked placeholder)
    if (settings.lifefilePassword !== undefined && settings.lifefilePassword !== '••••••••') {
      if (settings.lifefilePassword) {
        // Check if value looks already encrypted (3 base64 parts with colons)
        const parts = settings.lifefilePassword.split(':');
        const looksEncrypted = parts.length === 3 && 
          parts.every((p: string) => /^[A-Za-z0-9+/]+=*$/.test(p));
        
        if (looksEncrypted) {
          // Already encrypted - store as-is to prevent double encryption
          logger.warn(`[LIFEFILE] Password for clinic ${clinicId} appears already encrypted, storing as-is`);
          updateData.lifefilePassword = settings.lifefilePassword;
        } else {
          // Encrypt plaintext password
          updateData.lifefilePassword = encrypt(settings.lifefilePassword);
        }
      } else {
        updateData.lifefilePassword = null;
      }
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

    // ===== INBOUND WEBHOOK SETTINGS =====

    if (settings.lifefileInboundEnabled !== undefined) {
      updateData.lifefileInboundEnabled = settings.lifefileInboundEnabled;
    }

    if (settings.lifefileInboundPath !== undefined) {
      // Validate path format (alphanumeric, hyphens, underscores only)
      if (settings.lifefileInboundPath) {
        const pathRegex = /^[a-zA-Z0-9_-]+$/;
        if (!pathRegex.test(settings.lifefileInboundPath)) {
          return Response.json(
            { error: 'Invalid webhook path format. Use only letters, numbers, hyphens, and underscores.' },
            { status: 400 }
          );
        }
        // Check for uniqueness (excluding current clinic)
        const existingPath = await prisma.clinic.findFirst({
          where: {
            lifefileInboundPath: settings.lifefileInboundPath,
            NOT: { id: clinicId },
          },
        });
        if (existingPath) {
          return Response.json(
            { error: 'Webhook path already in use by another clinic.' },
            { status: 400 }
          );
        }
      }
      updateData.lifefileInboundPath = settings.lifefileInboundPath || null;
    }

    if (settings.lifefileInboundUsername !== undefined) {
      if (settings.lifefileInboundUsername === '[encrypted - please re-enter]') {
        // Don't update - keep existing value
      } else if (settings.lifefileInboundUsername) {
        // Check if already encrypted
        const parts = settings.lifefileInboundUsername.split(':');
        const looksEncrypted = parts.length === 3 &&
          parts.every((p: string) => /^[A-Za-z0-9+/]+=*$/.test(p));

        if (looksEncrypted) {
          updateData.lifefileInboundUsername = settings.lifefileInboundUsername;
        } else {
          updateData.lifefileInboundUsername = encrypt(settings.lifefileInboundUsername);
        }
      } else {
        updateData.lifefileInboundUsername = null;
      }
    }

    if (settings.lifefileInboundPassword !== undefined && settings.lifefileInboundPassword !== '••••••••') {
      updateData.lifefileInboundPassword = settings.lifefileInboundPassword
        ? encrypt(settings.lifefileInboundPassword)
        : null;
    }

    if (settings.lifefileInboundSecret !== undefined && settings.lifefileInboundSecret !== '••••••••') {
      updateData.lifefileInboundSecret = settings.lifefileInboundSecret
        ? encrypt(settings.lifefileInboundSecret)
        : null;
    }

    if (settings.lifefileInboundAllowedIPs !== undefined) {
      updateData.lifefileInboundAllowedIPs = settings.lifefileInboundAllowedIPs || null;
    }

    if (settings.lifefileInboundEvents !== undefined) {
      updateData.lifefileInboundEvents = settings.lifefileInboundEvents || [];
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

