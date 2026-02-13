/**
 * Webhook endpoint for Lifefile prescription status updates
 * Receives real-time updates about prescription fulfillment
 *
 * CREDENTIALS: Looks up clinic by username from Inbound Webhook Settings
 * Configure at: /super-admin/clinics/[id] -> Pharmacy tab -> Inbound Webhook Settings
 *
 * Authentication: Basic Auth - username determines which clinic
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { WebhookStatus } from '@prisma/client';
import { decrypt } from '@/lib/security/encryption';
import {
  extractLifefileOrderIdentifiers,
  buildOrderLookupWhere,
  sanitizeEventType,
  MAX_WEBHOOK_BODY_BYTES,
} from '@/lib/webhooks/lifefile-payload';

/**
 * Safely decrypt a credential field
 */
function safeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return decrypt(value) || value;
  } catch {
    return value;
  }
}

/**
 * Accepted usernames for LifeFile webhooks
 */
const ACCEPTED_USERNAMES = ['wellmedr_shipping', 'lifefile_webhook', 'lifefile_datapush'];

/**
 * Find clinic by matching password (accepts known LifeFile usernames)
 * Searches all clinics with inbound webhooks enabled
 */
async function findClinicByCredentials(authHeader: string | null): Promise<{
  clinic: any;
  authenticated: boolean;
} | null> {
  if (!authHeader) {
    logger.error('[LIFEFILE PRESCRIPTION] Missing Authorization header');
    return null;
  }

  try {
    // Parse Basic auth header
    const base64Credentials = authHeader.replace(/^Basic\s+/i, '');
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [providedUsername, providedPassword] = credentials.split(':');

    if (!providedUsername) {
      logger.error('[LIFEFILE PRESCRIPTION] No username in auth header');
      return null;
    }

    // Check if username is one of the accepted LifeFile patterns
    const usernameAccepted = ACCEPTED_USERNAMES.includes(providedUsername);

    if (!usernameAccepted) {
      logger.error(`[LIFEFILE PRESCRIPTION] Username not in accepted list: ${providedUsername}`);
      return { clinic: null, authenticated: false };
    }

    // Get all clinics with inbound webhooks enabled
    const clinics = await prisma.clinic.findMany({
      where: {
        lifefileInboundEnabled: true,
        lifefileInboundPassword: { not: null },
      },
      select: {
        id: true,
        name: true,
        subdomain: true,
        lifefileInboundUsername: true,
        lifefileInboundPassword: true,
        lifefileInboundEvents: true,
      },
    });

    logger.info(`[LIFEFILE PRESCRIPTION] Found ${clinics.length} clinics with inbound enabled`);

    // Find clinic by matching password
    for (const clinic of clinics) {
      let decryptedPassword: string | null = null;

      try {
        decryptedPassword = decrypt(clinic.lifefileInboundPassword);
        logger.info(
          `[LIFEFILE PRESCRIPTION] Decrypted password for ${clinic.name}: length=${decryptedPassword?.length}`
        );
      } catch (e: any) {
        logger.error(`[LIFEFILE PRESCRIPTION] Decryption failed for ${clinic.name}:`, e.message);
        // Continue to try other clinics
        continue;
      }

      if (decryptedPassword && providedPassword === decryptedPassword) {
        logger.info(`[LIFEFILE PRESCRIPTION] Authenticated as clinic: ${clinic.name}`);
        return { clinic, authenticated: true };
      }
    }

    logger.error(`[LIFEFILE PRESCRIPTION] No clinic found with matching password`);
    return { clinic: null, authenticated: false };
  } catch (error) {
    logger.error('[LIFEFILE PRESCRIPTION] Error in auth:', error);
    return null;
  }
}

/**
 * POST /api/webhooks/lifefile/prescription-status
 * Receive prescription status updates from Lifefile
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  let webhookLogData: any = {
    endpoint: '/api/webhooks/lifefile/prescription-status',
    method: 'POST',
    status: WebhookStatus.ERROR,
    statusCode: 500,
  };

  try {
    // Get raw body with size limit (DoS protection)
    const contentLength = req.headers.get('content-length');
    if (contentLength) {
      const len = parseInt(contentLength, 10);
      if (!Number.isFinite(len) || len < 0 || len > MAX_WEBHOOK_BODY_BYTES) {
        webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
        webhookLogData.statusCode = 413;
        webhookLogData.errorMessage = 'Payload too large';
        await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
          logger.warn('[LifeFile RxStatus] Failed to persist webhook log for oversized content-length', { error: err instanceof Error ? err.message : String(err) });
        });
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
      }
    }
    const rawBody = await req.text();
    if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 413;
      webhookLogData.errorMessage = 'Payload too large';
      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile RxStatus] Failed to persist webhook log for oversized payload', { error: err instanceof Error ? err.message : String(err) });
      });
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    // Extract headers for logging (no PHI)
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = key.toLowerCase().includes('auth') ? '[REDACTED]' : value;
    });
    webhookLogData.headers = headers;
    webhookLogData.ipAddress = req.headers.get('x-forwarded-for') ?? 'unknown';

    logger.info('[LIFEFILE PRESCRIPTION] Webhook received');

    // Find and authenticate clinic by credentials
    const authHeader = req.headers.get('authorization');
    const authResult = await findClinicByCredentials(authHeader);

    if (!authResult || !authResult.clinic || !authResult.authenticated) {
      webhookLogData.status = WebhookStatus.INVALID_AUTH;
      webhookLogData.statusCode = 401;
      webhookLogData.errorMessage = !authResult?.clinic
        ? 'Clinic not found for username'
        : 'Invalid password';
      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile RxStatus] Failed to persist webhook log for auth failure', { error: err instanceof Error ? err.message : String(err) });
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clinic = authResult.clinic;
    webhookLogData.clinicId = clinic.id;

    // Parse payload (safe parse; no prototype pollution from payload)
    const { safeParseJsonString } = await import('@/lib/utils/safe-json');
    const parsed = safeParseJsonString<unknown>(rawBody);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 400;
      webhookLogData.errorMessage = 'Invalid JSON or payload must be an object';
      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile RxStatus] Failed to persist webhook log for invalid JSON', { error: err instanceof Error ? err.message : String(err) });
      });
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const payload = parsed as Record<string, unknown>;

    webhookLogData.payload = payload;

    // Extract key fields (support nested payload: order.*, data.*, prescription.*)
    const { orderId, referenceId } = extractLifefileOrderIdentifiers(payload);
    const rawStatus = payload.status;
    const rawTrackingNumber = payload.trackingNumber ?? payload.tracking_number;
    const rawTrackingUrl = payload.trackingUrl ?? payload.tracking_url;
    const status =
      typeof rawStatus === 'string' && rawStatus.trim().length > 0
        ? rawStatus.trim().slice(0, 128)
        : undefined;
    const trackingNumber =
      typeof rawTrackingNumber === 'string' && rawTrackingNumber.trim().length > 0
        ? rawTrackingNumber.trim().slice(0, 255)
        : typeof rawTrackingNumber === 'number' && Number.isFinite(rawTrackingNumber)
          ? String(rawTrackingNumber).slice(0, 255)
          : undefined;
    const trackingUrl =
      typeof rawTrackingUrl === 'string' && rawTrackingUrl.trim().length > 0
        ? rawTrackingUrl.trim().slice(0, 2048)
        : undefined;

    logger.info('[LIFEFILE PRESCRIPTION] Processing', {
      clinicId: clinic.id,
      clinicName: clinic.name,
      orderId: orderId ?? '(none)',
      referenceId: referenceId ?? '(none)',
      status,
      payloadKeys: Object.keys(payload as object),
    });

    const where = buildOrderLookupWhere(clinic.id, orderId, referenceId);
    if (!where) {
      logger.warn('[LIFEFILE PRESCRIPTION] No orderId or referenceId in payload', {
        payloadKeys: Object.keys(payload as object),
      });
      webhookLogData.status = WebhookStatus.ERROR;
      webhookLogData.statusCode = 400;
      webhookLogData.errorMessage = 'Missing orderId or referenceId';
      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile RxStatus] Failed to persist webhook log for missing order identifiers', { error: err instanceof Error ? err.message : String(err) });
      });
      return NextResponse.json(
        { error: 'Missing orderId or referenceId in payload' },
        { status: 400 }
      );
    }

    // Find the order (scoped to the authenticated clinic)
    const order = await prisma.order.findFirst({
      where,
      include: {
        patient: {
          select: { id: true, clinicId: true },
        },
      },
    });

    if (!order) {
      logger.warn('[LIFEFILE PRESCRIPTION] Order not found', {
        clinicId: clinic.id,
        orderId,
        referenceId,
      });

      webhookLogData.status = WebhookStatus.SUCCESS;
      webhookLogData.statusCode = 202;
      webhookLogData.responseData = { processed: false, reason: 'Order not found' };
      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile RxStatus] Failed to persist webhook log for order not found', { error: err instanceof Error ? err.message : String(err) });
      });

      return NextResponse.json(
        {
          success: false,
          message: 'Order not found',
          clinic: clinic.name,
          orderId: orderId ?? undefined,
          referenceId: referenceId ?? undefined,
        },
        { status: 202 }
      );
    }

    // Update order with new status/tracking info
    const updateData: any = {
      lastWebhookAt: new Date(),
      lastWebhookPayload: JSON.stringify(payload),
    };

    if (status) updateData.status = status;
    if (trackingNumber) updateData.trackingNumber = trackingNumber;
    if (trackingUrl) updateData.trackingUrl = trackingUrl;

    await prisma.order.update({
      where: { id: order.id },
      data: updateData,
    });

    // Create order event for audit trail (sanitized eventType to prevent injection)
    const eventType = sanitizeEventType(status ? `prescription_${status}` : 'prescription_update');
    const note =
      trackingNumber != null
        ? `Tracking: ${trackingNumber.slice(0, 100)}`
        : status != null
          ? `Status: ${status.slice(0, 64)}`
          : 'Update';
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        lifefileOrderId: orderId ?? undefined,
        eventType,
        payload: payload as object,
        note,
      },
    });

    const processingTime = Date.now() - startTime;

    // Log success
    webhookLogData.status = WebhookStatus.SUCCESS;
    webhookLogData.statusCode = 200;
    webhookLogData.responseData = {
      orderId: order.id,
      status,
      trackingNumber,
    };
    webhookLogData.processingTimeMs = processingTime;

    await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
      logger.warn('[LifeFile RxStatus] Failed to persist webhook log', { error: err instanceof Error ? err.message : String(err) });
    });

    logger.info(`[LIFEFILE PRESCRIPTION] Processed in ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      message: 'Prescription status updated',
      clinic: clinic.name,
      orderId: order.id,
      status,
      trackingNumber,
      processingTime: `${processingTime}ms`,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[LIFEFILE PRESCRIPTION] Error', {
      message: errorMessage,
      name: error instanceof Error ? error.name : undefined,
    });

    webhookLogData.status = WebhookStatus.ERROR;
    webhookLogData.statusCode = 500;
    webhookLogData.errorMessage = errorMessage;
    webhookLogData.processingTimeMs = Date.now() - startTime;

    await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
      logger.warn('[LifeFile RxStatus] Failed to persist webhook log for processing error', { error: err instanceof Error ? err.message : String(err) });
    });

    return NextResponse.json(
      { error: 'Internal server error', message: errorMessage },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  // Count clinics with inbound webhooks configured
  const configuredClinics = await prisma.clinic.count({
    where: {
      lifefileInboundEnabled: true,
      lifefileInboundUsername: { not: null },
      lifefileInboundPassword: { not: null },
    },
  });

  return NextResponse.json({
    status: 'healthy',
    endpoint: '/api/webhooks/lifefile/prescription-status',
    authentication: 'Basic Auth (username determines clinic)',
    configuredClinics,
    configuredVia: 'Admin UI - Inbound Webhook Settings',
    timestamp: new Date().toISOString(),
  });
}
