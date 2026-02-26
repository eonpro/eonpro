/**
 * Twilio Conversations (Chat) Webhook Handler
 *
 * Handles events from Twilio Conversations service:
 * - onMessageAdded: New message in a conversation
 * - onConversationAdded: New conversation created
 * - onParticipantAdded: User joined a conversation
 * - onConversationStateUpdated: Conversation state changed
 *
 * Configure this webhook URL in Twilio Console:
 * Conversations > Services > eonpro > Webhooks
 * Post-Event URL: https://your-domain.com/api/v2/twilio/chat/webhook
 * Method: HTTP POST
 */

import { NextRequest, NextResponse } from 'next/server';
import { isFeatureEnabled } from '@/lib/features';
import { basePrisma as prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notificationService } from '@/services/notification/notificationService';
import crypto from 'crypto';

// Twilio Conversations webhook event types
type ConversationEventType =
  | 'onMessageAdded'
  | 'onMessageUpdated'
  | 'onMessageRemoved'
  | 'onConversationAdded'
  | 'onConversationUpdated'
  | 'onConversationRemoved'
  | 'onConversationStateUpdated'
  | 'onParticipantAdded'
  | 'onParticipantUpdated'
  | 'onParticipantRemoved'
  | 'onUserAdded'
  | 'onUserUpdated';

interface ConversationWebhookPayload {
  EventType: ConversationEventType;
  AccountSid: string;
  ChatServiceSid: string;
  ConversationSid?: string;
  MessageSid?: string;
  ParticipantSid?: string;
  Body?: string;
  Author?: string;
  Attributes?: string;
  DateCreated?: string;
  Index?: string;
  Identity?: string;
  MessagingBinding?: string;
}

/**
 * Validate Twilio webhook signature
 */
function validateWebhookSignature(
  authToken: string,
  signature: string,
  url: string,
  body: string
): boolean {
  // Skip validation in development
  if (process.env.NODE_ENV === 'development' || process.env.TWILIO_USE_MOCK === 'true') {
    return true;
  }

  try {
    // Twilio signs with HMAC-SHA1 of URL + body
    const hmac = crypto.createHmac('sha1', authToken);
    hmac.update(url + body);
    const expectedSignature = hmac.digest('base64');

    return signature === expectedSignature;
  } catch (error) {
    logger.error('[CHAT_WEBHOOK] Signature validation error', { error });
    return false;
  }
}

/**
 * Handle new message event
 */
async function handleMessageAdded(payload: ConversationWebhookPayload): Promise<void> {
  const { ConversationSid, MessageSid, Body, Author, Attributes, DateCreated, Index } = payload;

  logger.info('[CHAT_WEBHOOK] New message', {
    conversationSid: ConversationSid,
    messageSid: MessageSid,
    author: Author,
    bodyLength: Body?.length,
  });

  // Try to parse attributes for patient/clinic context
  let attributes: Record<string, any> = {};
  if (Attributes) {
    try {
      attributes = JSON.parse(Attributes);
    } catch {
      // Ignore parse errors
    }
  }

  // Extract patient ID from author identity (format: "patient-123" or "provider-456")
  let patientId: number | null = null;
  let senderType: 'PATIENT' | 'PROVIDER' | 'STAFF' | 'SYSTEM' = 'SYSTEM';

  if (Author) {
    const patientMatch = Author.match(/^patient-(\d+)$/);
    const providerMatch = Author.match(/^provider-(\d+)$/);

    if (patientMatch) {
      patientId = parseInt(patientMatch[1], 10);
      senderType = 'PATIENT';
    } else if (providerMatch) {
      senderType = 'PROVIDER';
      // Try to find patient from conversation attributes
      patientId = attributes.patientId || null;
    }
  }

  // If we have a patient ID, store the message in our database
  if (patientId) {
    try {
      // Look up patient to get clinic ID
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });

      if (patient) {
        await prisma.patientChatMessage.create({
          data: {
            patientId: patient.id,
            clinicId: patient.clinicId,
            message: Body || '',
            direction: senderType === 'PATIENT' ? 'INBOUND' : 'OUTBOUND',
            channel: 'WEB',
            senderType,
            senderId: senderType === 'PROVIDER' ? attributes.providerId : null,
            senderName: Author,
            status: 'DELIVERED',
            externalId: MessageSid,
            deliveredAt: DateCreated ? new Date(DateCreated) : new Date(),
            threadId: ConversationSid,
          },
        });

        logger.info('[CHAT_WEBHOOK] Stored message in database', {
          patientId: patient.id,
          messageSid: MessageSid,
        });

        // Notify clinic admins of inbound patient messages
        if (senderType === 'PATIENT' && patient.clinicId) {
          const preview = (Body || '').length > 80 ? `${(Body || '').slice(0, 80)}…` : (Body || '');
          notificationService.notifyAdmins({
            clinicId: patient.clinicId,
            category: 'MESSAGE',
            priority: 'NORMAL',
            title: `New message from ${Author || 'Patient'}`,
            message: preview,
            actionUrl: '/admin/messages',
            sourceType: 'patient_chat_webhook',
            sourceId: `twilio_${MessageSid}`,
            metadata: { patientId: patient.id, messageSid: MessageSid },
          }).catch((err) => {
            logger.error('[CHAT_WEBHOOK] Failed to notify admins', {
              error: err instanceof Error ? err.message : 'Unknown error',
              patientId: patient.id,
            });
          });
        }
      }
    } catch (dbError) {
      logger.error('[CHAT_WEBHOOK] Failed to store message', {
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
        messageSid: MessageSid,
      });
    }
  }
}

/**
 * Handle new conversation event
 */
async function handleConversationAdded(payload: ConversationWebhookPayload): Promise<void> {
  const { ConversationSid, Attributes, DateCreated } = payload;

  logger.info('[CHAT_WEBHOOK] New conversation created', {
    conversationSid: ConversationSid,
  });

  // Parse attributes for context
  let attributes: Record<string, any> = {};
  if (Attributes) {
    try {
      attributes = JSON.parse(Attributes);
    } catch {
      // Ignore parse errors
    }
  }

  // Log for analytics
  logger.info('[CHAT_WEBHOOK] Conversation details', {
    conversationSid: ConversationSid,
    type: attributes.type || 'unknown',
    patientId: attributes.patientId,
    providerId: attributes.providerId,
    createdAt: DateCreated,
  });
}

/**
 * Handle participant added event
 */
async function handleParticipantAdded(payload: ConversationWebhookPayload): Promise<void> {
  const { ConversationSid, ParticipantSid, Identity } = payload;

  logger.info('[CHAT_WEBHOOK] Participant joined', {
    conversationSid: ConversationSid,
    participantSid: ParticipantSid,
    identity: Identity,
  });
}

/**
 * Handle conversation state change
 */
async function handleConversationStateUpdated(payload: ConversationWebhookPayload): Promise<void> {
  const { ConversationSid, Attributes } = payload;

  let attributes: Record<string, any> = {};
  if (Attributes) {
    try {
      attributes = JSON.parse(Attributes);
    } catch {
      // Ignore parse errors
    }
  }

  logger.info('[CHAT_WEBHOOK] Conversation state updated', {
    conversationSid: ConversationSid,
    state: attributes.state,
  });
}

/**
 * Main webhook handler
 */
export async function POST(req: NextRequest) {
  try {
    // Check if chat feature is enabled
    if (!isFeatureEnabled('TWILIO_CHAT')) {
      logger.warn('[CHAT_WEBHOOK] Chat feature disabled, ignoring webhook');
      return NextResponse.json({ received: true, status: 'feature_disabled' });
    }

    // Get raw body for signature validation
    const bodyText = await req.text();

    // Validate signature in production
    if (process.env.TWILIO_AUTH_TOKEN && process.env.NODE_ENV === 'production') {
      const signature = req.headers.get('X-Twilio-Signature') || '';
      const url = req.url;

      if (!validateWebhookSignature(process.env.TWILIO_AUTH_TOKEN, signature, url, bodyText)) {
        logger.warn('[CHAT_WEBHOOK] Invalid signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // Parse the webhook payload
    // Twilio sends form-urlencoded data
    const params = new URLSearchParams(bodyText);
    const payload: ConversationWebhookPayload = {
      EventType: params.get('EventType') as ConversationEventType,
      AccountSid: params.get('AccountSid') || '',
      ChatServiceSid: params.get('ChatServiceSid') || '',
      ConversationSid: params.get('ConversationSid') || undefined,
      MessageSid: params.get('MessageSid') || undefined,
      ParticipantSid: params.get('ParticipantSid') || undefined,
      Body: params.get('Body') || undefined,
      Author: params.get('Author') || undefined,
      Attributes: params.get('Attributes') || undefined,
      DateCreated: params.get('DateCreated') || undefined,
      Index: params.get('Index') || undefined,
      Identity: params.get('Identity') || undefined,
    };

    logger.info('[CHAT_WEBHOOK] Received event', {
      eventType: payload.EventType,
      conversationSid: payload.ConversationSid,
      chatServiceSid: payload.ChatServiceSid,
    });

    // Route to appropriate handler based on event type
    switch (payload.EventType) {
      case 'onMessageAdded':
        await handleMessageAdded(payload);
        break;

      case 'onConversationAdded':
        await handleConversationAdded(payload);
        break;

      case 'onParticipantAdded':
        await handleParticipantAdded(payload);
        break;

      case 'onConversationStateUpdated':
        await handleConversationStateUpdated(payload);
        break;

      case 'onMessageUpdated':
      case 'onMessageRemoved':
      case 'onConversationUpdated':
      case 'onConversationRemoved':
      case 'onParticipantUpdated':
      case 'onParticipantRemoved':
      case 'onUserAdded':
      case 'onUserUpdated':
        // Log but don't process these events for now
        logger.debug('[CHAT_WEBHOOK] Unhandled event type', {
          eventType: payload.EventType,
        });
        break;

      default:
        logger.warn('[CHAT_WEBHOOK] Unknown event type', {
          eventType: payload.EventType,
        });
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({
      received: true,
      eventType: payload.EventType,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[CHAT_WEBHOOK] Processing error', { error: errorMessage });

    // Return 200 even on error to prevent Twilio retries
    // The error is logged for debugging
    return NextResponse.json({
      received: true,
      status: 'error',
      error: errorMessage,
    });
  }
}

/**
 * Handle GET requests (for webhook verification)
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    service: 'twilio-chat-webhook',
    timestamp: new Date().toISOString(),
  });
}
