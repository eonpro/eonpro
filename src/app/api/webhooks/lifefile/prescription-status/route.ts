/**
 * Webhook endpoint for Lifefile prescription status updates
 * Receives real-time updates about prescription fulfillment
 * 
 * Authentication: Basic Auth with lifefile_webhook credentials
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { WebhookStatus } from '@prisma/client';
import { z } from 'zod';

// Configuration
const WEBHOOK_USERNAME = process.env.LIFEFILE_WEBHOOK_USERNAME || 'lifefile_webhook';
const WEBHOOK_PASSWORD = process.env.LIFEFILE_WEBHOOK_PASSWORD || '';

/**
 * Verify Basic Authentication
 */
function verifyBasicAuth(authHeader: string | null): boolean {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (!WEBHOOK_PASSWORD) {
    if (isDevelopment) {
      logger.warn('[LIFEFILE PRESCRIPTION] No auth configured, accepting (development mode)');
      return true;
    } else {
      logger.error('[LIFEFILE PRESCRIPTION] No auth configured in production');
      return false;
    }
  }

  if (!authHeader) {
    logger.error('[LIFEFILE PRESCRIPTION] Missing Authorization header');
    return false;
  }

  try {
    const base64Credentials = authHeader.replace(/^Basic\s+/i, '');
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    if (username === WEBHOOK_USERNAME && password === WEBHOOK_PASSWORD) {
      logger.info('[LIFEFILE PRESCRIPTION] Authentication successful');
      return true;
    }

    logger.error('[LIFEFILE PRESCRIPTION] Authentication failed - invalid credentials');
    return false;
  } catch (error) {
    logger.error('[LIFEFILE PRESCRIPTION] Error parsing auth header:', error);
    return false;
  }
}

// Flexible payload schema - accept various formats from Lifefile
const prescriptionUpdateSchema = z.object({
  // Event info
  orderId: z.string().optional(),
  referenceId: z.string().optional(),
  status: z.string().optional(),
  
  // Tracking info
  trackingNumber: z.string().optional(),
  trackingUrl: z.string().optional(),
  carrier: z.string().optional(),
  
  // Timestamps
  shippedAt: z.string().optional(),
  deliveredAt: z.string().optional(),
  
  // Additional data
  notes: z.string().optional(),
  metadata: z.any().optional(),
}).passthrough(); // Allow additional fields

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

    // Verify Basic Auth
    const authHeader = req.headers.get('authorization');
    if (!verifyBasicAuth(authHeader)) {
      webhookLogData.status = WebhookStatus.INVALID_AUTH;
      webhookLogData.statusCode = 401;
      await prisma.webhookLog.create({ data: webhookLogData }).catch(() => {});
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    logger.info(`[LIFEFILE PRESCRIPTION] Processing - Order: ${orderId}, Status: ${status}`);

    // Find the order
    const order = await prisma.order.findFirst({
      where: {
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
    webhookLogData.clinicId = order.patient?.clinicId;
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
  return NextResponse.json({
    status: 'healthy',
    endpoint: '/api/webhooks/lifefile/prescription-status',
    authentication: 'Basic Auth',
    configured: !!WEBHOOK_PASSWORD,
    timestamp: new Date().toISOString(),
  });
}
