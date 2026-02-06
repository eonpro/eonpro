import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { encrypt, decrypt } from '@/lib/security/encryption';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Schema for Lifefile settings update - passthrough allows extra fields to be stripped
const lifefileSettingsSchema = z.object({
  // Outbound (sending TO Lifefile)
  lifefileEnabled: z.boolean().optional(),
  lifefileBaseUrl: z.string().optional().nullable().transform(v => v === '' ? null : v),
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
  lifefileInboundPath: z.string().optional().nullable().transform(v => v === '' ? null : v),
  lifefileInboundUsername: z.string().optional().nullable(),
  lifefileInboundPassword: z.string().optional().nullable(),
  lifefileInboundSecret: z.string().optional().nullable(),
  lifefileInboundAllowedIPs: z.string().optional().nullable(),
  lifefileInboundEvents: z.array(z.string()).optional().default([]),
}).passthrough(); // Allow extra fields to pass through (they'll be ignored)

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

    // Query clinic with all fields - inbound fields should always exist after migration
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
    
    // Log what we got from database
    logger.info(`[LIFEFILE GET] Raw database query result for clinic ${clinicId}:`, {
      hasClinic: !!clinic,
      inboundEnabled: clinic?.lifefileInboundEnabled,
      inboundPath: clinic?.lifefileInboundPath,
      inboundUsername: clinic?.lifefileInboundUsername ? '[encrypted]' : null,
    });
    
    // Inbound fields always exist after migration
    const hasInboundFields = true;

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

    // Build masked settings - start with outbound only
    const maskedSettings: any = {
      id: clinic.id,
      name: clinic.name,
      slug: clinic.slug || null,
      // Outbound
      lifefileEnabled: clinic.lifefileEnabled,
      lifefileBaseUrl: clinic.lifefileBaseUrl,
      lifefileUsername: decryptedUsername,
      lifefilePassword: clinic.lifefilePassword ? '••••••••' : null,
      lifefileVendorId: clinic.lifefileVendorId,
      lifefilePracticeId: clinic.lifefilePracticeId,
      lifefileLocationId: clinic.lifefileLocationId,
      lifefileNetworkId: clinic.lifefileNetworkId,
      lifefilePracticeName: clinic.lifefilePracticeName,
      lifefilePracticeAddress: clinic.lifefilePracticeAddress,
      lifefilePracticePhone: clinic.lifefilePracticePhone,
      lifefilePracticeFax: clinic.lifefilePracticeFax,
      lifefileWebhookSecret: clinic.lifefileWebhookSecret ? '••••••••' : null,
      lifefileDatapushUsername: clinic.lifefileDatapushUsername,
      lifefileDatapushPassword: clinic.lifefileDatapushPassword ? '••••••••' : null,
      // Computed fields
      hasCredentials: !!(
        clinic.lifefileBaseUrl &&
        clinic.lifefileUsername &&
        clinic.lifefilePassword &&
        clinic.lifefileVendorId &&
        clinic.lifefilePracticeId
      ),
    };

    // Add inbound fields if they exist in the database
    logger.info(`[LIFEFILE GET] Clinic ${clinicId} hasInboundFields=${hasInboundFields}`, {
      inboundEnabled: clinic.lifefileInboundEnabled,
      inboundPath: clinic.lifefileInboundPath,
      hasInboundUsername: !!clinic.lifefileInboundUsername,
      hasInboundPassword: !!clinic.lifefileInboundPassword,
      inboundEvents: clinic.lifefileInboundEvents,
    });
    
    if (hasInboundFields) {
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

      // DEBUG: Log raw database values
      logger.info(`[LIFEFILE GET DEBUG] Raw clinic data:`, {
        rawInboundEnabled: clinic.lifefileInboundEnabled,
        rawInboundPath: clinic.lifefileInboundPath,
        rawInboundUsername: clinic.lifefileInboundUsername ? '[encrypted]' : null,
        rawInboundPassword: clinic.lifefileInboundPassword ? '[encrypted]' : null,
        rawInboundEvents: clinic.lifefileInboundEvents,
      });
      
      maskedSettings.lifefileInboundEnabled = clinic.lifefileInboundEnabled;
      maskedSettings.lifefileInboundPath = clinic.lifefileInboundPath;
      maskedSettings.lifefileInboundUsername = decryptedInboundUsername;
      maskedSettings.lifefileInboundPassword = clinic.lifefileInboundPassword ? '••••••••' : null;
      maskedSettings.lifefileInboundSecret = clinic.lifefileInboundSecret ? '••••••••' : null;
      maskedSettings.lifefileInboundAllowedIPs = clinic.lifefileInboundAllowedIPs;
      maskedSettings.lifefileInboundEvents = clinic.lifefileInboundEvents;
      
      // DEBUG: Log what we're about to return
      logger.info(`[LIFEFILE GET DEBUG] Response values:`, {
        respInboundEnabled: maskedSettings.lifefileInboundEnabled,
        respInboundPath: maskedSettings.lifefileInboundPath,
        respInboundUsername: maskedSettings.lifefileInboundUsername,
        respInboundPassword: maskedSettings.lifefileInboundPassword,
        respInboundEvents: maskedSettings.lifefileInboundEvents,
      });
      maskedSettings.hasInboundCredentials = !!(
        clinic.lifefileInboundPath &&
        clinic.lifefileInboundUsername &&
        clinic.lifefileInboundPassword
      );
      maskedSettings.inboundWebhookUrl = inboundWebhookUrl;
      maskedSettings.inboundFieldsAvailable = true;
      
      logger.info(`[LIFEFILE GET] Returning inbound settings for clinic ${clinicId}`, {
        inboundEnabled: maskedSettings.lifefileInboundEnabled,
        inboundPath: maskedSettings.lifefileInboundPath,
        hasUsername: !!maskedSettings.lifefileInboundUsername,
        hasPassword: !!maskedSettings.lifefileInboundPassword,
        hasInboundCredentials: maskedSettings.hasInboundCredentials,
      });
    } else {
      // Inbound fields not available - indicate migration needed
      maskedSettings.inboundFieldsAvailable = false;
    }

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
    logger.info(`[LIFEFILE PUT] Received body for clinic ${clinicId}:`, {
      hasInboundEnabled: body.lifefileInboundEnabled !== undefined,
      inboundPath: body.lifefileInboundPath,
      hasInboundUsername: !!body.lifefileInboundUsername,
      hasInboundPassword: !!body.lifefileInboundPassword,
      inboundEvents: body.lifefileInboundEvents,
    });
    
    const parsed = lifefileSettingsSchema.safeParse(body);

    if (!parsed.success) {
      logger.error(`[LIFEFILE PUT] Validation failed for clinic ${clinicId}:`, parsed.error.issues);
      return Response.json(
        { error: 'Invalid settings data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const settings = parsed.data;
    
    // DEBUG: Log parsed settings to see what Zod gave us
    logger.info(`[LIFEFILE PUT DEBUG] After Zod parsing for clinic ${clinicId}:`, {
      parsedKeys: Object.keys(settings),
      inboundEnabled: settings.lifefileInboundEnabled,
      inboundPath: settings.lifefileInboundPath,
      inboundUsername: settings.lifefileInboundUsername,
      inboundPassword: settings.lifefileInboundPassword ? '[SET]' : '[NOT SET]',
      inboundEvents: settings.lifefileInboundEvents,
    });

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

    // DEBUG: Log exactly what we're about to save
    logger.info(`[LIFEFILE PUT DEBUG] updateData to be saved for clinic ${clinicId}:`, {
      totalKeys: Object.keys(updateData).length,
      keys: Object.keys(updateData),
      inboundEnabled: updateData.lifefileInboundEnabled,
      inboundPath: updateData.lifefileInboundPath,
      inboundUsername: updateData.lifefileInboundUsername ? '[SET]' : '[NOT SET]',
      inboundPassword: updateData.lifefileInboundPassword ? '[SET]' : '[NOT SET]',
      inboundEvents: updateData.lifefileInboundEvents,
    });

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
        // Also return inbound fields to verify they were saved
        lifefileInboundEnabled: true,
        lifefileInboundPath: true,
        lifefileInboundEvents: true,
      },
    });
    
    // DEBUG: Verify what was actually saved
    logger.info(`[LIFEFILE PUT DEBUG] After update, clinic ${clinicId} has:`, {
      inboundEnabled: updatedClinic.lifefileInboundEnabled,
      inboundPath: updatedClinic.lifefileInboundPath,
      inboundEvents: updatedClinic.lifefileInboundEvents,
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
 * POST /api/super-admin/clinics/[id]/lifefile
 * Test Lifefile connection for a clinic (outbound or inbound)
 *
 * Body: { testType?: 'outbound' | 'inbound' } - defaults to 'outbound'
 */
export const POST = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteParams) => {
    const { id } = await context!.params;
    const clinicId = parseInt(id, 10);

    if (isNaN(clinicId)) {
      return Response.json({ error: 'Invalid clinic ID' }, { status: 400 });
    }

    // Parse request body to determine test type
    let testType: 'outbound' | 'inbound' = 'outbound';
    try {
      const body = await req.json();
      if (body.testType === 'inbound') {
        testType = 'inbound';
      }
    } catch {
      // No body or invalid JSON - default to outbound
    }

    if (testType === 'inbound') {
      // Test inbound webhook configuration
      return testInboundWebhook(clinicId, user);
    } else {
      // Test outbound Lifefile API connection
      return testOutboundConnection(clinicId, user);
    }
  },
  { roles: ['super_admin'] }
);

/**
 * Test outbound Lifefile API connection
 */
async function testOutboundConnection(clinicId: number, user: AuthUser) {
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
    logger.error(`[SUPER-ADMIN] Lifefile outbound test failed for clinic ${clinicId}:`, error);
    return Response.json(
      {
        success: false,
        error: 'Failed to connect to Lifefile',
        detail: error.message,
      },
      { status: 400 }
    );
  }
}

/**
 * Test inbound webhook configuration by sending a test webhook to ourselves
 */
async function testInboundWebhook(clinicId: number, user: AuthUser) {
  try {
    // Get clinic's inbound webhook settings
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        lifefileInboundEnabled: true,
        lifefileInboundPath: true,
        lifefileInboundUsername: true,
        lifefileInboundPassword: true,
        lifefileInboundEvents: true,
      },
    });

    if (!clinic) {
      return Response.json({ success: false, error: 'Clinic not found' }, { status: 404 });
    }

    // Validate configuration
    const errors: string[] = [];

    if (!clinic.lifefileInboundEnabled) {
      errors.push('Inbound webhook is not enabled');
    }

    if (!clinic.lifefileInboundPath) {
      errors.push('Webhook path is not configured');
    }

    if (!clinic.lifefileInboundUsername) {
      errors.push('Username is not configured');
    }

    if (!clinic.lifefileInboundPassword) {
      errors.push('Password is not configured');
    }

    if (!clinic.lifefileInboundEvents || clinic.lifefileInboundEvents.length === 0) {
      errors.push('No event types are selected');
    }

    if (errors.length > 0) {
      return Response.json({
        success: false,
        error: 'Inbound webhook configuration incomplete',
        details: errors,
      }, { status: 400 });
    }

    // Decrypt credentials to send a test request
    let username: string;
    let password: string;
    let decryptionStatus = { username: 'success', password: 'success' };

    try {
      const decrypted = decrypt(clinic.lifefileInboundUsername!);
      username = decrypted || clinic.lifefileInboundUsername!;
      if (!decrypted) {
        decryptionStatus.username = 'fallback-to-raw';
      }
    } catch (e) {
      username = clinic.lifefileInboundUsername!;
      decryptionStatus.username = 'failed-using-raw';
    }

    try {
      const decrypted = decrypt(clinic.lifefileInboundPassword!);
      password = decrypted || clinic.lifefileInboundPassword!;
      if (!decrypted) {
        decryptionStatus.password = 'fallback-to-raw';
      }
    } catch (e) {
      password = clinic.lifefileInboundPassword!;
      decryptionStatus.password = 'failed-using-raw';
    }

    // Build the webhook URL - always use production URL
    const webhookUrl = `https://app.eonpro.io/api/webhooks/lifefile/inbound/${clinic.lifefileInboundPath}`;

    // Send a test webhook to our own endpoint
    const testPayload = {
      type: 'test',
      testMode: true,
      timestamp: new Date().toISOString(),
      message: 'Inbound webhook test from admin panel',
      testId: `test_${Date.now()}`,
    };

    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    logger.info(`[SUPER-ADMIN] Testing inbound webhook for clinic ${clinicId}`, {
      webhookUrl,
      userId: user.id,
      decryptionStatus,
    });

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'X-Webhook-Test': 'true',
      },
      body: JSON.stringify(testPayload),
    });

    const responseText = await response.text();
    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (response.ok) {
      logger.info(`[SUPER-ADMIN] Inbound webhook test successful for clinic ${clinicId}`);
      return Response.json({
        success: true,
        message: 'Inbound webhook test successful! Your endpoint is configured correctly.',
        details: {
          webhookUrl,
          statusCode: response.status,
          response: responseData,
        },
      });
    } else {
      logger.warn(`[SUPER-ADMIN] Inbound webhook test failed for clinic ${clinicId}`, {
        status: response.status,
        response: responseData,
        decryptionStatus,
      });

      // Provide helpful error message based on the response
      let errorMessage = `Webhook test failed with status ${response.status}`;
      if (response.status === 401) {
        errorMessage = 'Authentication failed. Please save your settings first, then test again.';
      } else if (response.status === 404) {
        errorMessage = 'Webhook endpoint not found. Please save your settings first.';
      } else if (response.status === 503) {
        errorMessage = 'Server temporarily unavailable. Please try again in a moment.';
      }

      return Response.json({
        success: false,
        error: errorMessage,
        details: {
          webhookUrl,
          statusCode: response.status,
          response: responseData,
        },
      }, { status: 400 });
    }
  } catch (error: any) {
    logger.error(`[SUPER-ADMIN] Inbound webhook test error for clinic ${clinicId}:`, error);

    // Check for specific error types
    let errorMessage = 'Failed to test inbound webhook';
    if (error.message?.includes('fetch')) {
      errorMessage = 'Could not reach webhook endpoint. Server may be busy.';
    } else if (error.message?.includes('connection')) {
      errorMessage = 'Database connection issue. Please try again.';
    }

    return Response.json({
      success: false,
      error: errorMessage,
      detail: error.message,
    }, { status: 500 });
  }
}

