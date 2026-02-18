/**
 * OT / Overtime (EONpro OT) Lifefile Shipping Webhook
 *
 * Receives shipping/tracking updates from Lifefile for OT prescriptions.
 * Stores data at the patient profile level in PatientShippingUpdate table.
 *
 * CREDENTIALS: Read from clinic's Inbound Webhook Settings in admin UI
 * Configure at: /super-admin/clinics/[id] -> Pharmacy tab -> Inbound Webhook Settings
 *
 * Example curl for LifeFile to call:
 *
 * curl -X POST https://ot.eonpro.io/api/webhooks/ot-shipping \
 *   -H "Authorization: Basic $(echo -n 'lifehook_user:<PASSWORD>' | base64)" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "trackingNumber": "TRACKING_NUMBER",
 *     "orderId": "LF_ORDER_ID",
 *     "deliveryService": "SERVICE",
 *     "brand": "EONpro (OT)"
 *   }'
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, basePrisma, runWithClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ShippingStatus, WebhookStatus } from '@prisma/client';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { decrypt } from '@/lib/security/encryption';
import { sendTrackingNotificationSMS } from '@/lib/shipping/tracking-sms';
import { findPatientForShipping } from '@/lib/shipping/find-patient';
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

// OT clinic subdomain
const OT_SUBDOMAIN = 'ot';

import { normalizeLifefilePayload, NormalizedShipment } from '@/lib/shipping/normalize-lifefile-payload';

/**
 * Accepted usernames for this webhook (LifeFile may use different usernames)
 */
const ACCEPTED_USERNAMES = [
  'lifehook_user',
  'ot_shipping',
  'lifefile_webhook',
  'lifefile_datapush',
];

interface AuthResult {
  success: boolean;
  diagnostics?: {
    reason: string;
    usernameReceived?: string;
    usernameMatch?: boolean;
    passwordLenReceived?: number;
    passwordLenExpected?: number;
    expectedPasswordDecrypted?: boolean;
  };
}

/**
 * Verify Basic Authentication against clinic's configured credentials.
 * Returns diagnostics for debugging auth failures.
 */
async function verifyBasicAuth(
  authHeader: string | null,
  clinic: { lifefileInboundUsername: string | null; lifefileInboundPassword: string | null }
): Promise<AuthResult> {
  const expectedPassword = safeDecryptCredential(clinic.lifefileInboundPassword);

  if (!expectedPassword) {
    logger.error('[OT SHIPPING] No inbound webhook password configured for clinic');
    return { success: false, diagnostics: { reason: 'no_password_configured' } };
  }

  if (!authHeader) {
    logger.error('[OT SHIPPING] Missing Authorization header');
    return { success: false, diagnostics: { reason: 'missing_auth_header' } };
  }

  try {
    const base64Credentials = authHeader.replace(/^Basic\s+/i, '');
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const colonIdx = credentials.indexOf(':');
    const username = colonIdx >= 0 ? credentials.substring(0, colonIdx) : credentials;
    const password = colonIdx >= 0 ? credentials.substring(colonIdx + 1) : '';

    const usernameAccepted = ACCEPTED_USERNAMES.includes(username);
    const configuredUsername = safeDecryptCredential(clinic.lifefileInboundUsername);
    const usernameMatch = usernameAccepted || username === configuredUsername;

    if (!usernameMatch) {
      logger.error(`[OT SHIPPING] Auth failed: username "${username}" not recognized`);
      return {
        success: false,
        diagnostics: {
          reason: 'username_mismatch',
          usernameReceived: username,
          usernameMatch: false,
          passwordLenReceived: password.length,
          passwordLenExpected: expectedPassword.length,
          expectedPasswordDecrypted: expectedPassword !== clinic.lifefileInboundPassword,
        },
      };
    }

    const passwordBuffer = Buffer.from(password);
    const expectedBuffer = Buffer.from(expectedPassword);
    const passwordMatch =
      passwordBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(passwordBuffer, expectedBuffer);

    if (passwordMatch) {
      logger.info(`[OT SHIPPING] Authentication successful (username: ${username})`);
      return { success: true };
    }

    logger.error('[OT SHIPPING] Auth failed: password mismatch', {
      usernameReceived: username,
      passwordLenReceived: password.length,
      passwordLenExpected: expectedPassword.length,
    });
    return {
      success: false,
      diagnostics: {
        reason: 'password_mismatch',
        usernameReceived: username,
        usernameMatch: true,
        passwordLenReceived: password.length,
        passwordLenExpected: expectedPassword.length,
        expectedPasswordDecrypted: expectedPassword !== clinic.lifefileInboundPassword,
      },
    };
  } catch (error) {
    logger.error('[OT SHIPPING] Error parsing auth header:', error);
    return { success: false, diagnostics: { reason: 'parse_error' } };
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
    logger.warn('[OT SHIPPING] Date parse failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      dateStr,
    });
    return undefined;
  }
}

// findPatient is now centralized in @/lib/shipping/find-patient.ts

/**
 * POST /api/webhooks/ot-shipping
 * Receives shipping updates from Lifefile for OT / Overtime (EONpro OT)
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = `ot-ship-${Date.now()}`;

  let webhookLogData: any = {
    endpoint: '/api/webhooks/ot-shipping',
    method: 'POST',
    status: WebhookStatus.ERROR,
    statusCode: 500,
    source: 'lifefile',
  };

  try {
    logger.info('='.repeat(60));
    logger.info(`[OT SHIPPING] New webhook request - ${requestId}`);
    logger.info(`[OT SHIPPING] Time: ${new Date().toISOString()}`);

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

    // Get OT clinic with inbound webhook credentials (basePrisma: no tenant context needed)
    const clinic = await basePrisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: OT_SUBDOMAIN },
          { subdomain: { contains: 'ot', mode: 'insensitive' } },
        ],
      },
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
      logger.error('[OT SHIPPING] OT clinic not found');
      return NextResponse.json({ error: 'Clinic not found' }, { status: 500 });
    }

    if (!clinic.lifefileInboundEnabled) {
      logger.warn('[OT SHIPPING] Inbound webhook not enabled for clinic');
      return NextResponse.json({ error: 'Webhook not enabled' }, { status: 403 });
    }

    webhookLogData.clinicId = clinic.id;

    // Helper: write webhook log within clinic context
    const writeWebhookLog = () =>
      runWithClinicContext(clinic.id, () =>
        prisma.webhookLog.create({ data: webhookLogData })
      ).catch((err) => {
        logger.warn('[OT SHIPPING] Failed to persist webhook log', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

    // Verify authentication against clinic's configured credentials
    const authHeader = req.headers.get('authorization');
    const authResult = await verifyBasicAuth(authHeader, clinic);

    if (!authResult.success) {
      webhookLogData.status = WebhookStatus.INVALID_AUTH;
      webhookLogData.statusCode = 401;
      webhookLogData.errorMessage = 'Authentication failed';
      webhookLogData.metadata = authResult.diagnostics;
      await writeWebhookLog();
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and normalize payload (Lifefile sends array of Rx line items)
    const rawBody = await req.text();
    if (!rawBody) {
      webhookLogData.errorMessage = 'Empty request body';
      await writeWebhookLog();
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    let rawPayload: unknown;
    try {
      rawPayload = JSON.parse(rawBody);
    } catch {
      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 400;
      webhookLogData.errorMessage = 'Invalid JSON';
      await writeWebhookLog();
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    webhookLogData.payload = rawPayload;

    const data = normalizeLifefilePayload(rawPayload, 'OT SHIPPING');
    if (!data) {
      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 400;
      webhookLogData.errorMessage = 'Could not normalize Lifefile payload';
      await writeWebhookLog();
      return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 });
    }

    logger.info(
      `[OT SHIPPING] Processing shipment - Order: ${data.orderId}, Tracking: ${data.trackingNumber}`
    );

    // ═══════════════════════════════════════════════════════════════════
    // Run all clinic-isolated operations within tenant context
    // REQUIRED for: order, patient, patientShippingUpdate, orderEvent
    // ═══════════════════════════════════════════════════════════════════
    return runWithClinicContext(clinic.id, async () => {

    // Find patient and order using shared multi-strategy matching
    const result = await findPatientForShipping(
      clinic.id,
      data.orderId,
      'OT SHIPPING',
      data.patientEmail,
      data.patientId
    );

    if (!result) {
      logger.warn(`[OT SHIPPING] No match for order ${data.orderId} — storing as unmatched`);

      const unmatchedShipping = await prisma.patientShippingUpdate.create({
        data: {
          clinicId: clinic.id,
          patientId: null,
          orderId: null,
          trackingNumber: data.trackingNumber,
          carrier: data.carrier,
          status: mapToShippingStatus(data.status || 'shipped'),
          shippedAt: new Date(),
          lifefileOrderId: data.orderId,
          brand: 'EONpro (OT)',
          source: 'lifefile',
          rawPayload: rawPayload as any,
          processedAt: new Date(),
          matchedAt: null,
        },
      });

      logger.info(`[OT SHIPPING] Stored unmatched record ${unmatchedShipping.id}`);

      webhookLogData.status = WebhookStatus.SUCCESS;
      webhookLogData.statusCode = 202;
      webhookLogData.responseData = {
        processed: true,
        matched: false,
        shippingUpdateId: unmatchedShipping.id,
        orderId: data.orderId,
        trackingNumber: data.trackingNumber,
      };

      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[OT SHIPPING] Failed to persist webhook log', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      return NextResponse.json(
        {
          success: true,
          requestId,
          message: 'Tracking stored as unmatched — will attempt matching later',
          shippingUpdateId: unmatchedShipping.id,
          orderId: data.orderId,
          trackingNumber: data.trackingNumber,
        },
        { status: 202 }
      );
    }

    const { patient, order, matchStrategy } = result;
    logger.info(`[OT SHIPPING] Matched via strategy: ${matchStrategy}`);

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
      carrier: data.carrier,
      trackingUrl: undefined as string | undefined,
      status: shippingStatus,
      statusNote: data.rxItems.map((r) => r.rxNumber).filter(Boolean).join(', ') || undefined,
      shippedAt: shippingStatus === ShippingStatus.SHIPPED ? new Date() : undefined,
      estimatedDelivery: parseDate(data.statusDateTime),
      actualDelivery:
        shippingStatus === ShippingStatus.DELIVERED ? new Date() : undefined,
      lifefileOrderId: data.orderId,
      brand: 'EONpro (OT)',
      rawPayload: rawPayload as any,
      processedAt: new Date(),
    };

    if (existingUpdate) {
      shippingUpdate = await prisma.patientShippingUpdate.update({
        where: { id: existingUpdate.id },
        data: updateData,
      });
      logger.info(`[OT SHIPPING] Updated existing shipping record ${existingUpdate.id}`);
    } else {
      shippingUpdate = await prisma.patientShippingUpdate.create({
        data: {
          clinicId: clinic.id,
          patientId: patient.id,
          orderId: order?.id,
          trackingNumber: data.trackingNumber,
          source: 'lifefile',
          matchedAt: new Date(),
          ...updateData,
        },
      });
      logger.info(`[OT SHIPPING] Created new shipping record ${shippingUpdate.id}`);

      // Send tracking SMS to patient (fire-and-forget, non-blocking)
      sendTrackingNotificationSMS({
        patientId: patient.id,
        patientPhone: patient.phone,
        patientFirstName: patient.firstName,
        patientLastName: patient.lastName,
        clinicId: clinic.id,
        clinicName: clinic.name,
        trackingNumber: data.trackingNumber,
        carrier: data.carrier,
        orderId: order?.id,
      }).catch((err) => {
        logger.warn('[OT SHIPPING] Tracking SMS failed (non-blocking)', {
          error: err instanceof Error ? err.message : String(err),
          patientId: patient.id,
        });
      });
    }

    // Also update the Order record if we have one
    if (order) {
      const orderUpdateData: any = {
        trackingNumber: data.trackingNumber,
        shippingStatus: data.status,
        lastWebhookAt: new Date(),
        lastWebhookPayload: JSON.stringify(rawPayload),
      };

      if (!order.lifefileOrderId && data.orderId) {
        orderUpdateData.lifefileOrderId = data.orderId;
        logger.info(
          `[OT SHIPPING] Saving lifefileOrderId ${data.orderId} to order ${order.id}`
        );
      }

      await prisma.order.update({
        where: { id: order.id },
        data: orderUpdateData,
      });

      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          lifefileOrderId: data.orderId,
          eventType: `shipping_${data.status || 'update'}`,
          payload: rawPayload as any,
          note: `Tracking: ${data.trackingNumber} via ${data.carrier} (${data.deliveryService})`,
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
      logger.warn('[OT SHIPPING] Failed to persist webhook log', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    logger.info(`[OT SHIPPING] Processing completed in ${processingTime}ms`);
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
    logger.error('[OT SHIPPING] Error processing webhook:', {
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
        logger.warn('[OT SHIPPING] Failed to log webhook error:', {
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
 * GET /api/webhooks/ot-shipping
 * Health check endpoint
 */
export async function GET() {
  const clinic = await basePrisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: OT_SUBDOMAIN },
        { subdomain: { contains: 'ot', mode: 'insensitive' } },
      ],
    },
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
    endpoint: '/api/webhooks/ot-shipping',
    clinic: clinic?.name || 'Not Found',
    brand: 'EONpro (OT)',
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
