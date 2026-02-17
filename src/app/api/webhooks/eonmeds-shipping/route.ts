/**
 * EonMeds (Apollo Based Health) Lifefile Shipping Webhook
 *
 * Receives shipping/tracking updates from Lifefile for EonMeds prescriptions.
 * Stores data at the patient profile level in PatientShippingUpdate table.
 *
 * CREDENTIALS: Read from clinic's Inbound Webhook Settings in admin UI
 * Configure at: /super-admin/clinics/[id] -> Pharmacy tab -> Inbound Webhook Settings
 *
 * Example curl for LifeFile to call:
 *
 * curl -X POST https://eonmeds.eonpro.io/api/webhooks/eonmeds-shipping \
 *   -H "Authorization: Basic $(echo -n 'lifehook_user:<PASSWORD>' | base64)" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "trackingNumber": "TRACKING_NUMBER",
 *     "orderId": "LF_ORDER_ID",
 *     "deliveryService": "SERVICE",
 *     "brand": "Eon Medical + Wellness"
 *   }'
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, basePrisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ShippingStatus, WebhookStatus } from '@prisma/client';
import { z } from 'zod';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { decrypt } from '@/lib/security/encryption';
import crypto from 'crypto';

/**
 * Safely decrypt a PHI field, returning original value if decryption fails
 */
function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decryptPHI(value) || value;
  } catch {
    return value;
  }
}

/**
 * Safely decrypt a credential field
 */
function safeDecryptCredential(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decrypt(value) || value;
  } catch {
    return value;
  }
}

// EonMeds clinic subdomain
const EONMEDS_SUBDOMAIN = 'eonmeds';

// Payload validation schema
const shippingPayloadSchema = z.object({
  // Required fields
  trackingNumber: z.string().min(1, 'Tracking number is required'),
  orderId: z.string().min(1, 'Order ID is required'),
  deliveryService: z.string().min(1, 'Delivery service is required'),

  // Optional fields
  brand: z.string().optional().default('Eon Medical + Wellness'),
  status: z.string().optional().default('shipped'),
  estimatedDelivery: z.string().optional(),
  actualDelivery: z.string().optional(),
  trackingUrl: z.string().url().optional(),

  // Medication info (optional)
  medication: z
    .object({
      name: z.string().optional(),
      strength: z.string().optional(),
      quantity: z.string().optional(),
      form: z.string().optional(),
    })
    .optional(),

  // Patient identification (optional, will try to find by order)
  patientEmail: z.string().email().optional(),
  patientId: z.string().optional(),

  // Additional metadata
  timestamp: z.string().optional(),
  notes: z.string().optional(),
});

type ShippingPayload = z.infer<typeof shippingPayloadSchema>;

/**
 * Accepted usernames for this webhook (LifeFile may use different usernames)
 */
const ACCEPTED_USERNAMES = [
  'lifehook_user',
  'eonmeds_shipping',
  'lifefile_webhook',
  'lifefile_datapush',
];

/**
 * Verify Basic Authentication against clinic's configured credentials.
 * Uses constant-time comparison to prevent timing attacks.
 */
async function verifyBasicAuth(
  authHeader: string | null,
  clinic: { lifefileInboundUsername: string | null; lifefileInboundPassword: string | null }
): Promise<boolean> {
  const expectedPassword = safeDecryptCredential(clinic.lifefileInboundPassword);

  if (!expectedPassword) {
    logger.error('[EONMEDS SHIPPING] No inbound webhook password configured for clinic');
    return false;
  }

  if (!authHeader) {
    logger.error('[EONMEDS SHIPPING] Missing Authorization header');
    return false;
  }

  try {
    const base64Credentials = authHeader.replace(/^Basic\s+/i, '');
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    if (!username || !password) {
      logger.error('[EONMEDS SHIPPING] Malformed credentials');
      return false;
    }

    // Check if username is one of the accepted patterns
    const usernameAccepted = ACCEPTED_USERNAMES.includes(username);
    // Also accept the configured username from admin UI
    const configuredUsername = safeDecryptCredential(clinic.lifefileInboundUsername);
    const usernameMatch = usernameAccepted || username === configuredUsername;

    if (!usernameMatch) {
      logger.warn('[EONMEDS SHIPPING] Username not recognized');
      return false;
    }

    // Constant-time password comparison to prevent timing attacks
    if (password.length !== expectedPassword.length) {
      logger.debug('[EONMEDS SHIPPING] Password length mismatch');
      return false;
    }

    const passwordMatch = crypto.timingSafeEqual(
      Buffer.from(password),
      Buffer.from(expectedPassword)
    );

    if (passwordMatch) {
      logger.info(`[EONMEDS SHIPPING] Authentication successful (username: ${username})`);
      return true;
    }

    logger.warn('[EONMEDS SHIPPING] Authentication failed - invalid credentials');
    return false;
  } catch (error: unknown) {
    logger.error('[EONMEDS SHIPPING] Error parsing auth header:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Map Lifefile status string to our ShippingStatus enum
 */
function mapToShippingStatus(status: string): ShippingStatus {
  const statusMap: Record<string, ShippingStatus> = {
    pending: ShippingStatus.PENDING,
    label_created: ShippingStatus.LABEL_CREATED,
    shipped: ShippingStatus.SHIPPED,
    in_transit: ShippingStatus.IN_TRANSIT,
    out_for_delivery: ShippingStatus.OUT_FOR_DELIVERY,
    delivered: ShippingStatus.DELIVERED,
    returned: ShippingStatus.RETURNED,
    exception: ShippingStatus.EXCEPTION,
    cancelled: ShippingStatus.CANCELLED,
    // Common variations
    labelcreated: ShippingStatus.LABEL_CREATED,
    intransit: ShippingStatus.IN_TRANSIT,
    outfordelivery: ShippingStatus.OUT_FOR_DELIVERY,
  };

  const normalized = status.toLowerCase().replace(/[_\s-]/g, '');
  return statusMap[normalized] || ShippingStatus.SHIPPED;
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return undefined;
    return date;
  } catch (error: unknown) {
    logger.warn('[EONMEDS SHIPPING] Date parse failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      dateStr,
    });
    return undefined;
  }
}

/**
 * Find patient by Lifefile order ID or email.
 * Also tries to find the most recent order for the patient if no exact match.
 */
async function findPatient(
  clinicId: number,
  lifefileOrderId: string,
  patientEmail?: string,
  patientId?: string
): Promise<{ patient: any; order: any } | null> {
  // First, try to find by order with exact lifefileOrderId
  const order = await prisma.order.findFirst({
    where: {
      clinicId,
      OR: [{ lifefileOrderId }, { referenceId: lifefileOrderId }],
    },
    include: {
      patient: true,
    },
  });

  if (order) {
    return { patient: order.patient, order };
  }

  // Try to find patient by email if no order found
  let patient = null;
  if (patientEmail) {
    patient = await prisma.patient.findFirst({
      where: {
        clinicId,
        email: patientEmail.toLowerCase(),
      },
    });
  }

  // Try to find patient by patientId
  if (!patient && patientId) {
    patient = await prisma.patient.findFirst({
      where: {
        clinicId,
        patientId,
      },
    });
  }

  if (patient) {
    // Try to find the most recent order without tracking for this patient
    const recentOrder = await prisma.order.findFirst({
      where: {
        clinicId,
        patientId: patient.id,
        OR: [{ lifefileOrderId: null }, { lifefileOrderId: '' }, { trackingNumber: null }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: true,
      },
    });

    if (recentOrder) {
      logger.info(
        `[EONMEDS SHIPPING] Found recent order ${recentOrder.id} for patient ${patient.id} without tracking`
      );
      return { patient, order: recentOrder };
    }

    // Try any recent order within last 30 days
    const recentOrderWithinMonth = await prisma.order.findFirst({
      where: {
        clinicId,
        patientId: patient.id,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: true,
      },
    });

    if (recentOrderWithinMonth) {
      logger.info(
        `[EONMEDS SHIPPING] Found recent order ${recentOrderWithinMonth.id} within 30 days for patient ${patient.id}`
      );
      return { patient, order: recentOrderWithinMonth };
    }

    return { patient, order: null };
  }

  return null;
}

/**
 * POST /api/webhooks/eonmeds-shipping
 * Receives shipping updates from Lifefile for EonMeds (Apollo Based Health)
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = `eonmeds-ship-${Date.now()}`;

  let webhookLogData: any = {
    endpoint: '/api/webhooks/eonmeds-shipping',
    method: 'POST',
    status: WebhookStatus.ERROR,
    statusCode: 500,
    source: 'lifefile',
  };

  try {
    logger.info('='.repeat(60));
    logger.info(`[EONMEDS SHIPPING] New webhook request - ${requestId}`);
    logger.info(`[EONMEDS SHIPPING] Time: ${new Date().toISOString()}`);

    // Extract headers for logging (redact sensitive ones)
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] =
        key.toLowerCase().includes('auth') || key.toLowerCase().includes('secret')
          ? '[REDACTED]'
          : value;
    });
    webhookLogData.headers = headers;
    webhookLogData.ipAddress =
      req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    webhookLogData.userAgent = req.headers.get('user-agent') || 'unknown';

    // Get EonMeds clinic with inbound webhook credentials (basePrisma: no tenant context needed)
    const clinic = await basePrisma.clinic.findUnique({
      where: { subdomain: EONMEDS_SUBDOMAIN },
      select: {
        id: true,
        name: true,
        lifefileInboundEnabled: true,
        lifefileInboundUsername: true,
        lifefileInboundPassword: true,
        lifefileInboundEvents: true,
      },
    });

    if (!clinic) {
      logger.error('[EONMEDS SHIPPING] EonMeds clinic not found');
      return NextResponse.json({ error: 'Clinic not found' }, { status: 500 });
    }

    if (!clinic.lifefileInboundEnabled) {
      logger.warn('[EONMEDS SHIPPING] Inbound webhook not enabled for clinic');
      return NextResponse.json({ error: 'Webhook not enabled' }, { status: 403 });
    }

    webhookLogData.clinicId = clinic.id;

    // Helper: write webhook log within clinic context
    const writeWebhookLog = () =>
      runWithClinicContext(clinic.id, () =>
        prisma.webhookLog.create({ data: webhookLogData })
      ).catch((err) => {
        logger.warn('[EONMEDS SHIPPING] Failed to persist webhook log', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

    // Verify authentication against clinic's configured credentials
    const authHeader = req.headers.get('authorization');
    const isAuthenticated = await verifyBasicAuth(authHeader, clinic);

    if (!isAuthenticated) {
      webhookLogData.status = WebhookStatus.INVALID_AUTH;
      webhookLogData.statusCode = 401;
      webhookLogData.errorMessage = 'Authentication failed';
      await writeWebhookLog();
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate payload
    const rawBody = await req.text();
    if (!rawBody) {
      webhookLogData.errorMessage = 'Empty request body';
      await writeWebhookLog();
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    const { safeParseJsonString } = await import('@/lib/utils/safe-json');
    const payload = safeParseJsonString<Record<string, unknown>>(rawBody);
    if (payload === null) {
      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 400;
      webhookLogData.errorMessage = 'Invalid JSON';
      await writeWebhookLog();
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    webhookLogData.payload = payload;

    // Validate payload against schema
    const parseResult = shippingPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      logger.error('[EONMEDS SHIPPING] Validation failed:', errors);

      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 400;
      webhookLogData.errorMessage = errors.join(', ');
      await writeWebhookLog();
      return NextResponse.json({ error: 'Invalid payload', details: errors }, { status: 400 });
    }

    const data: ShippingPayload = parseResult.data;

    logger.info(
      `[EONMEDS SHIPPING] Processing shipment - Order: ${data.orderId}, Tracking: ${data.trackingNumber}`
    );

    // ═══════════════════════════════════════════════════════════════════
    // Run all clinic-isolated operations within tenant context
    // REQUIRED for: order, patient, patientShippingUpdate, orderEvent
    // ═══════════════════════════════════════════════════════════════════
    return runWithClinicContext(clinic.id, async () => {

    // Find patient and order
    const result = await findPatient(clinic.id, data.orderId, data.patientEmail, data.patientId);

    if (!result) {
      logger.warn(`[EONMEDS SHIPPING] Patient/Order not found for order ${data.orderId}`);

      webhookLogData.status = WebhookStatus.SUCCESS;
      webhookLogData.statusCode = 202;
      webhookLogData.responseData = {
        processed: false,
        reason: 'Patient or order not found',
        orderId: data.orderId,
      };

      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[EONMEDS SHIPPING] Failed to persist webhook log', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      return NextResponse.json(
        {
          success: false,
          requestId,
          message: 'Patient or order not found for this tracking update',
          orderId: data.orderId,
          trackingNumber: data.trackingNumber,
          hint: 'Ensure the patient/order exists before sending shipping updates',
        },
        { status: 202 }
      );
    }

    const { patient, order } = result;

    // Check for existing shipping update with same tracking number (idempotency)
    const existingUpdate = await prisma.patientShippingUpdate.findFirst({
      where: {
        clinicId: clinic.id,
        patientId: patient.id,
        trackingNumber: data.trackingNumber,
      },
    });

    let shippingUpdate;
    const shippingStatus = mapToShippingStatus(data.status || 'shipped');

    const updateData = {
      carrier: data.deliveryService,
      trackingUrl: data.trackingUrl,
      status: shippingStatus,
      statusNote: data.notes,
      shippedAt: shippingStatus === ShippingStatus.SHIPPED ? new Date() : undefined,
      estimatedDelivery: parseDate(data.estimatedDelivery),
      actualDelivery:
        shippingStatus === ShippingStatus.DELIVERED ? new Date() : parseDate(data.actualDelivery),
      medicationName: data.medication?.name,
      medicationStrength: data.medication?.strength,
      medicationQuantity: data.medication?.quantity,
      medicationForm: data.medication?.form,
      lifefileOrderId: data.orderId,
      brand: data.brand,
      rawPayload: payload as any,
      processedAt: new Date(),
    };

    if (existingUpdate) {
      shippingUpdate = await prisma.patientShippingUpdate.update({
        where: { id: existingUpdate.id },
        data: updateData,
      });
      logger.info(`[EONMEDS SHIPPING] Updated existing shipping record ${existingUpdate.id}`);
    } else {
      shippingUpdate = await prisma.patientShippingUpdate.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          orderId: order?.id,
          trackingNumber: data.trackingNumber,
          source: 'lifefile',
          ...updateData,
        },
      });
      logger.info(`[EONMEDS SHIPPING] Created new shipping record ${shippingUpdate.id}`);
    }

    // Also update the Order record if we have one
    if (order) {
      const orderUpdateData: any = {
        trackingNumber: data.trackingNumber,
        trackingUrl: data.trackingUrl,
        shippingStatus: data.status,
        lastWebhookAt: new Date(),
        lastWebhookPayload: JSON.stringify(payload),
      };

      // Save the lifefileOrderId if it's not already set
      if (!order.lifefileOrderId && data.orderId) {
        orderUpdateData.lifefileOrderId = data.orderId;
        logger.info(
          `[EONMEDS SHIPPING] Saving lifefileOrderId ${data.orderId} to order ${order.id}`
        );
      }

      await prisma.order.update({
        where: { id: order.id },
        data: orderUpdateData,
      });

      // Create order event for audit trail
      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          lifefileOrderId: data.orderId,
          eventType: `shipping_${data.status || 'update'}`,
          payload: payload as any,
          note: `Tracking: ${data.trackingNumber} via ${data.deliveryService}`,
        },
      });
    }

    // Calculate processing time
    const processingTime = Date.now() - startTime;

    // Log success
    webhookLogData.status = WebhookStatus.SUCCESS;
    webhookLogData.statusCode = 200;
    webhookLogData.clinicId = clinic.id;
    webhookLogData.responseData = {
      shippingUpdateId: shippingUpdate.id,
      patientId: patient.id,
      orderId: order?.id,
      trackingNumber: data.trackingNumber,
      status: shippingStatus,
    };
    webhookLogData.processingTimeMs = processingTime;

    await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
      logger.warn('[EONMEDS SHIPPING] Failed to persist webhook log', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    logger.info(`[EONMEDS SHIPPING] Processing completed in ${processingTime}ms`);
    logger.info('='.repeat(60));

    // Decrypt patient PHI for response (no PHI in logs)
    const decryptedFirstName = safeDecrypt(patient.firstName) || 'Patient';
    const decryptedLastName = safeDecrypt(patient.lastName) || '';
    const patientDisplayName = `${decryptedFirstName} ${decryptedLastName}`.trim();

    return NextResponse.json({
      success: true,
      requestId,
      message: existingUpdate ? 'Shipping update updated' : 'Shipping update created',
      shippingUpdate: {
        id: shippingUpdate.id,
        trackingNumber: shippingUpdate.trackingNumber,
        carrier: shippingUpdate.carrier,
        status: shippingUpdate.status,
        trackingUrl: shippingUpdate.trackingUrl,
      },
      patient: {
        id: patient.id,
        patientId: patient.patientId,
        name: patientDisplayName,
      },
      order: order
        ? {
            id: order.id,
            lifefileOrderId: order.lifefileOrderId,
          }
        : null,
      processingTime: `${processingTime}ms`,
    });

    }); // end runWithClinicContext
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[EONMEDS SHIPPING] Error processing webhook:', {
      error: errorMessage,
    });

    webhookLogData.status = WebhookStatus.ERROR;
    webhookLogData.statusCode = 500;
    webhookLogData.errorMessage = errorMessage;
    webhookLogData.processingTimeMs = Date.now() - startTime;

    if (webhookLogData.clinicId) {
      await runWithClinicContext(webhookLogData.clinicId, () =>
        prisma.webhookLog.create({ data: webhookLogData })
      ).catch((dbError: unknown) => {
        logger.warn('[EONMEDS SHIPPING] Failed to log webhook error:', {
          error: dbError instanceof Error ? dbError.message : String(dbError),
        });
      });
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/eonmeds-shipping
 * Health check endpoint
 */
export async function GET() {
  const clinic = await basePrisma.clinic.findUnique({
    where: { subdomain: EONMEDS_SUBDOMAIN },
    select: {
      id: true,
      name: true,
      lifefileEnabled: true,
      lifefileInboundEnabled: true,
      lifefileInboundUsername: true,
      lifefileInboundPassword: true,
    },
  });

  const hasCredentials = !!(clinic?.lifefileInboundUsername && clinic?.lifefileInboundPassword);

  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/webhooks/eonmeds-shipping',
    clinic: clinic?.name || 'Not Found',
    brand: 'Eon Medical + Wellness',
    inboundEnabled: clinic?.lifefileInboundEnabled || false,
    configured: hasCredentials,
    configuredVia: 'Admin UI - Inbound Webhook Settings',
    authentication: 'Basic Auth',
    accepts: ['application/json'],
    usage: {
      method: 'POST',
      headers: {
        Authorization: 'Basic base64(username:password)',
        'Content-Type': 'application/json',
      },
      requiredFields: ['trackingNumber', 'orderId', 'deliveryService'],
      optionalFields: [
        'brand',
        'status',
        'estimatedDelivery',
        'actualDelivery',
        'trackingUrl',
        'medication',
        'patientEmail',
        'patientId',
        'timestamp',
        'notes',
      ],
    },
  });
}
