import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notificationService } from '@/services/notification';
import { WebhookStatus } from '@prisma/client';
import xml2js from 'xml2js';
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

// Configuration from environment variables
// For development/testing, allow fallback to test credentials
const WEBHOOK_USERNAME = process.env.LIFEFILE_DATAPUSH_USERNAME || 
                        process.env.LIFEFILE_WEBHOOK_USERNAME || 
                        'lifefile_webhook'; // Default for development
const WEBHOOK_PASSWORD = process.env.LIFEFILE_DATAPUSH_PASSWORD || 
                        process.env.LIFEFILE_WEBHOOK_PASSWORD ||
                        'test_password'; // Default for development

/**
 * Verify Basic Authentication
 */
function verifyBasicAuth(authHeader: string | null): boolean {
  // For development, temporarily disable auth if no credentials are set
  // In production, you should always require authentication
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  if (!WEBHOOK_USERNAME || !WEBHOOK_PASSWORD) {
    if (isDevelopment) {
      logger.warn('[LIFEFILE DATA PUSH] No authentication configured, accepting request (development mode)');
      return true;
    } else {
      logger.error('[LIFEFILE DATA PUSH] No authentication configured in production');
      return false;
    }
  }

  if (!authHeader) {
    logger.error('[LIFEFILE DATA PUSH] Missing Authorization header');
    return false;
  }

  try {
    // Parse Basic auth header
    const base64Credentials = authHeader.replace(/^Basic\s+/i, '');
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');
    
    // In development, accept test credentials
    if (isDevelopment && username === 'lifefile_webhook' && password === 'test_password') {
      logger.info('[LIFEFILE DATA PUSH] Authentication successful (development test credentials)');
      return true;
    }

    if (username === WEBHOOK_USERNAME && password === WEBHOOK_PASSWORD) {
      logger.info('[LIFEFILE DATA PUSH] Authentication successful');
      return true;
    }

    logger.error(`[LIFEFILE DATA PUSH] Authentication failed`);
    return false;
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[LIFEFILE DATA PUSH] Error parsing auth header:', error);
    return false;
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
    const result = await parser.parseStringPromise(xmlData);
    return result;
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('[LIFEFILE DATA PUSH] XML parsing error:', error);
    throw new Error('Invalid XML format');
  }
}

/**
 * Process Rx Event data
 */
async function processRxEvent(data: any) {
  logger.info('[LIFEFILE DATA PUSH] Processing Rx Event');
  
  // Extract prescription details
  const rxData = data.prescription || data.rx || data;
  
  const orderId = rxData.orderId || rxData.orderid;
  const referenceId = rxData.referenceId || rxData.referenceid;
  const patientId = rxData.patientId || rxData.patientid;
  const providerId = rxData.providerId || rxData.providerid;
  const medicationName = rxData.medicationName || rxData.medicationname || rxData.medication;
  const strength = rxData.strength;
  const form = rxData.form;
  const quantity = rxData.quantity;
  const refills = rxData.refills;
  const sig = rxData.sig || rxData.directions;
  const status = rxData.status;
  const eventType = rxData.eventType || rxData.eventtype || 'rx_event';

  // Log the event details
  logger.info(`[LIFEFILE DATA PUSH] Rx Event - Order: ${orderId}, Status: ${status}, Event: ${eventType}`);

  // Store the event in OrderEvent table
  if (orderId || referenceId) {
    // Find the order
    const order: any = await // @ts-ignore
    prisma.order.findFirst({
      where: {
        OR: [
          { lifefileOrderId: orderId },
          { referenceId: referenceId || '' }
        ]
      }
    });

    if (order) {
      // Create order event
      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          lifefileOrderId: orderId,
          eventType: eventType,
          payload: data,
          note: `Rx Event: ${status}`
        }
      });

      // Update order status if provided
      if (status) {
        await prisma.order.update({
          where: { id: order.id },
          data: { 
            status: status,
            lastWebhookAt: new Date(),
            lastWebhookPayload: JSON.stringify(data)
          }
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
async function processOrderStatus(data: any) {
  logger.info('[LIFEFILE DATA PUSH] Processing Order Status Update');
  
  // Extract order details
  const orderData = data.order || data;
  
  const orderId = orderData.orderId || orderData.orderid || orderData.id;
  const referenceId = orderData.referenceId || orderData.referenceid;
  const status = orderData.status;
  const shippingStatus = orderData.shippingStatus || orderData.shippingstatus;
  const trackingNumber = orderData.trackingNumber || orderData.trackingnumber;
  const trackingUrl = orderData.trackingUrl || orderData.trackingurl;
  const errorMessage = orderData.errorMessage || orderData.errormessage;
  const eventType = orderData.eventType || orderData.eventtype || 'order_status';

  // Log the status update
  logger.info(`[LIFEFILE DATA PUSH] Order Status - Order: ${orderId}, Status: ${status}, Shipping: ${shippingStatus}`);

  // Update the order in database
  if (orderId || referenceId) {
    const order: any = await // @ts-ignore
    prisma.order.findFirst({
      where: {
        OR: [
          { lifefileOrderId: orderId },
          { referenceId: referenceId || '' }
        ]
      }
    });

    if (order) {
      // Update order with new status information
      const updateData: any = {
        lastWebhookAt: new Date(),
        lastWebhookPayload: JSON.stringify(data)
      };
      
      if (status) updateData.status = status;
      if (shippingStatus) updateData.shippingStatus = shippingStatus;
      if (trackingNumber) updateData.trackingNumber = trackingNumber;
      if (trackingUrl) updateData.trackingUrl = trackingUrl;
      if (errorMessage) updateData.errorMessage = errorMessage;

      await prisma.order.update({
        where: { id: order.id },
        data: updateData
      });

      // Create order event for tracking
      await prisma.orderEvent.create({
        data: {
          orderId: order.id,
          lifefileOrderId: orderId,
          eventType: eventType,
          payload: data,
          note: `Status Update: ${status}${shippingStatus ? `, Shipping: ${shippingStatus}` : ''}`
        }
      });

      // ═══════════════════════════════════════════════════════════════
      // NOTIFY ADMINS - Order tracking update from Lifefile
      // ═══════════════════════════════════════════════════════════════
      if (trackingNumber || shippingStatus) {
        try {
          // Get patient info for notification
          const patient = await prisma.patient.findUnique({
            where: { id: order.patientId },
            select: { id: true, firstName: true, lastName: true, clinicId: true },
          });

          if (patient && patient.clinicId) {
            // Decrypt patient PHI for display
            const decryptedFirstName = safeDecrypt(patient.firstName) || 'Patient';
            const decryptedLastName = safeDecrypt(patient.lastName) || '';
            const patientDisplayName = `${decryptedFirstName} ${decryptedLastName}`.trim();

            const statusLabel = trackingNumber 
              ? `Tracking: ${trackingNumber}` 
              : `Status: ${shippingStatus || status}`;

            await notificationService.notifyAdmins({
              clinicId: patient.clinicId,
              category: 'ORDER',
              priority: 'NORMAL',
              title: 'Tracking Update',
              message: `Order for ${patientDisplayName}: ${statusLabel}`,
              actionUrl: `/patients/${patient.id}?tab=prescriptions`,
              metadata: {
                orderId: order.id,
                patientId: patient.id,
                trackingNumber,
                shippingStatus,
                lifefileOrderId: orderId,
              },
              sourceType: 'webhook',
              sourceId: `lifefile-${orderId}-${eventType}`,
            });
          }
        } catch (notifyError) {
          // Non-blocking - log but don't fail webhook
          logger.warn(`[LIFEFILE DATA PUSH] Failed to send admin notification`, {
            error: notifyError instanceof Error ? notifyError.message : 'Unknown error',
          });
        }
      }
    } else {
      logger.warn(`[LIFEFILE DATA PUSH] Order not found: ${orderId || referenceId}`);
    }
  }

  return { processed: true, orderId, status, shippingStatus, trackingNumber };
}

/**
 * Main webhook handler
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
    // Log request details
    logger.info('=' .repeat(60));
    logger.info('[LIFEFILE DATA PUSH] New webhook request received');
    logger.info(`[LIFEFILE DATA PUSH] Time: ${new Date().toISOString()}`);
    
    // Extract headers
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = key.toLowerCase().includes('auth') || key.toLowerCase().includes('secret') 
        ? '[REDACTED]' 
        : value;
    });
    webhookLogData.headers = headers;
    webhookLogData.ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    webhookLogData.userAgent = req.headers.get('user-agent') || 'unknown';
    
    // Log headers
    logger.debug('[LIFEFILE DATA PUSH] Headers:', { value: headers });

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

    // Get content type
    const contentType = req.headers.get('content-type') || '';
    logger.info(`[LIFEFILE DATA PUSH] Content-Type: ${contentType}`);

    // Parse request body
    let payload: any;
    const rawBody = await req.text();
    
    if (!rawBody) {
      throw new Error('Empty request body');
    }

    // Parse based on content type
    if (contentType.includes('xml')) {
      logger.info('[LIFEFILE DATA PUSH] Parsing XML payload');
      payload = await parseXmlPayload(rawBody);
    } else {
      // Default to JSON
      logger.info('[LIFEFILE DATA PUSH] Parsing JSON payload');
      try {
        payload = JSON.parse(rawBody);
      } catch (error: any) {
    // @ts-ignore
   
        logger.error('[LIFEFILE DATA PUSH] JSON parsing error:', error);
        throw new Error('Invalid JSON format');
      }
    }

    webhookLogData.payload = payload;
    
    // Log payload summary
    logger.info('[LIFEFILE DATA PUSH] Payload received:', {
      keys: Object.keys(payload),
      type: payload.type || payload.eventType || 'unknown'
    });

    // Determine event type and process accordingly
    let result: any;
    const eventType = payload.type || payload.eventType || payload.eventtype || '';
    
    if (eventType.toLowerCase().includes('rx') || payload.rx || payload.prescription) {
      // Process Rx Event
      result = await processRxEvent(payload);
    } else if (eventType.toLowerCase().includes('order') || payload.order || payload.status) {
      // Process Order Status Update
      result = await processOrderStatus(payload);
    } else {
      // Unknown event type - log for investigation
      logger.warn('[LIFEFILE DATA PUSH] Unknown event type:', { value: eventType });
      result = { processed: false, reason: 'Unknown event type' };
    }

    // Calculate processing time
    const processingTime = Date.now() - startTime;
    
    // Log success
    webhookLogData.status = WebhookStatus.SUCCESS;
    webhookLogData.statusCode = 200;
    webhookLogData.responseData = result;
    webhookLogData.processingTimeMs = processingTime;
    
    await prisma.webhookLog.create({ data: webhookLogData });
    
    logger.info(`[LIFEFILE DATA PUSH] Processing completed in ${processingTime}ms`);
    logger.info('=' .repeat(60));

    // Return success response
    return NextResponse.json(
      { 
        success: true,
        message: 'Data push processed successfully',
        result,
        processingTimeMs: processingTime
      },
      { status: 200 }
    );

  } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error('[LIFEFILE DATA PUSH] Error processing webhook:', error);
    
    // Log error
    webhookLogData.status = WebhookStatus.ERROR;
    webhookLogData.statusCode = 500;
    webhookLogData.errorMessage = errorMessage;
    webhookLogData.processingTimeMs = Date.now() - startTime;
    
    await prisma.webhookLog.create({ data: webhookLogData }).catch((dbError: any) => {
      logger.error('[LIFEFILE DATA PUSH] Failed to log webhook error:', { value: dbError });
    });

    // Return error response
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: errorMessage
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for testing/verification
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    endpoint: 'Lifefile Data Push Webhook',
    status: 'active',
    version: '1.0.0',
    authentication: 'Basic Auth',
    accepts: ['application/json', 'application/xml', 'text/xml'],
    events: ['rx_events', 'order_status'],
    configured: {
      hasAuth: !!(WEBHOOK_USERNAME && WEBHOOK_PASSWORD)
    }
  });
}
