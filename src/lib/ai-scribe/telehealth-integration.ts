/**
 * AI Scribe - Telehealth Integration
 * 
 * Integrates AI Scribe with Zoom and other telehealth platforms
 * Handles automatic session management during video consultations
 */

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import {
  createTranscriptionSession,
  completeSession,
} from './transcription.service';
import {
  generateSOAPFromTranscript,
  saveScribeSOAPNote,
} from './soap-from-transcript.service';

export interface TelehealthSession {
  appointmentId: number;
  patientId: number;
  providerId: number;
  platform: 'zoom' | 'custom' | 'in_browser';
  meetingId?: string;
  scribeSessionId?: string;
  status: 'waiting' | 'in_progress' | 'completed' | 'failed';
  startedAt?: Date;
  endedAt?: Date;
}

// In-memory store for active telehealth sessions (use Redis in production)
const activeSessions = new Map<number, TelehealthSession>();

/**
 * Initialize AI Scribe for a telehealth appointment
 */
export async function initializeScribeForAppointment(
  appointmentId: number
): Promise<TelehealthSession | null> {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!appointment) {
      logger.error('Appointment not found for scribe initialization', { appointmentId });
      return null;
    }

    // Only for video appointments
    if (appointment.type !== 'VIDEO') {
      logger.info('Scribe not initialized - not a video appointment', { appointmentId });
      return null;
    }

    // Create transcription session
    const scribeSession = await createTranscriptionSession(
      appointmentId,
      appointment.patientId,
      appointment.providerId
    );

    const telehealthSession: TelehealthSession = {
      appointmentId,
      patientId: appointment.patientId,
      providerId: appointment.providerId,
      platform: appointment.zoomMeetingId ? 'zoom' : 'in_browser',
      meetingId: appointment.zoomMeetingId || undefined,
      scribeSessionId: scribeSession.id,
      status: 'waiting',
    };

    activeSessions.set(appointmentId, telehealthSession);

    logger.info('Scribe initialized for telehealth appointment', {
      appointmentId,
      scribeSessionId: scribeSession.id,
    });

    return telehealthSession;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to initialize scribe for appointment', {
      appointmentId,
      error: errorMessage,
    });
    return null;
  }
}

/**
 * Start scribe recording when call begins
 */
export async function startScribeRecording(
  appointmentId: number
): Promise<boolean> {
  const session = activeSessions.get(appointmentId);

  if (!session) {
    logger.warn('No active session found for appointment', { appointmentId });
    return false;
  }

  if (session.status === 'in_progress') {
    logger.info('Scribe already recording', { appointmentId });
    return true;
  }

  session.status = 'in_progress';
  session.startedAt = new Date();
  activeSessions.set(appointmentId, session);

  // Update appointment status
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    },
  });

  logger.info('Scribe recording started', { appointmentId });

  return true;
}

/**
 * Complete scribe session and generate SOAP note
 */
export async function completeScribeSession(
  appointmentId: number,
  autoGenerateSOAP: boolean = true
): Promise<{
  success: boolean;
  soapNote?: any;
  transcript?: string;
  error?: string;
}> {
  try {
    const session = activeSessions.get(appointmentId);

    if (!session || !session.scribeSessionId) {
      return {
        success: false,
        error: 'No active scribe session found',
      };
    }

    // Complete transcription session
    const { transcript, segments, duration } = await completeSession(session.scribeSessionId);

    session.status = 'completed';
    session.endedAt = new Date();
    activeSessions.set(appointmentId, session);

    // Update appointment
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    let soapNote = null;

    // Auto-generate SOAP note if requested
    if (autoGenerateSOAP && transcript.length > 0) {
      // Get patient context
      const patient = await prisma.patient.findUnique({
        where: { id: session.patientId },
        include: {
          weightLogs: {
            orderBy: { recordedAt: 'desc' },
            take: 1,
          },
        },
      });

      if (patient) {
        const generatedSOAP = await generateSOAPFromTranscript({
          transcript,
          segments,
          patientId: session.patientId,
          providerId: session.providerId,
          appointmentId,
          patientContext: {
            name: `${patient.firstName} ${patient.lastName}`,
            dob: patient.dob,
            recentVitals: patient.weightLogs[0] ? {
              weight: patient.weightLogs[0].weight,
            } : undefined,
          },
        });

        soapNote = await saveScribeSOAPNote(
          session.patientId,
          session.providerId,
          generatedSOAP,
          appointmentId,
          session.scribeSessionId
        );

        logger.info('SOAP note auto-generated from telehealth session', {
          appointmentId,
          soapNoteId: soapNote.id,
          duration,
        });
      }
    }

    // Clean up session
    activeSessions.delete(appointmentId);

    return {
      success: true,
      soapNote,
      transcript,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to complete scribe session', {
      appointmentId,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Get active scribe session for an appointment
 */
export function getActiveScribeSession(
  appointmentId: number
): TelehealthSession | null {
  return activeSessions.get(appointmentId) || null;
}

/**
 * Cancel scribe session (e.g., if call is cancelled)
 */
export async function cancelScribeSession(
  appointmentId: number
): Promise<void> {
  const session = activeSessions.get(appointmentId);

  if (session && session.scribeSessionId) {
    // Mark conversation as inactive
    await prisma.aIConversation.updateMany({
      where: { sessionId: session.scribeSessionId },
      data: { isActive: false },
    });
  }

  activeSessions.delete(appointmentId);

  logger.info('Scribe session cancelled', { appointmentId });
}

/**
 * Handle Zoom webhook events for automatic scribe management
 */
export async function handleZoomWebhook(
  event: string,
  payload: any
): Promise<void> {
  const meetingId = payload.object?.id;

  if (!meetingId) {
    return;
  }

  // Find appointment with this Zoom meeting ID
  const appointment = await prisma.appointment.findFirst({
    where: { zoomMeetingId: meetingId },
  });

  if (!appointment) {
    logger.warn('No appointment found for Zoom meeting', { meetingId });
    return;
  }

  switch (event) {
    case 'meeting.started':
      await initializeScribeForAppointment(appointment.id);
      await startScribeRecording(appointment.id);
      break;

    case 'meeting.ended':
      await completeScribeSession(appointment.id, true);
      break;

    case 'meeting.participant_joined':
      // Could start recording when both parties have joined
      const session = getActiveScribeSession(appointment.id);
      if (session && session.status === 'waiting') {
        await startScribeRecording(appointment.id);
      }
      break;

    default:
      logger.debug('Unhandled Zoom event', { event, meetingId });
  }
}

/**
 * Get scribe statistics for a provider
 */
export async function getScribeStats(
  providerId: number,
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalSessions: number;
  totalDuration: number;
  soapNotesGenerated: number;
  averageSessionDuration: number;
}> {
  const where: any = {
    providerId,
    sourceType: 'AI_GENERATED',
  };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = startDate;
    if (endDate) where.createdAt.lte = endDate;
  }

  const soapNotes = await prisma.sOAPNote.findMany({
    where,
    select: {
      id: true,
      createdAt: true,
    },
  });

  // Estimate duration based on token usage (rough approximation)
  const conversations = await prisma.aIConversation.findMany({
    where: {
      userEmail: `provider-${providerId}`,
      createdAt: startDate && endDate ? {
        gte: startDate,
        lte: endDate,
      } : undefined,
    },
    include: {
      _count: {
        select: { messages: true },
      },
    },
  });

  const totalSessions = conversations.length;
  const soapNotesGenerated = soapNotes.length;
  
  // Rough estimate: 10 seconds per message
  const totalDuration = conversations.reduce(
    (sum: number, conv: { _count: { messages: number } }) => sum + (conv._count.messages * 10),
    0
  );
  
  const averageSessionDuration = totalSessions > 0
    ? totalDuration / totalSessions
    : 0;

  return {
    totalSessions,
    totalDuration,
    soapNotesGenerated,
    averageSessionDuration,
  };
}
