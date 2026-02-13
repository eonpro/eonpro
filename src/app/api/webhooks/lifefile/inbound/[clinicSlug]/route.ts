import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decrypt } from '@/lib/security/encryption';
import { notificationService } from '@/services/notification';
import { WebhookStatus } from '@prisma/client';
import { decryptPHI } from '@/lib/security/phi-encryption';
import crypto from 'crypto';
import {
  extractLifefileOrderIdentifiers,
  buildOrderLookupWhere,
  mapToShippingStatusEnum,
  sanitizeEventType,
  MAX_WEBHOOK_BODY_BYTES,
} from '@/lib/webhooks/lifefile-payload';

type RouteParams = { params: Promise<{ clinicSlug: string }> };

/**
 * Safely decrypt a PHI field, returning original value if decryption fails
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
 * Safely decrypt an encrypted field
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
 * Verify Basic Authentication against clinic credentials
 */
function verifyBasicAuth(
  authHeader: string | null,
  expectedUsername: string | null,
  expectedPassword: string | null
): boolean {
  if (!expectedUsername || !expectedPassword) {
    logger.warn('[LIFEFILE INBOUND] No credentials configured for clinic');
    return false;
  }

  if (!authHeader) {
    logger.warn('[LIFEFILE INBOUND] Missing Authorization header');
    return false;
  }

  try {
    const base64Credentials = authHeader.replace(/^Basic\s+/i, '');
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    const providedUser = username || '';
    const providedPass = password || '';

    // First check lengths match (timingSafeEqual requires same length)
    if (providedUser.length !== expectedUsername.length) {
      logger.debug('[LIFEFILE INBOUND] Username length mismatch', {
        provided: providedUser.length,
        expected: expectedUsername.length,
      });
      return false;
    }

    if (providedPass.length !== expectedPassword.length) {
      logger.debug('[LIFEFILE INBOUND] Password length mismatch', {
        provided: providedPass.length,
        expected: expectedPassword.length,
      });
      return false;
    }

    // Constant-time comparison to prevent timing attacks
    const usernameMatch = crypto.timingSafeEqual(
      Buffer.from(providedUser),
      Buffer.from(expectedUsername)
    );
    const passwordMatch = crypto.timingSafeEqual(
      Buffer.from(providedPass),
      Buffer.from(expectedPassword)
    );

    if (!usernameMatch || !passwordMatch) {
      logger.debug('[LIFEFILE INBOUND] Credential mismatch');
    }

    return usernameMatch && passwordMatch;
  } catch (error: unknown) {
    logger.error('[LIFEFILE INBOUND] Error parsing auth header:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Verify HMAC signature
 */
function verifyHmacSignature(
  body: string,
  signature: string | null,
  secret: string | null
): boolean {
  if (!secret) {
    // HMAC verification is optional - return true if no secret configured
    return true;
  }

  if (!signature) {
    logger.warn('[LIFEFILE INBOUND] Missing webhook signature header');
    return false;
  }

  try {
    // Parse signature header (e.g., "sha256=abc123" or just "abc123")
    const providedSig = signature.replace(/^sha256=/, '');

    const expectedSig = crypto.createHmac('sha256', secret).update(body).digest('hex');

    // Constant-time comparison
    return crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig));
  } catch (error: unknown) {
    logger.error('[LIFEFILE INBOUND] Error verifying signature:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Check if IP is in allowed list
 */
function isIpAllowed(clientIp: string | null, allowedIPs: string | null): boolean {
  if (!allowedIPs || allowedIPs.trim() === '') {
    // No IP restriction - allow all
    return true;
  }

  if (!clientIp) {
    logger.warn('[LIFEFILE INBOUND] Could not determine client IP');
    return false;
  }

  const allowedList = allowedIPs.split(',').map((ip) => ip.trim());
  return allowedList.includes(clientIp);
}

/**
 * Process shipping update event
 */
async function processShippingUpdate(
  clinicId: number,
  payload: any
): Promise<{ processed: boolean; details: any }> {
  logger.info('[LIFEFILE INBOUND] Processing shipping update');

  const { orderId: orderIdFromPayload, referenceId: referenceIdFromPayload } =
    extractLifefileOrderIdentifiers(payload);
  const trackingNumber = payload.trackingNumber ?? payload.tracking_number;
  const lifefileOrderId = orderIdFromPayload;
  const deliveryService = payload.deliveryService ?? payload.carrier;
  const status = payload.status;
  const estimatedDelivery = payload.estimatedDelivery;
  const trackingUrl = payload.trackingUrl ?? payload.tracking_url;
  const medication = payload.medication;
  const brand = payload.brand;
  const shippedAt = payload.shippedAt;
  const deliveredAt = payload.deliveredAt;

  const where = buildOrderLookupWhere(clinicId, orderIdFromPayload, referenceIdFromPayload);
  if (!where) {
    logger.warn('[LIFEFILE INBOUND] Shipping update: no orderId or referenceId', {
      clinicId,
      payloadKeys: Object.keys(payload),
    });
    return { processed: false, details: { reason: 'Missing orderId or referenceId' } };
  }

  // Find the order by LifeFile order ID or reference ID
  const order = await prisma.order.findFirst({
    where,
    include: {
      patient: {
        select: { id: true, firstName: true, lastName: true, email: true, clinicId: true },
      },
    },
  });

  if (!order) {
    logger.warn('[LIFEFILE INBOUND] Order not found for shipping update', {
      clinicId,
      lifefileOrderId,
    });
    return { processed: false, details: { reason: 'Order not found' } };
  }

  // Update order with tracking info
  await prisma.order.update({
    where: { id: order.id },
    data: {
      trackingNumber: trackingNumber || order.trackingNumber,
      trackingUrl: trackingUrl || order.trackingUrl,
      shippingStatus: status || order.shippingStatus,
      lastWebhookAt: new Date(),
      lastWebhookPayload: JSON.stringify(payload),
    },
  });

  // Create shipping update record (clinicId and carrier required; status must be enum)
  if (order.clinicId != null && trackingNumber) {
    try {
      await prisma.patientShippingUpdate.create({
        data: {
          clinicId: order.clinicId,
          patientId: order.patientId,
          orderId: order.id,
          trackingNumber,
          carrier: deliveryService && String(deliveryService).trim() ? String(deliveryService) : 'Unknown',
          status: mapToShippingStatusEnum(status),
          estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
          trackingUrl: trackingUrl || null,
          rawPayload: payload as object,
          shippedAt: shippedAt ? new Date(shippedAt) : null,
          actualDelivery: deliveredAt ? new Date(deliveredAt) : null,
          lifefileOrderId: lifefileOrderId || null,
        },
      });
    } catch (createErr: unknown) {
      logger.warn('[LIFEFILE INBOUND] Failed to create PatientShippingUpdate (order still updated)', {
        orderId: order.id,
        error: createErr instanceof Error ? createErr.message : String(createErr),
      });
    }
  }

  // Create order event for tracking
  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      lifefileOrderId: lifefileOrderId,
      eventType: 'shipping_update',
      payload: payload,
      note: `Shipping Update: ${status || 'received'}${trackingNumber ? `, Tracking: ${trackingNumber}` : ''}`,
    },
  });

  // Notify admins
  if (order.patient?.clinicId) {
    const patientName =
      `${safeDecryptPHI(order.patient.firstName) || 'Patient'} ${safeDecryptPHI(order.patient.lastName) || ''}`.trim();

    await notificationService
      .notifyAdmins({
        clinicId: order.patient.clinicId,
        category: 'SHIPMENT',
        priority: 'NORMAL',
        title: 'Shipping Update',
        message: `${patientName}: ${status || 'Update received'}${trackingNumber ? ` - Tracking: ${trackingNumber}` : ''}`,
        actionUrl: `/patients/${order.patientId}?tab=prescriptions`,
        metadata: {
          orderId: order.id,
          patientId: order.patientId,
          trackingNumber,
          status,
          carrier: deliveryService,
        },
        sourceType: 'webhook',
        sourceId: `lifefile-shipping-${lifefileOrderId}`,
      })
      .catch((err) => {
        logger.warn('[LIFEFILE INBOUND] Failed to send notification', { error: err.message });
      });
  }

  return {
    processed: true,
    details: { orderId: order.id, trackingNumber, status },
  };
}

/**
 * Process prescription status event
 */
async function processPrescriptionStatus(
  clinicId: number,
  payload: any
): Promise<{ processed: boolean; details: any }> {
  logger.info('[LIFEFILE INBOUND] Processing prescription status');

  const { orderId: lifefileOrderId, referenceId } = extractLifefileOrderIdentifiers(payload);
  const status = payload.status;
  const trackingNumber = payload.trackingNumber ?? payload.tracking_number;
  const trackingUrl = payload.trackingUrl ?? payload.tracking_url;
  const errorMessage = payload.errorMessage ?? payload.error_message;
  const rejectionReason = payload.rejectionReason ?? payload.rejection_reason;

  const where = buildOrderLookupWhere(clinicId, lifefileOrderId, referenceId);
  if (!where) {
    logger.warn('[LIFEFILE INBOUND] Prescription status: no orderId or referenceId', {
      clinicId,
      payloadKeys: Object.keys(payload),
    });
    return { processed: false, details: { reason: 'Missing orderId or referenceId' } };
  }

  // Find the order
  const order = await prisma.order.findFirst({
    where,
    include: {
      patient: {
        select: { id: true, firstName: true, lastName: true, clinicId: true },
      },
    },
  });

  if (!order) {
    logger.warn('[LIFEFILE INBOUND] Order not found for prescription status', {
      clinicId,
      lifefileOrderId,
      referenceId,
    });
    return { processed: false, details: { reason: 'Order not found' } };
  }

  // Update order
  const updateData: any = {
    lastWebhookAt: new Date(),
    lastWebhookPayload: JSON.stringify(payload),
  };

  if (status) updateData.status = status;
  if (trackingNumber) updateData.trackingNumber = trackingNumber;
  if (trackingUrl) updateData.trackingUrl = trackingUrl;
  if (errorMessage) updateData.errorMessage = errorMessage;

  await prisma.order.update({
    where: { id: order.id },
    data: updateData,
  });

  // Create order event (sanitized note length)
  const prescriptionNote = `Prescription Status: ${status ?? ''}${rejectionReason ? ` - ${String(rejectionReason).slice(0, 100)}` : ''}`;
  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      lifefileOrderId: lifefileOrderId ?? undefined,
      eventType: 'prescription_status',
      payload: payload as object,
      note: prescriptionNote.slice(0, 500),
    },
  });

  // Notify admins for important status changes
  const notifiableStatuses = ['approved', 'rejected', 'shipped', 'delivered', 'error', 'failed'];
  if (notifiableStatuses.includes(status?.toLowerCase()) && order.patient?.clinicId) {
    const patientName =
      `${safeDecryptPHI(order.patient.firstName) || 'Patient'} ${safeDecryptPHI(order.patient.lastName) || ''}`.trim();

    const priority = ['rejected', 'error', 'failed'].includes(status?.toLowerCase())
      ? 'HIGH'
      : 'NORMAL';

    await notificationService
      .notifyAdmins({
        clinicId: order.patient.clinicId,
        category: 'PRESCRIPTION',
        priority: priority as any,
        title: `Prescription ${status}`,
        message: `${patientName}: Prescription ${status}${rejectionReason ? ` - ${rejectionReason}` : ''}`,
        actionUrl: `/patients/${order.patientId}?tab=prescriptions`,
        metadata: {
          orderId: order.id,
          patientId: order.patientId,
          status,
          rejectionReason,
        },
        sourceType: 'webhook',
        sourceId: `lifefile-rx-${lifefileOrderId}-${status}`,
      })
      .catch((err) => {
        logger.warn('[LIFEFILE INBOUND] Failed to send notification', { error: err.message });
      });
  }

  return {
    processed: true,
    details: { orderId: order.id, status },
  };
}

/**
 * Process order status event
 */
async function processOrderStatus(
  clinicId: number,
  payload: any
): Promise<{ processed: boolean; details: any }> {
  logger.info('[LIFEFILE INBOUND] Processing order status');

  // Support both top-level and payload.order.*
  const orderData = payload.order || payload;
  const { orderId: lifefileOrderId, referenceId } = extractLifefileOrderIdentifiers(payload);
  const status = orderData.status;
  const shippingStatus = orderData.shippingStatus ?? orderData.shipping_status;
  const trackingNumber = orderData.trackingNumber ?? orderData.tracking_number;
  const trackingUrl = orderData.trackingUrl ?? orderData.tracking_url;
  const errorMessage = orderData.errorMessage ?? orderData.error_message;
  const estimatedDelivery = orderData.estimatedDelivery;

  const where = buildOrderLookupWhere(clinicId, lifefileOrderId, referenceId);
  if (!where) {
    logger.warn('[LIFEFILE INBOUND] Order status: no orderId or referenceId', {
      clinicId,
      payloadKeys: Object.keys(payload),
    });
    return { processed: false, details: { reason: 'Missing orderId or referenceId' } };
  }

  // Find the order
  const order = await prisma.order.findFirst({
    where,
    include: {
      patient: {
        select: { id: true, firstName: true, lastName: true, clinicId: true },
      },
    },
  });

  if (!order) {
    logger.warn('[LIFEFILE INBOUND] Order not found for order status', {
      clinicId,
      lifefileOrderId,
      referenceId,
    });
    return { processed: false, details: { reason: 'Order not found' } };
  }

  // Update order
  const updateData: any = {
    lastWebhookAt: new Date(),
    lastWebhookPayload: JSON.stringify(payload),
  };

  if (status) updateData.status = status;
  if (shippingStatus) updateData.shippingStatus = shippingStatus;
  if (trackingNumber) updateData.trackingNumber = trackingNumber;
  if (trackingUrl) updateData.trackingUrl = trackingUrl;
  if (errorMessage) updateData.errorMessage = errorMessage;

  await prisma.order.update({
    where: { id: order.id },
    data: updateData,
  });

  // Create order event (sanitized eventType and note length)
  const orderEventNote = `Order Status: ${status || shippingStatus}${trackingNumber ? `, Tracking: ${String(trackingNumber).slice(0, 80)}` : ''}`;
  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      lifefileOrderId: lifefileOrderId ?? undefined,
      eventType: sanitizeEventType(payload.eventType || 'order_status'),
      payload: payload as object,
      note: orderEventNote.slice(0, 500),
    },
  });

  // Notify admins
  if (order.patient?.clinicId && (trackingNumber || shippingStatus)) {
    const patientName =
      `${safeDecryptPHI(order.patient.firstName) || 'Patient'} ${safeDecryptPHI(order.patient.lastName) || ''}`.trim();

    await notificationService
      .notifyAdmins({
        clinicId: order.patient.clinicId,
        category: 'ORDER',
        priority: 'NORMAL',
        title: 'Order Update',
        message: `${patientName}: ${status || shippingStatus}${trackingNumber ? ` - ${trackingNumber}` : ''}`,
        actionUrl: `/patients/${order.patientId}?tab=prescriptions`,
        metadata: {
          orderId: order.id,
          patientId: order.patientId,
          status,
          shippingStatus,
          trackingNumber,
        },
        sourceType: 'webhook',
        sourceId: `lifefile-order-${lifefileOrderId}-${status || shippingStatus}`,
      })
      .catch((err) => {
        logger.warn('[LIFEFILE INBOUND] Failed to send notification', { error: err.message });
      });
  }

  return {
    processed: true,
    details: { orderId: order.id, status, shippingStatus, trackingNumber },
  };
}

/**
 * Process Rx event
 */
async function processRxEvent(
  clinicId: number,
  payload: any
): Promise<{ processed: boolean; details: any }> {
  logger.info('[LIFEFILE INBOUND] Processing Rx event');

  const { orderId: lifefileOrderId, referenceId } = extractLifefileOrderIdentifiers(payload);
  const rxData = payload.prescription || payload.rx || payload;
  const status = rxData?.status;
  const eventType = rxData?.eventType ?? rxData?.event_type;

  const where = buildOrderLookupWhere(clinicId, lifefileOrderId, referenceId);
  if (!where) {
    logger.warn('[LIFEFILE INBOUND] Rx event: no orderId or referenceId', {
      clinicId,
      payloadKeys: Object.keys(payload),
    });
    return { processed: false, details: { reason: 'Missing orderId or referenceId' } };
  }

  // Find the order
  const order = await prisma.order.findFirst({
    where,
  });

  if (!order) {
    logger.warn('[LIFEFILE INBOUND] Order not found for Rx event', {
      clinicId,
      lifefileOrderId,
      referenceId,
    });
    return { processed: false, details: { reason: 'Order not found' } };
  }

  // Update order status if provided
  if (status) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status,
        lastWebhookAt: new Date(),
        lastWebhookPayload: JSON.stringify(payload),
      },
    });
  }

  // Create order event (sanitized eventType)
  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      lifefileOrderId: lifefileOrderId ?? undefined,
      eventType: sanitizeEventType(eventType || 'rx_event'),
      payload: payload as object,
      note: `Rx Event: ${String(status || eventType || 'received').slice(0, 200)}`,
    },
  });

  return {
    processed: true,
    details: { orderId: order.id, status, eventType },
  };
}

/**
 * Main webhook handler
 */
export async function POST(req: NextRequest, context: RouteParams) {
  const startTime = Date.now();
  const { clinicSlug } = await context.params;

  // Initialize webhook log data
  let webhookLogData: any = {
    endpoint: `/api/webhooks/lifefile/inbound/${clinicSlug}`,
    method: 'POST',
    status: WebhookStatus.ERROR,
    statusCode: 500,
    source: 'lifefile',
    ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
  };

  try {
    logger.info('='.repeat(60));
    logger.info(`[LIFEFILE INBOUND] Webhook received for clinic: ${clinicSlug}`);
    logger.info(`[LIFEFILE INBOUND] Time: ${new Date().toISOString()}`);

    // Extract headers (redact sensitive ones)
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] =
        key.toLowerCase().includes('auth') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('signature')
          ? '[REDACTED]'
          : value;
    });
    webhookLogData.headers = headers;

    // Find clinic by inbound path
    const clinic = await prisma.clinic.findFirst({
      where: {
        lifefileInboundPath: clinicSlug,
        lifefileInboundEnabled: true,
      },
      select: {
        id: true,
        name: true,
        lifefileInboundUsername: true,
        lifefileInboundPassword: true,
        lifefileInboundSecret: true,
        lifefileInboundAllowedIPs: true,
        lifefileInboundEvents: true,
      },
    });

    if (!clinic) {
      logger.warn(`[LIFEFILE INBOUND] Clinic not found or webhook disabled: ${clinicSlug}`);
      webhookLogData.status = WebhookStatus.INVALID_AUTH;
      webhookLogData.statusCode = 404;
      webhookLogData.errorMessage = 'Webhook endpoint not found or disabled';

      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile Inbound] Failed to persist webhook log for unknown clinic', { error: err instanceof Error ? err.message : String(err) });
      });

      return NextResponse.json({ error: 'Webhook endpoint not found' }, { status: 404 });
    }

    webhookLogData.clinicId = clinic.id;

    // Decrypt credentials
    const username = safeDecrypt(clinic.lifefileInboundUsername);
    const password = safeDecrypt(clinic.lifefileInboundPassword);
    const secret = safeDecrypt(clinic.lifefileInboundSecret);

    // Log decryption results (without sensitive values)
    logger.debug('[LIFEFILE INBOUND] Credential decryption status', {
      clinicId: clinic.id,
      hasUsername: !!username,
      usernameLength: username?.length || 0,
      usernameIsEncrypted: username === clinic.lifefileInboundUsername,
      hasPassword: !!password,
      passwordLength: password?.length || 0,
      passwordIsEncrypted: password === clinic.lifefileInboundPassword,
    });

    // Verify IP allowlist
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null;
    if (!isIpAllowed(clientIp, clinic.lifefileInboundAllowedIPs)) {
      logger.warn(`[LIFEFILE INBOUND] IP not allowed: ${clientIp}`);
      webhookLogData.status = WebhookStatus.INVALID_AUTH;
      webhookLogData.statusCode = 403;
      webhookLogData.errorMessage = `IP ${clientIp} not in allowed list`;

      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile Inbound] Failed to persist webhook log for IP rejection', { error: err instanceof Error ? err.message : String(err) });
      });

      return NextResponse.json({ error: 'IP not allowed' }, { status: 403 });
    }

    // Verify Basic Auth
    const authHeader = req.headers.get('authorization');
    if (!verifyBasicAuth(authHeader, username, password)) {
      logger.warn('[LIFEFILE INBOUND] Authentication failed');
      webhookLogData.status = WebhookStatus.INVALID_AUTH;
      webhookLogData.statusCode = 401;
      webhookLogData.errorMessage = 'Authentication failed';

      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile Inbound] Failed to persist webhook log for auth failure', { error: err instanceof Error ? err.message : String(err) });
      });

      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get raw body for signature verification (with size limit)
    const rawBody = await req.text();
    if (!rawBody) {
      webhookLogData.errorMessage = 'Empty request body';
      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile Inbound] Failed to persist webhook log for empty body', { error: err instanceof Error ? err.message : String(err) });
      });
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }
    if (rawBody.length > MAX_WEBHOOK_BODY_BYTES) {
      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 413;
      webhookLogData.errorMessage = 'Payload too large';
      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile Inbound] Failed to persist webhook log for oversized payload', { error: err instanceof Error ? err.message : String(err) });
      });
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    // Verify HMAC signature if secret is configured
    const signature =
      req.headers.get('x-webhook-signature') ||
      req.headers.get('x-lifefile-signature') ||
      req.headers.get('x-signature');
    if (!verifyHmacSignature(rawBody, signature, secret)) {
      logger.warn('[LIFEFILE INBOUND] Signature verification failed');
      webhookLogData.status = WebhookStatus.INVALID_SIGNATURE;
      webhookLogData.statusCode = 401;
      webhookLogData.errorMessage = 'Invalid webhook signature';

      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile Inbound] Failed to persist webhook log for invalid signature', { error: err instanceof Error ? err.message : String(err) });
      });

      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse payload (must be non-null object; no array or primitive)
    const { safeParseJsonString } = await import('@/lib/utils/safe-json');
    const parsed = safeParseJsonString<unknown>(rawBody);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      webhookLogData.status = WebhookStatus.INVALID_PAYLOAD;
      webhookLogData.statusCode = 400;
      webhookLogData.errorMessage = 'Invalid JSON or payload must be an object';
      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile Inbound] Failed to persist webhook log for invalid payload', { error: err instanceof Error ? err.message : String(err) });
      });
      return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
    }
    const payload = parsed as Record<string, unknown>;

    webhookLogData.payload = payload;

    // Determine event type
    const eventType = (
      payload.type ||
      payload.eventType ||
      payload.event_type ||
      'unknown'
    ).toLowerCase();

    // Handle test events from admin panel FIRST (bypass event type check)
    if (eventType === 'test' || payload.testMode === true) {
      logger.info('[LIFEFILE INBOUND] Test webhook received', {
        clinicId: clinic.id,
        testId: payload.testId,
      });

      // Log the test event
      webhookLogData.status = WebhookStatus.SUCCESS;
      webhookLogData.statusCode = 200;
      webhookLogData.responseData = { test: true, testId: payload.testId };
      webhookLogData.processingTimeMs = Date.now() - startTime;

      await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
        logger.warn('[LifeFile Inbound] Failed to persist webhook log for test event', { error: err instanceof Error ? err.message : String(err) });
      });

      return NextResponse.json({
        success: true,
        message: 'Test webhook received successfully',
        testId: payload.testId,
        timestamp: new Date().toISOString(),
        clinic: {
          id: clinic.id,
          path: clinicSlug,
        },
      });
    }

    // Check if event type is allowed (for non-test events)
    const allowedEvents = clinic.lifefileInboundEvents || [];
    if (allowedEvents.length > 0) {
      const isEventAllowed = allowedEvents.some((allowed) =>
        eventType.includes(allowed.toLowerCase())
      );
      if (!isEventAllowed) {
        logger.warn(`[LIFEFILE INBOUND] Event type not allowed: ${eventType}`);
        webhookLogData.status = WebhookStatus.ERROR;
        webhookLogData.statusCode = 400;
        webhookLogData.errorMessage = `Event type '${eventType}' not allowed`;

        await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
          logger.warn('[LifeFile Inbound] Failed to persist webhook log for disallowed event', { error: err instanceof Error ? err.message : String(err) });
        });

        return NextResponse.json(
          { error: `Event type '${eventType}' not configured for this clinic` },
          { status: 400 }
        );
      }
    }

    // Route to appropriate handler
    let result: { processed: boolean; details: any };

    if (eventType.includes('shipping') || payload.trackingNumber || payload.deliveryService) {
      result = await processShippingUpdate(clinic.id, payload);
    } else if (eventType.includes('prescription') || eventType.includes('rx_status')) {
      result = await processPrescriptionStatus(clinic.id, payload);
    } else if (eventType.includes('order')) {
      result = await processOrderStatus(clinic.id, payload);
    } else if (eventType.includes('rx') || payload.rx || payload.prescription) {
      result = await processRxEvent(clinic.id, payload);
    } else {
      // Try to determine from payload structure
      if (payload.trackingNumber) {
        result = await processShippingUpdate(clinic.id, payload);
      } else if (payload.order) {
        result = await processOrderStatus(clinic.id, payload);
      } else {
        // Unknown event type - still log it
        logger.warn(`[LIFEFILE INBOUND] Unknown event type: ${eventType}`, {
          payloadKeys: Object.keys(payload),
        });
        result = { processed: false, details: { reason: 'Unknown event type' } };
      }
    }

    // Calculate processing time
    const processingTimeMs = Date.now() - startTime;

    // Log success
    webhookLogData.status = result.processed ? WebhookStatus.SUCCESS : WebhookStatus.ERROR;
    webhookLogData.statusCode = 200;
    webhookLogData.responseData = result;
    webhookLogData.processingTimeMs = processingTimeMs;

    await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
      logger.error('[LIFEFILE INBOUND] Failed to create webhook log', { error: err.message });
    });

    logger.info(`[LIFEFILE INBOUND] Processing completed in ${processingTimeMs}ms`);
    logger.info('='.repeat(60));

    return NextResponse.json(
      {
        success: true,
        eventId: `lf-${clinic.id}-${Date.now()}`,
        processed: result.processed,
        processedAt: new Date().toISOString(),
        details: result.details,
        processingTimeMs,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('[LIFEFILE INBOUND] Error processing webhook:', { error: errorMessage });

    webhookLogData.status = WebhookStatus.ERROR;
    webhookLogData.statusCode = 500;
    webhookLogData.errorMessage = errorMessage;
    webhookLogData.processingTimeMs = Date.now() - startTime;

    await prisma.webhookLog.create({ data: webhookLogData }).catch((err) => {
      logger.warn('[LifeFile Inbound] Failed to persist webhook log for processing error', { error: err instanceof Error ? err.message : String(err) });
    });

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
 * GET endpoint for testing/verification
 */
export async function GET(req: NextRequest, context: RouteParams) {
  const { clinicSlug } = await context.params;

  // Find clinic (don't expose sensitive info)
  const clinic = await prisma.clinic.findFirst({
    where: {
      lifefileInboundPath: clinicSlug,
    },
    select: {
      id: true,
      name: true,
      lifefileInboundEnabled: true,
      lifefileInboundEvents: true,
    },
  });

  if (!clinic) {
    return NextResponse.json({ error: 'Webhook endpoint not found' }, { status: 404 });
  }

  return NextResponse.json({
    endpoint: `LifeFile Inbound Webhook - ${clinic.name}`,
    path: `/api/webhooks/lifefile/inbound/${clinicSlug}`,
    status: clinic.lifefileInboundEnabled ? 'active' : 'disabled',
    version: '1.0.0',
    authentication: 'Basic Auth',
    signatureVerification: 'HMAC-SHA256 (optional)',
    accepts: ['application/json'],
    supportedEvents: clinic.lifefileInboundEvents?.length
      ? clinic.lifefileInboundEvents
      : ['shipping', 'prescription', 'order', 'rx'],
    timestamp: new Date().toISOString(),
  });
}
