/**
 * Lifefile Data Push Webhook
 * Receives order status updates, rx events, and other data from Lifefile
 *
 * CREDENTIALS: Looks up clinic by username from Inbound Webhook Settings
 * Configure at: /super-admin/clinics/[id] -> Pharmacy tab -> Inbound Webhook Settings
 *
 * Authentication: Basic Auth - username determines which clinic
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notificationService } from '@/services/notification';
import { WebhookStatus } from '@prisma/client';
import xml2js from 'xml2js';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { decrypt } from '@/lib/security/encryption';
import {
  extractLifefileOrderIdentifiers,
  buildOrderLookupWhere,
  sanitizeEventType,
  MAX_WEBHOOK_BODY_BYTES,
} from '@/lib/webhooks/lifefile-payload';

/**
 * Safely decrypt a PHI field
 */
function safeDecryptPHI(value: string | null | undefined): string | null {
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
 */
async function findClinicByCredentials(authHeader: string | null): Promise<{
  clinic: any;
  authenticated: boolean;
} | null> {
  if (!authHeader) {
    logger.error('[LIFEFILE DATA PUSH] Missing Authorization header');
    return null;
  }

  try {
    const base64Credentials = authHeader.replace(/^Basic\s+/i, '');
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [providedUsername, providedPassword] = credentials.split(':');

    if (!providedUsername) {
      logger.error('[LIFEFILE DATA PUSH] No username in auth header');
      return null;
    }

    // Check if username is one of the accepted LifeFile patterns
    const usernameAccepted = ACCEPTED_USERNAMES.includes(providedUsername);

    if (!usernameAccepted) {
      logger.error(`[LIFEFILE DATA PUSH] Username not in accepted list: ${providedUsername}`);
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

    logger.info(`[LIFEFILE DATA PUSH] Found ${clinics.length} clinics with inbound enabled`);

    // Find clinic by matching password
    for (const clinic of clinics) {
      let decryptedPassword: string | null = null;

      try {
        decryptedPassword = decrypt(clinic.lifefileInboundPassword);
        logger.info(
          `[LIFEFILE DATA PUSH] Decrypted password for ${clinic.name}: length=${decryptedPassword?.length}`
        );
      } catch (e: any) {
        logger.error(`[LIFEFILE DATA PUSH] Decryption failed for ${clinic.name}:`, e.message);
        continue;
      }

      if (decryptedPassword && providedPassword === decryptedPassword) {
        logger.info(`[LIFEFILE DATA PUSH] Authenticated as clinic: ${clinic.name}`);
        return { clinic, authenticated: true };
      }
    }

    logger.error(`[LIFEFILE DATA PUSH] No clinic found with matching password`);
    return { clinic: null, authenticated: false };
  } catch (error) {
    logger.error('[LIFEFILE DATA PUSH] Error in auth:', error);
    return null;
  }
}

/**
 * Parse XML payload to JSON
 */
async function parseXmlPayload(xmlData: string): Promise<any> {
  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
    normalize: true,
    normalizeTags: true,
  });

  try {
    return await parser.parseStringPromise(xmlData);
  } catch (error: any) {
    logger.error('[LIFEFILE DATA PUSH] XML parsing error:', error);
    throw new Error('Invalid XML format');
  }
}

/**
 * Process Rx Event data
 */
async function processRxEvent(clinicId: number, data: any) {
  logger.info('[LIFEFILE DATA PUSH] Processing Rx Event');

  const rxData = data.prescription || data.rx || data;
  const { orderId, referenceId } = extractLifefileOrderIdentifiers(data);
  const status = rxData?.status;
  const eventType = rxData?.eventType || rxData?.eventtype || 'rx_event';

  logger.info('[LIFEFILE DATA PUSH] Rx Event', {
    orderId: orderId ?? '(none)',
    referenceId: referenceId ?? '(none)',
    status,
  });

  const where = buildOrderLookupWhere(clinicId, orderId, referenceId);
  if (where) {
    const order = await prisma.order.findFirst({
      where,
    });

    if (order) {
      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          lifefileOrderId: orderId ?? undefined,
          eventType: sanitizeEventType(eventType),
          payload: data as object,
          note: `Rx Event: ${String(status ?? '').slice(0, 100)}`,
        },
      });

      if (status) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: status,
            lastWebhookAt: new Date(),
            lastWebhookPayload: JSON.stringify(data),
          },
        });
      }
    } else {
      logger.warn('[LIFEFILE DATA PUSH] Order not found', {
        orderId,
        referenceId,
      });
    }
  }

  return { processed: true, orderId, status, eventType };
}

/**
 * Process Order Status Update
 */
async function processOrderStatus(clinicId: number, data: any) {
  logger.info('[LIFEFILE DATA PUSH] Processing Order Status Update');

  const { orderId, referenceId } = extractLifefileOrderIdentifiers(data);
  const orderData = data.order || data;
  const status = orderData.status;
  const shippingStatus = orderData.shippingStatus ?? orderData.shippingstatus;
  const trackingNumber = orderData.trackingNumber ?? orderData.trackingnumber;
  const trackingUrl = orderData.trackingUrl ?? orderData.trackingurl;
  const eventType = orderData.eventType ?? orderData.eventtype ?? 'order_status';

  logger.info('[LIFEFILE DATA PUSH] Order Status', {
    orderId: orderId ?? '(none)',
    referenceId: referenceId ?? '(none)',
    status,
  });

  const where = buildOrderLookupWhere(clinicId, orderId, referenceId);
  if (where) {
    const order = await prisma.order.findFirst({
      where,
    });

    if (order) {
      const updateData: any = {
        lastWebhookAt: new Date(),
        lastWebhookPayload: JSON.stringify(data),
      };

      if (status) updateData.status = status;
      if (shippingStatus) updateData.shippingStatus = shippingStatus;
      if (trackingNumber) updateData.trackingNumber = trackingNumber;
      if (trackingUrl) updateData.trackingUrl = trackingUrl;

      await prisma.order.update({
        where: { id: order.id },
        data: updateData,
      });

      const orderEventNote = `Status: ${status ?? ''}${shippingStatus ? `, Shipping: ${String(shippingStatus).slice(0, 64)}` : ''}`;
      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          lifefileOrderId: orderId ?? undefined,
          eventType: sanitizeEventType(eventType),
          payload: data as object,
          note: orderEventNote.slice(0, 500),
        },
      });

      // Notify admins of tracking updates
      if (trackingNumber || shippingStatus) {
        try {
          const patient = await prisma.patient.findUnique({
            where: { id: order.patientId },
            select: { id: true, firstName: true, lastName: true, clinicId: true },
          });

          if (patient) {
            const firstName = safeDecryptPHI(patient.firstName) || 'Patient';
            const lastName = safeDecryptPHI(patient.lastName) || '';
            const patientName = `${firstName} ${lastName}`.trim();

            await notificationService.notifyAdmins({
              clinicId: patient.clinicId,
              category: 'ORDER',
              priority: 'NORMAL',
              title: 'Tracking Update',
              message: `Order for ${patientName}: ${trackingNumber || shippingStatus || status}`,
              actionUrl: `/patients/${patient.id}?tab=prescriptions`,
              metadata: { orderId: order.id, trackingNumber, shippingStatus },
              sourceType: 'webhook',
              sourceId: `lifefile-${orderId}-${eventType}`,
            });
          }
        } catch (err) {
          logger.warn('[LIFEFILE DATA PUSH] Notification failed:', { error: err instanceof Error ? err.message : String(err) });
        }
      }
    } else {
      logger.warn('[LIFEFILE DATA PUSH] Order not found', { orderId, referenceId });
    }
  }

  return { processed: true, orderId, status, shippingStatus, trackingNumber };
}

/**
 * POST /api/webhooks/lifefile-data-push
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  let webhookLogData: any = {
    endpoint: '/api/webhooks/lifefile-data-push',
    method: 'POST',
    status: WebhookStatus.ERROR,
    statusCode: 500,
  };

  try {
    logger.info('='.repeat(60));
    logger.info('[LIFEFILE DATA PUSH] New webhook request received');

    // Extract headers
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = key.toLowerCase().includes('auth') ? '[REDACTED]' : value;
    });
    webhookLogData.headers = headers;
    webhookLogData.ipAddress = req.headers.get('x-forwarded-for') || 'unknown';

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
        logger.warn('[LifeFile DataPush] Failed to persist webhook log for auth failure', { error: err instanceof Error ? err.message : String(err) });
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clinic = authResult.clinic;
    webhookLogData.clinicId = clinic.id;

    // Parse request body (with size limit)
    const contentType = req.headers.get('content-type') ?? '';
    const rawBody = await req.text();
    if (!rawBody) {
      webhookLogData.errorMessage = 'Empty request body';
      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile DataPush] Failed to persist webhook log for empty body', { error: err instanceof Error ? err.message : String(err) });
      });
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }
    if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 413;
      webhookLogData.errorMessage = 'Payload too large';
      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile DataPush] Failed to persist webhook log for oversized payload', { error: err instanceof Error ? err.message : String(err) });
      });
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let payload: Record<string, any>;
    if (contentType.includes('xml')) {
      const parsed = await parseXmlPayload(rawBody);
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
        webhookLogData.statusCode = 400;
        webhookLogData.errorMessage = 'Invalid XML structure';
        await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
          logger.warn('[LifeFile DataPush] Failed to persist webhook log for invalid XML', { error: err instanceof Error ? err.message : String(err) });
        });
        return NextResponse.json({ error: 'Invalid XML format' }, { status: 400 });
      }
      payload = parsed as Record<string, unknown>;
    } else {
      const { safeParseJsonString } = await import('@/lib/utils/safe-json');
      const parsed = safeParseJsonString<unknown>(rawBody);
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
        webhookLogData.statusCode = 400;
        webhookLogData.errorMessage = 'Invalid JSON or payload must be an object';
        await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
          logger.warn('[LifeFile DataPush] Failed to persist webhook log for invalid JSON', { error: err instanceof Error ? err.message : String(err) });
        });
        return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
      }
      payload = parsed as Record<string, unknown>;
    }

    webhookLogData.payload = payload;

    // Determine event type and process
    let result: any;
    const eventType = payload.type || payload.eventType || payload.eventtype || '';

    if (eventType.toLowerCase().includes('rx') || payload.rx || payload.prescription) {
      result = await processRxEvent(clinic.id, payload);
    } else if (eventType.toLowerCase().includes('order') || payload.order || payload.status) {
      result = await processOrderStatus(clinic.id, payload);
    } else {
      logger.warn('[LIFEFILE DATA PUSH] Unknown event type:', eventType);
      result = { processed: false, reason: 'Unknown event type' };
    }

    const processingTime = Date.now() - startTime;

    webhookLogData.status = WebhookStatus.SUCCESS;
    webhookLogData.statusCode = 200;
    webhookLogData.responseData = result;
    webhookLogData.processingTimeMs = processingTime;

    await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
      logger.warn('[LifeFile DataPush] Failed to persist webhook log', { error: err instanceof Error ? err.message : String(err) });
    });

    logger.info(`[LIFEFILE DATA PUSH] Completed in ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      message: 'Data push processed successfully',
      clinic: clinic.name,
      result,
      processingTimeMs: processingTime,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[LIFEFILE DATA PUSH] Error', {
      message: errorMessage,
      name: error instanceof Error ? error.name : undefined,
    });

    webhookLogData.status = WebhookStatus.ERROR;
    webhookLogData.statusCode = 500;
    webhookLogData.errorMessage = errorMessage;
    webhookLogData.processingTimeMs = Date.now() - startTime;

    await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
      logger.warn('[LifeFile DataPush] Failed to persist webhook log for processing error', { error: err instanceof Error ? err.message : String(err) });
    });

    return NextResponse.json(
      { error: 'Internal server error', message: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/lifefile-data-push
 */
export async function GET() {
  const configuredClinics = await prisma.clinic.count({
    where: {
      lifefileInboundEnabled: true,
      lifefileInboundUsername: { not: null },
      lifefileInboundPassword: { not: null },
    },
  });

  return NextResponse.json({
    endpoint: '/api/webhooks/lifefile-data-push',
    status: 'active',
    authentication: 'Basic Auth (username determines clinic)',
    configuredClinics,
    configuredVia: 'Admin UI - Inbound Webhook Settings',
    accepts: ['application/json', 'application/xml'],
    events: ['rx_events', 'order_status'],
  });
}
