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

    // Find clinic by matching password
    for (const clinic of clinics) {
      const decryptedPassword = safeDecrypt(clinic.lifefileInboundPassword);
      const decryptedUsername = safeDecrypt(clinic.lifefileInboundUsername);
      
      // Accept if password matches AND username is either configured or in accepted list
      const usernameMatch = usernameAccepted || providedUsername === decryptedUsername;
      const passwordMatch = providedPassword === decryptedPassword;

      if (usernameMatch && passwordMatch) {
        logger.info(`[LIFEFILE DATA PUSH] Authenticated as clinic: ${clinic.name} (username: ${providedUsername})`);
        return { clinic, authenticated: true };
      }
    }

    logger.error(`[LIFEFILE DATA PUSH] No clinic found for credentials (username: ${providedUsername})`);
    return { clinic: null, authenticated: false };

  } catch (error) {
    logger.error('[LIFEFILE DATA PUSH] Error parsing auth header:', error);
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
  
  const orderId = rxData.orderId || rxData.orderid;
  const referenceId = rxData.referenceId || rxData.referenceid;
  const status = rxData.status;
  const eventType = rxData.eventType || rxData.eventtype || 'rx_event';

  logger.info(`[LIFEFILE DATA PUSH] Rx Event - Order: ${orderId}, Status: ${status}`);

  if (orderId || referenceId) {
    const order = await prisma.order.findFirst({
      where: {
        clinicId,
        OR: [
          { lifefileOrderId: orderId || '' },
          { referenceId: referenceId || '' },
        ].filter(c => Object.values(c)[0]),
      },
    });

    if (order) {
      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          lifefileOrderId: orderId,
          eventType: eventType,
          payload: data,
          note: `Rx Event: ${status}`,
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
      logger.warn(`[LIFEFILE DATA PUSH] Order not found: ${orderId || referenceId}`);
    }
  }

  return { processed: true, orderId, status, eventType };
}

/**
 * Process Order Status Update
 */
async function processOrderStatus(clinicId: number, data: any) {
  logger.info('[LIFEFILE DATA PUSH] Processing Order Status Update');
  
  const orderData = data.order || data;
  
  const orderId = orderData.orderId || orderData.orderid || orderData.id;
  const referenceId = orderData.referenceId || orderData.referenceid;
  const status = orderData.status;
  const shippingStatus = orderData.shippingStatus || orderData.shippingstatus;
  const trackingNumber = orderData.trackingNumber || orderData.trackingnumber;
  const trackingUrl = orderData.trackingUrl || orderData.trackingurl;
  const eventType = orderData.eventType || orderData.eventtype || 'order_status';

  logger.info(`[LIFEFILE DATA PUSH] Order Status - Order: ${orderId}, Status: ${status}`);

  if (orderId || referenceId) {
    const order = await prisma.order.findFirst({
      where: {
        clinicId,
        OR: [
          { lifefileOrderId: orderId || '' },
          { referenceId: referenceId || '' },
        ].filter(c => Object.values(c)[0]),
      },
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

      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          lifefileOrderId: orderId,
          eventType: eventType,
          payload: data,
          note: `Status: ${status}${shippingStatus ? `, Shipping: ${shippingStatus}` : ''}`,
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
          logger.warn('[LIFEFILE DATA PUSH] Notification failed:', err);
        }
      }
    } else {
      logger.warn(`[LIFEFILE DATA PUSH] Order not found: ${orderId || referenceId}`);
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
    logger.info('=' .repeat(60));
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
      await prisma.webhookLog.create({ data: webhookLogData }).catch(() => {});
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clinic = authResult.clinic;
    webhookLogData.clinicId = clinic.id;

    // Parse request body
    const contentType = req.headers.get('content-type') || '';
    const rawBody = await req.text();
    
    if (!rawBody) {
      throw new Error('Empty request body');
    }

    let payload: any;
    if (contentType.includes('xml')) {
      payload = await parseXmlPayload(rawBody);
    } else {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        throw new Error('Invalid JSON format');
      }
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
    
    await prisma.webhookLog.create({ data: webhookLogData }).catch(() => {});
    
    logger.info(`[LIFEFILE DATA PUSH] Completed in ${processingTime}ms`);

    return NextResponse.json({
      success: true,
      message: 'Data push processed successfully',
      clinic: clinic.name,
      result,
      processingTimeMs: processingTime,
    });

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[LIFEFILE DATA PUSH] Error:', error);
    
    webhookLogData.status = WebhookStatus.ERROR;
    webhookLogData.statusCode = 500;
    webhookLogData.errorMessage = errorMessage;
    webhookLogData.processingTimeMs = Date.now() - startTime;
    
    await prisma.webhookLog.create({ data: webhookLogData }).catch(() => {});

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
