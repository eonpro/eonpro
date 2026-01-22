/**
 * Patient Chat API
 * Two-way messaging between patients and clinic staff
 * Supports web chat and Twilio SMS delivery
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma, basePrisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { withAuth, AuthUser } from "@/lib/auth/middleware";
import { standardRateLimit } from "@/lib/rateLimit";
import { sendSMS, formatPhoneNumber } from "@/lib/integrations/twilio/smsService";
import { z } from "zod";

// Sanitize text to prevent XSS
function sanitizeText(text: string): string {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

// Schema for sending a message
const sendMessageSchema = z.object({
  patientId: z.union([z.string(), z.number()]).transform(val => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
  message: z.string().min(1).max(2000).transform(sanitizeText),
  channel: z.enum(["WEB", "SMS"]).default("WEB"),
  threadId: z.string().optional(),
  replyToId: z.number().optional(),
});

// Schema for getting messages
const getMessagesSchema = z.object({
  patientId: z.string().transform(val => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) throw new Error('Invalid patientId');
    return num;
  }),
  limit: z.string().optional().transform(val => {
    if (!val) return 50;
    const num = parseInt(val, 10);
    return isNaN(num) || num <= 0 ? 50 : Math.min(num, 100);
  }),
  before: z.string().optional(), // Cursor for pagination
  threadId: z.string().optional(),
});

// Check if user can access patient's messages
function canAccessPatientMessages(user: AuthUser, patientId: number): boolean {
  // Patients can only see their own messages
  if (user.role === 'patient') {
    return user.patientId === patientId;
  }
  // Staff, providers, admins can see patient messages
  return ['provider', 'admin', 'staff', 'super_admin', 'support'].includes(user.role);
}

// Generate a unique thread ID
function generateThreadId(): string {
  return `thread_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// POST - Send a new message
const postHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const rawData = await request.json();
    const parseResult = sendMessageSchema.safeParse(rawData);
    
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parseResult.error.issues.map(i => i.message) },
        { status: 400 }
      );
    }

    const { patientId, message, channel, threadId, replyToId } = parseResult.data;

    // Check access
    if (!canAccessPatientMessages(user, patientId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Fetch patient for SMS delivery
    const patient = await basePrisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, firstName: true, lastName: true, phone: true, clinicId: true }
    });

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // Determine message direction and sender info
    const isPatient = user.role === 'patient';
    const direction = isPatient ? 'INBOUND' : 'OUTBOUND';
    const senderType = isPatient ? 'PATIENT' : (user.role === 'provider' ? 'PROVIDER' : 'STAFF');
    
    // Create or use thread ID
    const finalThreadId = threadId || generateThreadId();

    // Create the message in database
    const chatMessage = await basePrisma.patientChatMessage.create({
      data: {
        patientId,
        clinicId: patient.clinicId || user.clinicId || null,
        message,
        direction,
        channel,
        senderType,
        senderId: isPatient ? null : user.id,
        senderName: isPatient 
          ? `${patient.firstName} ${patient.lastName}` 
          : user.email,
        status: 'SENT',
        threadId: finalThreadId,
        replyToId: replyToId || null,
      }
    });

    // If sending via SMS and it's an outbound message, deliver via Twilio
    if (channel === 'SMS' && direction === 'OUTBOUND' && patient.phone) {
      try {
        const formattedPhone = formatPhoneNumber(patient.phone);
        const smsResult = await sendSMS({
          to: formattedPhone,
          body: message,
        });

        if (smsResult.success) {
          await basePrisma.patientChatMessage.update({
            where: { id: chatMessage.id },
            data: {
              status: 'DELIVERED',
              externalId: smsResult.messageId,
              deliveredAt: new Date(),
            }
          });
        } else {
          await basePrisma.patientChatMessage.update({
            where: { id: chatMessage.id },
            data: {
              status: 'FAILED',
              failureReason: smsResult.error,
            }
          });
          
          logger.error('Failed to send SMS', { 
            chatMessageId: chatMessage.id, 
            error: smsResult.error 
          });
        }
      } catch (smsError) {
        logger.error('SMS delivery error', { error: smsError });
        await basePrisma.patientChatMessage.update({
          where: { id: chatMessage.id },
          data: {
            status: 'FAILED',
            failureReason: 'SMS delivery failed',
          }
        });
      }
    }

    // Fetch the created message with relations
    const fullMessage = await basePrisma.patientChatMessage.findUnique({
      where: { id: chatMessage.id },
      include: {
        replyTo: {
          select: { id: true, message: true, senderName: true }
        }
      }
    });

    return NextResponse.json(fullMessage, { status: 201 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to send chat message", { error: errorMsg });
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
});

export const POST = standardRateLimit(postHandler);

// GET - Fetch messages for a patient
const getHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const parseResult = getMessagesSchema.safeParse({
      patientId: searchParams.get("patientId"),
      limit: searchParams.get("limit"),
      before: searchParams.get("before"),
      threadId: searchParams.get("threadId"),
    });

    if (!parseResult.success) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { patientId, limit, before, threadId } = parseResult.data;

    // Check access
    if (!canAccessPatientMessages(user, patientId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Build query filters
    const whereClause: any = { patientId };
    
    if (threadId) {
      whereClause.threadId = threadId;
    }
    
    if (before) {
      whereClause.createdAt = { lt: new Date(before) };
    }

    // Fetch messages
    const messages = await basePrisma.patientChatMessage.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        replyTo: {
          select: { id: true, message: true, senderName: true }
        }
      }
    });

    // Get unread count for staff viewing patient messages
    let unreadCount = 0;
    if (user.role !== 'patient') {
      unreadCount = await basePrisma.patientChatMessage.count({
        where: {
          patientId,
          direction: 'INBOUND',
          readAt: null,
        }
      });
    }

    // Mark inbound messages as read when staff views them
    if (user.role !== 'patient' && messages.length > 0) {
      await basePrisma.patientChatMessage.updateMany({
        where: {
          patientId,
          direction: 'INBOUND',
          readAt: null,
        },
        data: {
          readAt: new Date(),
        }
      });
    }

    return NextResponse.json({
      data: messages.reverse(), // Return in chronological order
      meta: {
        count: messages.length,
        unreadCount,
        patientId,
        hasMore: messages.length === limit,
        oldestTimestamp: messages.length > 0 ? messages[messages.length - 1].createdAt : null,
      }
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to fetch chat messages", { error: errorMsg });
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
});

export const GET = standardRateLimit(getHandler);

// PATCH - Mark messages as read
const patchHandler = withAuth(async (request: NextRequest, user) => {
  try {
    const body = await request.json();
    const { patientId, messageIds } = body;

    if (!patientId || !Array.isArray(messageIds)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    // Check access
    if (!canAccessPatientMessages(user, patientId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Mark messages as read
    const result = await basePrisma.patientChatMessage.updateMany({
      where: {
        id: { in: messageIds },
        patientId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      }
    });

    return NextResponse.json({ 
      success: true, 
      updated: result.count 
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Failed to mark messages as read", { error: errorMsg });
    return NextResponse.json({ error: "Failed to update messages" }, { status: 500 });
  }
});

export const PATCH = standardRateLimit(patchHandler);
