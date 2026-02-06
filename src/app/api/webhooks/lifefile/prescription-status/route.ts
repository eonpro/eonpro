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
        logger.info(`[LIFEFILE PRESCRIPTION] Authenticated as clinic: ${clinic.name} (username: ${providedUsername})`);
        return { clinic, authenticated: true };
      }
    }

    logger.error(`[LIFEFILE PRESCRIPTION] No clinic found for credentials (username: ${providedUsername})`);
    return { clinic: null, authenticated: false };

  } catch (error) {
    logger.error('[LIFEFILE PRESCRIPTION] Error parsing auth header:', error);
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
    // Get raw body
    const rawBody = await req.text();
    
    // Extract headers for logging
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = key.toLowerCase().includes('auth') ? '[REDACTED]' : value;
    });
    webhookLogData.headers = headers;
    webhookLogData.ipAddress = req.headers.get('x-forwarded-for') || 'unknown';

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
      await prisma.webhookLog.create({ data: webhookLogData }).catch(() => {});
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clinic = authResult.clinic;
    webhookLogData.clinicId = clinic.id;

    // Parse payload
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 400;
      await prisma.webhookLog.create({ data: webhookLogData }).catch(() => {});
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    webhookLogData.payload = payload;

    // Extract key fields
    const orderId = payload.orderId || payload.order_id;
    const referenceId = payload.referenceId || payload.reference_id;
    const status = payload.status;
    const trackingNumber = payload.trackingNumber || payload.tracking_number;
    const trackingUrl = payload.trackingUrl || payload.tracking_url;

    logger.info(`[LIFEFILE PRESCRIPTION] Processing - Clinic: ${clinic.name}, Order: ${orderId}, Status: ${status}`);

    // Find the order (scoped to the authenticated clinic)
    const order = await prisma.order.findFirst({
      where: {
        clinicId: clinic.id,
        OR: [
          { lifefileOrderId: orderId || '' },
          { referenceId: referenceId || '' },
        ].filter(c => Object.values(c)[0]),
      },
      include: {
        patient: {
          select: { id: true, clinicId: true },
        },
      },
    });

    if (!order) {
      logger.warn(`[LIFEFILE PRESCRIPTION] Order not found: ${orderId || referenceId}`);
      
      webhookLogData.status = WebhookStatus.SUCCESS;
      webhookLogData.statusCode = 202;
      webhookLogData.responseData = { processed: false, reason: 'Order not found' };
      await prisma.webhookLog.create({ data: webhookLogData }).catch(() => {});

      return NextResponse.json({
        success: false,
        message: 'Order not found',
        clinic: clinic.name,
        orderId,
        referenceId,
      }, { status: 202 });
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

    // Create order event for audit trail
    await prisma.orderEvent.create({
      data: {
        orderId: order.id,
        lifefileOrderId: orderId,
        eventType: `prescription_${status || 'update'}`,
        payload: payload,
        note: trackingNumber ? `Tracking: ${trackingNumber}` : `Status: ${status}`,
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

    await prisma.webhookLog.create({ data: webhookLogData }).catch(() => {});

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

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[LIFEFILE PRESCRIPTION] Error:', error);

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
