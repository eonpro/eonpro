/**
 * Webhook endpoint for Lifefile prescription status updates
 * Receives real-time updates about prescription fulfillment
 * 
 * Authentication: Basic Auth with lifefile_webhook credentials
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendPrescriptionNotification } from '@/lib/prescription-tracking/notifications';
import { updateFulfillmentAnalytics } from '@/lib/prescription-tracking/analytics';
import { z } from 'zod';
import crypto from 'crypto';

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

// Webhook payload schema
const prescriptionUpdateSchema = z.object({
  eventType: z.string(),
  timestamp: z.string(),
  prescription: z.object({
    rxNumber: z.string(),
    orderId: z.string().optional(),
    patientId: z.string().optional(),
    medicationName: z.string().optional(),
    quantity: z.number().optional(),
    refills: z.number().optional(),
  }),
  status: z.object({
    current: z.string(),
    previous: z.string().optional(),
    changedAt: z.string(),
    notes: z.string().optional(),
  }),
  tracking: z.object({
    trackingNumber: z.string().optional(),
    carrier: z.string().optional(),
    estimatedDelivery: z.string().optional(),
    currentLocation: z.string().optional(),
    trackingUrl: z.string().optional(),
  }).optional(),
  pharmacy: z.object({
    name: z.string().optional(),
    orderId: z.string().optional(),
    phone: z.string().optional(),
  }).optional(),
  metadata: z.any().optional(),
});

/**
 * Verify webhook signature from Lifefile
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Map Lifefile status to our internal status
 */
function mapLifefileStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'order_sent': 'SENT_TO_PHARMACY',
    'order_received': 'RECEIVED',
    'order_processing': 'PROCESSING',
    'order_ready': 'READY_FOR_PICKUP',
    'order_shipped': 'SHIPPED',
    'out_for_delivery': 'OUT_FOR_DELIVERY',
    'delivered': 'DELIVERED',
    'returned': 'RETURNED',
    'cancelled': 'CANCELLED',
    'on_hold': 'ON_HOLD',
    'failed': 'FAILED',
  };
  
  return statusMap[status.toLowerCase()] || 'PENDING';
}

/**
 * POST /api/webhooks/lifefile/prescription-status
 * Receive prescription status updates from Lifefile
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Get raw body for signature verification
    const rawBody = await req.text();
    const headers = Object.fromEntries(req.headers.entries());
    
    // Log webhook event
    const webhookLogId = `lf-rx-${Date.now()}`;
    logger.info(`[LIFEFILE PRESCRIPTION] Webhook received - ID: ${webhookLogId}`);

    // Verify Basic Auth first
    const authHeader = req.headers.get('authorization');
    if (!verifyBasicAuth(authHeader)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Also verify HMAC signature if configured (optional additional security)
    if (process.env.LIFEFILE_WEBHOOK_SECRET) {
      const signature = headers['x-lifefile-signature'] || headers['x-webhook-signature'];
      
      if (signature) {
        const isValid = verifyWebhookSignature(
          rawBody,
          signature,
          process.env.LIFEFILE_WEBHOOK_SECRET
        );
        
        if (!isValid) {
          logger.warn('[LIFEFILE PRESCRIPTION] HMAC signature verification failed');
          // Don't fail - Basic Auth already passed
        }
      }
    }

    // Parse and validate payload
    const body = JSON.parse(rawBody);
    const parsed = prescriptionUpdateSchema.safeParse(body);
    
    if (!parsed.success) {
      logger.error('[LIFEFILE PRESCRIPTION] Invalid webhook payload', { errors: parsed.error.issues });
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const newStatus = mapLifefileStatus(data.status.current);
    
    // Find or create prescription tracking record
    let prescription = await (prisma as any).prescriptionTracking.findUnique({
      where: { rxNumber: data.prescription.rxNumber },
      include: {
        patient: true,
        order: true,
      }
    });

    if (!prescription) {
      // Try to find the order
      const order = data.prescription.orderId ? 
        await // @ts-ignore
    prisma.order.findFirst({
          where: { 
            OR: [
              { id: parseInt(data.prescription.orderId) },
              { lifefileOrderId: data.prescription.orderId }
            ]
          }
        }) : null;

      if (!order) {
        logger.error('Order not found for prescription', { 
          rxNumber: data.prescription.rxNumber,
          orderId: data.prescription.orderId 
        });
        
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404 }
        );
      }

      // Create new tracking record
      prescription = await (prisma as any).prescriptionTracking.create({
        data: {
          rxNumber: data.prescription.rxNumber,
          orderId: order.id,
          patientId: order.patientId,
          providerId: order.providerId,
          medicationName: data.prescription.medicationName || 'Unknown',
          quantity: data.prescription.quantity || 0,
          refills: data.prescription.refills || 0,
          currentStatus: newStatus as any,
          currentStatusNote: data.status.notes,
          pharmacyName: data.pharmacy?.name,
          pharmacyOrderId: data.pharmacy?.orderId,
          pharmacyPhone: data.pharmacy?.phone,
          trackingNumber: data.tracking?.trackingNumber,
          carrier: data.tracking?.carrier,
          estimatedDeliveryDate: data.tracking?.estimatedDelivery ? 
            new Date(data.tracking.estimatedDelivery) : undefined,
          metadata: data.metadata,
        },
        include: {
          patient: true,
          order: true,
        }
      });
    }

    // Calculate fulfillment times
    const previousEvent: any = await (prisma as any).prescriptionStatusEvent.findFirst({
      where: { prescriptionId: prescription.id },
      orderBy: { createdAt: 'desc' },
    });

    let timeMetrics: any = {};
    if (previousEvent) {
      const timeDiff = Date.now() - previousEvent.createdAt.getTime();
      const minutesDiff = Math.round(timeDiff / 60000);
      
      // Calculate specific transition times
      if (previousEvent.status === "RECEIVED" && (newStatus as any) === "PROCESSING") {
        timeMetrics.timeToProcess = minutesDiff;
      } else if (previousEvent.status === "PROCESSING" && (newStatus as any) === "SHIPPED") {
        timeMetrics.timeToShip = minutesDiff;
      } else if (previousEvent.status === "SHIPPED" && (newStatus as any) === "DELIVERED") {
        timeMetrics.timeToDeliver = minutesDiff;
      }
    }

    // Update prescription tracking
    const updatedPrescription = await (prisma as any).prescriptionTracking.update({
      where: { id: prescription.id },
      data: {
        currentStatus: newStatus as any,
        currentStatusNote: data.status.notes,
        trackingNumber: data.tracking?.trackingNumber || prescription.trackingNumber,
        carrier: data.tracking?.carrier || prescription.carrier,
        estimatedDeliveryDate: data.tracking?.estimatedDelivery ? 
          new Date(data.tracking.estimatedDelivery) : prescription.estimatedDeliveryDate,
        actualDeliveryDate: (newStatus as any) === "DELIVERED"  ? new Date()  : undefined,
        metadata: data.metadata,
        ...timeMetrics,
        // Calculate total fulfillment time if delivered
        totalFulfillmentTime: (newStatus as any) === "DELIVERED"  ? Math.round((Date.now() - prescription.createdAt.getTime()) / 60000)  : undefined,
      }
    });

    // Create status event
    await (prisma as any).prescriptionStatusEvent.create({
      data: {
        prescriptionId: prescription.id,
        status: newStatus as any,
        previousStatus: prescription.currentStatus as any,
        description: `Status changed from ${prescription.currentStatus} to ${newStatus}`,
        notes: data.status.notes,
        source: 'webhook',
        webhookPayload: data,
        location: data.tracking?.currentLocation,
        trackingUpdate: data.tracking,
        triggeredBy: 'lifefile-webhook',
      }
    });

    logger.info(`[LIFEFILE PRESCRIPTION] Processed successfully - Prescription: ${prescription.id}`);

    // Send notifications to patient asynchronously
    sendPrescriptionNotification(prescription.id, newStatus as any)
      .catch(err => logger.error('Failed to send notification', err));

    // Update analytics asynchronously
    updateFulfillmentAnalytics(prescription.id)
      .catch(err => logger.error('Failed to update analytics', err));

    // Return success response quickly
    return NextResponse.json({
      success: true,
      message: 'Webhook processed successfully',
      prescriptionId: prescription.id,
      status: newStatus,
      processingTime: Date.now() - startTime,
    });

  } catch (error: any) {
    logger.error('Webhook processing error', { 
      error: error.message,
    });
    
    return NextResponse.json(
      { error: 'Internal server error', message: error.message },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    endpoint: 'lifefile-prescription-webhook',
    timestamp: new Date().toISOString(),
  });
}
