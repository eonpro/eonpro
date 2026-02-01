/**
 * Zoom Webhook Handler
 * 
 * Receives and processes Zoom webhook events for telehealth sessions.
 * Events: meeting.started, meeting.ended, participant_joined, etc.
 * 
 * @see https://marketplace.zoom.us/docs/api-reference/webhook-reference/
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { zoomConfig, ZOOM_WEBHOOK_EVENTS } from '@/lib/integrations/zoom/config';
import { 
  handleZoomWebhook, 
  verifyWebhookSignature,
  WebhookPayload 
} from '@/lib/integrations/zoom/telehealthService';
import crypto from 'crypto';

/**
 * POST /api/v2/zoom/webhook
 * Handle incoming Zoom webhooks
 */
export async function POST(req: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await req.text();
    let payload: any;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      logger.warn('Zoom webhook: Invalid JSON payload');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Handle Zoom URL Validation (endpoint verification)
    // Zoom sends this when you first configure the webhook
    if (payload.event === 'endpoint.url_validation') {
      const plainToken = payload.payload?.plainToken;
      if (plainToken && zoomConfig.webhookSecret) {
        const encryptedToken = crypto
          .createHmac('sha256', zoomConfig.webhookSecret)
          .update(plainToken)
          .digest('hex');

        logger.info('Zoom webhook: URL validation request', { plainToken });
        
        return NextResponse.json({
          plainToken,
          encryptedToken,
        });
      }
      return NextResponse.json({ error: 'Missing plainToken or secret' }, { status: 400 });
    }

    // Verify webhook signature for security
    if (zoomConfig.webhookSecret) {
      const timestamp = req.headers.get('x-zm-request-timestamp');
      const signature = req.headers.get('x-zm-signature');

      if (!timestamp || !signature) {
        logger.warn('Zoom webhook: Missing signature headers');
        return NextResponse.json({ error: 'Missing signature headers' }, { status: 401 });
      }

      const isValid = verifyWebhookSignature(
        rawBody,
        timestamp,
        signature,
        zoomConfig.webhookSecret
      );

      if (!isValid) {
        logger.warn('Zoom webhook: Invalid signature', {
          event: payload.event,
          timestamp,
        });
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      logger.warn('Zoom webhook: No webhook secret configured, skipping signature verification');
    }

    // Log the event
    logger.info('Zoom webhook received', {
      event: payload.event,
      accountId: payload.payload?.account_id,
      meetingId: payload.payload?.object?.id,
    });

    // Process the webhook asynchronously (don't block response)
    // In production, you might want to use a job queue here
    setImmediate(async () => {
      try {
        await handleZoomWebhook(payload as WebhookPayload);
      } catch (error) {
        logger.error('Zoom webhook processing error', {
          event: payload.event,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Return success immediately (Zoom expects quick response)
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Zoom webhook handler error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/v2/zoom/webhook
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'zoom-webhook',
    configured: !!zoomConfig.webhookSecret,
    supportedEvents: Object.values(ZOOM_WEBHOOK_EVENTS),
    timestamp: new Date().toISOString(),
  });
}
