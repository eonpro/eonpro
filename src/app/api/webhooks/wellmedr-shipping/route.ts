/**
 * Wellmedr Lifefile Shipping Webhook
 * 
 * Receives shipping/tracking updates from Lifefile for Wellmedr prescriptions.
 * Stores data at the patient profile level in PatientShippingUpdate table.
 * 
 * Similar to NewSelf's shipping webhook endpoint pattern:
 * curl -X POST https://app.eonpro.io/api/webhooks/wellmedr-shipping \
 *   -H "Authorization: Basic $(echo -n 'username:password' | base64)" \
 *   -H "Content-Type: application/json" \
 *   -d '{"trackingNumber": "...", "orderId": "...", "deliveryService": "..."}'
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ShippingStatus, WebhookStatus } from '@prisma/client';
import { z } from 'zod';
import { decryptPHI } from '@/lib/security/phi-encryption';

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

// Configuration
const WEBHOOK_USERNAME = process.env.WELLMEDR_SHIPPING_WEBHOOK_USERNAME || 
                        process.env.WELLMEDR_INTAKE_WEBHOOK_SECRET?.split(':')[0] ||
                        'wellmedr_shipping';
const WEBHOOK_PASSWORD = process.env.WELLMEDR_SHIPPING_WEBHOOK_PASSWORD || 
                        process.env.WELLMEDR_INTAKE_WEBHOOK_SECRET?.split(':')[1] ||
                        '';

// Wellmedr clinic subdomain (hardcoded for security)
const WELLMEDR_SUBDOMAIN = 'wellmedr';

// Payload validation schema
const shippingPayloadSchema = z.object({
  // Required fields
  trackingNumber: z.string().min(1, 'Tracking number is required'),
  orderId: z.string().min(1, 'Order ID is required'),
  deliveryService: z.string().min(1, 'Delivery service is required'),
  
  // Optional fields
  brand: z.string().optional().default('Wellmedr'),
  status: z.string().optional().default('shipped'),
  estimatedDelivery: z.string().optional(),
  actualDelivery: z.string().optional(),
  trackingUrl: z.string().url().optional(),
  
  // Medication info (optional)
  medication: z.object({
    name: z.string().optional(),
    strength: z.string().optional(),
    quantity: z.string().optional(),
    form: z.string().optional(),
  }).optional(),
  
  // Patient identification (optional, will try to find by order)
  patientEmail: z.string().email().optional(),
  patientId: z.string().optional(),
  
  // Additional metadata
  timestamp: z.string().optional(),
  notes: z.string().optional(),
});

type ShippingPayload = z.infer<typeof shippingPayloadSchema>;

/**
 * Verify Basic Authentication
 */
function verifyBasicAuth(authHeader: string | null): boolean {
  // In development, allow without auth if not configured
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  if (!WEBHOOK_PASSWORD) {
    if (isDevelopment) {
      logger.warn('[WELLMEDR SHIPPING] No authentication configured, accepting request (development mode)');
      return true;
    } else {
      logger.error('[WELLMEDR SHIPPING] No authentication configured in production');
      return false;
    }
  }

  if (!authHeader) {
    logger.error('[WELLMEDR SHIPPING] Missing Authorization header');
    return false;
  }

  try {
    // Parse Basic auth header
    const base64Credentials = authHeader.replace(/^Basic\s+/i, '');
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    if (username === WEBHOOK_USERNAME && password === WEBHOOK_PASSWORD) {
      logger.info('[WELLMEDR SHIPPING] Authentication successful');
      return true;
    }

    logger.error('[WELLMEDR SHIPPING] Authentication failed - invalid credentials');
    return false;
  } catch (error) {
    logger.error('[WELLMEDR SHIPPING] Error parsing auth header:', error);
    return false;
  }
}

/**
 * Map Lifefile status string to our ShippingStatus enum
 */
function mapToShippingStatus(status: string): ShippingStatus {
  const statusMap: Record<string, ShippingStatus> = {
    'pending': ShippingStatus.PENDING,
    'label_created': ShippingStatus.LABEL_CREATED,
    'shipped': ShippingStatus.SHIPPED,
    'in_transit': ShippingStatus.IN_TRANSIT,
    'out_for_delivery': ShippingStatus.OUT_FOR_DELIVERY,
    'delivered': ShippingStatus.DELIVERED,
    'returned': ShippingStatus.RETURNED,
    'exception': ShippingStatus.EXCEPTION,
    'cancelled': ShippingStatus.CANCELLED,
    // Common variations
    'labelcreated': ShippingStatus.LABEL_CREATED,
    'intransit': ShippingStatus.IN_TRANSIT,
    'outfordelivery': ShippingStatus.OUT_FOR_DELIVERY,
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
    logger.warn('[WELLMEDR SHIPPING] Date parse failed', { error: error instanceof Error ? error.message : 'Unknown error', dateStr });
    return undefined;
  }
}

/**
 * Find patient by Lifefile order ID or email
 * Also tries to find the most recent order for the patient if no exact match
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
      OR: [
        { lifefileOrderId },
        { referenceId: lifefileOrderId },
      ],
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
    // Try to find the most recent order for this patient that doesn't have a lifefileOrderId yet
    // This helps link shipping updates when LifeFile's orderId wasn't captured initially
    const recentOrder = await prisma.order.findFirst({
      where: {
        clinicId,
        patientId: patient.id,
        // Look for orders without lifefileOrderId or with no tracking
        OR: [
          { lifefileOrderId: null },
          { lifefileOrderId: '' },
          { trackingNumber: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: true,
      },
    });

    if (recentOrder) {
      logger.info(`[WELLMEDR SHIPPING] Found recent order ${recentOrder.id} for patient ${patient.id} without tracking`);
      return { patient, order: recentOrder };
    }

    // Also try to find ANY recent order (within last 30 days) if tracking might need updating
    const recentOrderWithinMonth = await prisma.order.findFirst({
      where: {
        clinicId,
        patientId: patient.id,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        patient: true,
      },
    });

    if (recentOrderWithinMonth) {
      logger.info(`[WELLMEDR SHIPPING] Found recent order ${recentOrderWithinMonth.id} within 30 days for patient ${patient.id}`);
      return { patient, order: recentOrderWithinMonth };
    }

    return { patient, order: null };
  }

  return null;
}

/**
 * POST /api/webhooks/wellmedr-shipping
 * Receives shipping updates from Lifefile and stores at patient profile level
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = `wellmedr-ship-${Date.now()}`;
  
  let webhookLogData: any = {
    endpoint: '/api/webhooks/wellmedr-shipping',
    method: 'POST',
    status: WebhookStatus.ERROR,
    statusCode: 500,
  };

  try {
    logger.info('=' .repeat(60));
    logger.info(`[WELLMEDR SHIPPING] New webhook request - ${requestId}`);
    logger.info(`[WELLMEDR SHIPPING] Time: ${new Date().toISOString()}`);

    // Extract headers for logging
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = key.toLowerCase().includes('auth') || key.toLowerCase().includes('secret')
        ? '[REDACTED]'
        : value;
    });
    webhookLogData.headers = headers;
    webhookLogData.ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    webhookLogData.userAgent = req.headers.get('user-agent') || 'unknown';

    // Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!verifyBasicAuth(authHeader)) {
      webhookLogData.status = WebhookStatus.INVALID_AUTH;
      webhookLogData.statusCode = 401;
      webhookLogData.errorMessage = 'Authentication failed';
      
      await prisma.webhookLog.create({ data: webhookLogData });
      
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse and validate payload
    const rawBody = await req.text();
    if (!rawBody) {
      throw new Error('Empty request body');
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 400;
      webhookLogData.errorMessage = 'Invalid JSON';
      
      await prisma.webhookLog.create({ data: webhookLogData });
      
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    webhookLogData.payload = payload;

    // Validate payload against schema
    const parseResult = shippingPayloadSchema.safeParse(payload);
    if (!parseResult.success) {
      const errors = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      logger.error('[WELLMEDR SHIPPING] Validation failed:', errors);
      
      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 400;
      webhookLogData.errorMessage = errors.join(', ');
      
      await prisma.webhookLog.create({ data: webhookLogData });
      
      return NextResponse.json(
        { error: 'Invalid payload', details: errors },
        { status: 400 }
      );
    }

    const data: ShippingPayload = parseResult.data;
    
    logger.info(`[WELLMEDR SHIPPING] Processing shipment - Order: ${data.orderId}, Tracking: ${data.trackingNumber}`);

    // Get Wellmedr clinic (hardcoded for security)
    const clinic = await prisma.clinic.findUnique({
      where: { subdomain: WELLMEDR_SUBDOMAIN },
    });

    if (!clinic) {
      logger.error('[WELLMEDR SHIPPING] Wellmedr clinic not found');
      
      return NextResponse.json(
        { error: 'Clinic not found', message: 'Wellmedr clinic not configured' },
        { status: 500 }
      );
    }

    // Find patient and order
    const result = await findPatient(
      clinic.id,
      data.orderId,
      data.patientEmail,
      data.patientId
    );

    if (!result) {
      logger.warn(`[WELLMEDR SHIPPING] Patient/Order not found for order ${data.orderId}`);
      
      // Log the webhook but don't fail - the order might not be created yet
      webhookLogData.status = WebhookStatus.SUCCESS;
      webhookLogData.statusCode = 202;
      webhookLogData.responseData = {
        processed: false,
        reason: 'Patient or order not found',
        orderId: data.orderId,
      };
      
      await prisma.webhookLog.create({ data: webhookLogData });
      
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

    // Check for existing shipping update with same tracking number
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
      actualDelivery: shippingStatus === ShippingStatus.DELIVERED ? new Date() : parseDate(data.actualDelivery),
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
      // Update existing record
      shippingUpdate = await prisma.patientShippingUpdate.update({
        where: { id: existingUpdate.id },
        data: updateData,
      });
      logger.info(`[WELLMEDR SHIPPING] Updated existing shipping record ${existingUpdate.id}`);
    } else {
      // Create new record
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
      logger.info(`[WELLMEDR SHIPPING] Created new shipping record ${shippingUpdate.id}`);
    }

    // Also update the Order record if we have one
    if (order) {
      // Build update data - also save lifefileOrderId if it wasn't set before
      const orderUpdateData: any = {
        trackingNumber: data.trackingNumber,
        trackingUrl: data.trackingUrl,
        shippingStatus: data.status,
        lastWebhookAt: new Date(),
        lastWebhookPayload: JSON.stringify(payload),
      };

      // Save the lifefileOrderId if it's not already set
      // This helps link orders that weren't properly connected to LifeFile initially
      if (!order.lifefileOrderId && data.orderId) {
        orderUpdateData.lifefileOrderId = data.orderId;
        logger.info(`[WELLMEDR SHIPPING] Saving lifefileOrderId ${data.orderId} to order ${order.id}`);
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

    await prisma.webhookLog.create({ data: webhookLogData });

    logger.info(`[WELLMEDR SHIPPING] Processing completed in ${processingTime}ms`);
    logger.info('=' .repeat(60));

    // Return success response
    // Decrypt patient PHI for display in response
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
      order: order ? {
        id: order.id,
        lifefileOrderId: order.lifefileOrderId,
      } : null,
      processingTime: `${processingTime}ms`,
    });

  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[WELLMEDR SHIPPING] Error processing webhook:', error);

    webhookLogData.status = WebhookStatus.ERROR;
    webhookLogData.statusCode = 500;
    webhookLogData.errorMessage = errorMessage;
    webhookLogData.processingTimeMs = Date.now() - startTime;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.webhookLog.create({ data: webhookLogData }).catch((dbError: any) => {
      logger.error('[WELLMEDR SHIPPING] Failed to log webhook error:', dbError);
    });

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/wellmedr-shipping
 * Health check endpoint
 */
export async function GET(req: NextRequest) {
  // Verify clinic exists
  const clinic = await prisma.clinic.findUnique({
    where: { subdomain: WELLMEDR_SUBDOMAIN },
    select: { id: true, name: true, lifefileEnabled: true },
  });

  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/webhooks/wellmedr-shipping',
    clinic: clinic?.name || 'Not Found',
    lifefileEnabled: clinic?.lifefileEnabled || false,
    configured: !!(WEBHOOK_PASSWORD),
    authentication: 'Basic Auth',
    accepts: ['application/json'],
    usage: {
      method: 'POST',
      headers: {
        'Authorization': 'Basic base64(username:password)',
        'Content-Type': 'application/json',
      },
      requiredFields: ['trackingNumber', 'orderId', 'deliveryService'],
      optionalFields: [
        'brand', 'status', 'estimatedDelivery', 'actualDelivery',
        'trackingUrl', 'medication', 'patientEmail', 'patientId',
        'timestamp', 'notes',
      ],
    },
  });
}
