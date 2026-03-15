/**
 * Telehealth Service
 *
 * Comprehensive telehealth session management with Zoom integration.
 * Handles meeting lifecycle, participant tracking, and calendar sync.
 */

import { prisma, withoutClinicFilter } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  createZoomMeeting,
  cancelZoomMeeting,
  ZoomMeetingResponse,
} from './meetingService';
import { isZoomConfigured, ZOOM_WEBHOOK_EVENTS } from './config';
import { AppointmentModeType } from '@prisma/client';
import { onAppointmentChange } from '@/lib/calendar-sync/calendar-sync.service';
import {
  createClinicZoomMeeting,
  cancelClinicZoomMeeting,
  isClinicZoomConfigured,
} from '@/lib/clinic-zoom';
import crypto from 'crypto';
import { encrypt } from '@/lib/security/encryption';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';

// Telehealth session status (matches Prisma enum once generated)
type TelehealthSessionStatus =
  | 'SCHEDULED'
  | 'WAITING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'TECHNICAL_ISSUES';

// ============================================================================
// Types
// ============================================================================

export interface CreateTelehealthSessionInput {
  clinicId?: number;
  appointmentId?: number;
  patientId: number;
  providerId: number;
  scheduledAt: Date;
  duration?: number;
  topic?: string;
}

export interface TelehealthSessionResult {
  success: boolean;
  session?: any;
  meeting?: ZoomMeetingResponse;
  error?: string;
}

export interface WebhookPayload {
  event: string;
  event_ts: number;
  payload: {
    account_id: string;
    object: {
      id?: string;
      uuid?: string;
      host_id?: string;
      topic?: string;
      type?: number;
      start_time?: string;
      duration?: number;
      timezone?: string;
      participant?: {
        id?: string;
        user_id?: string;
        participant_uuid?: string;
        user_name?: string;
        email?: string;
        join_time?: string;
        leave_time?: string;
      };
      recording_files?: Array<{
        id: string;
        recording_type: string;
        recording_start: string;
        recording_end: string;
        file_path: string;
        file_size: number;
        play_url?: string;
        download_url?: string;
        password?: string;
      }>;
    };
  };
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Create a telehealth session with Zoom meeting
 */
export async function createTelehealthSession(
  input: CreateTelehealthSessionInput
): Promise<TelehealthSessionResult> {
  try {
    // Get patient and provider info for meeting topic
    const [patient, provider] = await Promise.all([
      prisma.patient.findUnique({
        where: { id: input.patientId },
        select: { id: true, firstName: true, lastName: true, clinicId: true },
      }),
      prisma.provider.findUnique({
        where: { id: input.providerId },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);

    if (!patient || !provider) {
      return { success: false, error: 'Patient or provider not found' };
    }

    // Determine clinic ID for Zoom credentials
    const clinicId = input.clinicId || patient.clinicId;

    // Check if clinic has Zoom configured
    const hasZoom = clinicId ? await isClinicZoomConfigured(clinicId) : isZoomConfigured();
    if (!hasZoom) {
      return { success: false, error: 'Zoom not configured for this clinic' };
    }

    // Generate topic (HIPAA: avoid patient name in external systems)
    const topic =
      input.topic || `Telehealth Consultation - ${input.scheduledAt.toLocaleDateString()}`;

    const duration = input.duration || 30;

    // Create Zoom meeting using clinic-specific or platform credentials
    let meeting: ZoomMeetingResponse;

    if (clinicId) {
      // Try clinic-specific Zoom first
      const clinicMeeting = await createClinicZoomMeeting(clinicId, {
        topic,
        duration,
        startTime: input.scheduledAt,
        agenda: `Virtual consultation with patient ID: ${patient.id}`,
      });

      if (clinicMeeting) {
        meeting = {
          id: clinicMeeting.id,
          uuid: clinicMeeting.uuid,
          hostId: clinicMeeting.host_id,
          topic: clinicMeeting.topic,
          type: clinicMeeting.type,
          status: clinicMeeting.status || 'waiting',
          startTime: clinicMeeting.start_time,
          duration: clinicMeeting.duration,
          timezone: clinicMeeting.timezone,
          createdAt: clinicMeeting.created_at || new Date().toISOString(),
          joinUrl: clinicMeeting.join_url,
          startUrl: clinicMeeting.start_url,
          password: clinicMeeting.password,
        };
      } else {
        // Fall back to platform credentials
        meeting = await createZoomMeeting({
          topic,
          duration,
          patientId: input.patientId,
          providerId: input.providerId,
          scheduledAt: input.scheduledAt,
          agenda: `Virtual consultation with patient ID: ${patient.id}`,
        });
      }
    } else {
      // Use platform credentials
      meeting = await createZoomMeeting({
        topic,
        duration,
        patientId: input.patientId,
        providerId: input.providerId,
        scheduledAt: input.scheduledAt,
        agenda: `Virtual consultation with patient ID: ${patient.id}`,
      });
    }

    // Create session + update appointment atomically
    const session = await prisma.$transaction(async (tx) => {
      const newSession = await tx.telehealthSession.create({
        data: {
          clinicId: input.clinicId,
          appointmentId: input.appointmentId,
          patientId: input.patientId,
          providerId: input.providerId,
          meetingId: meeting.id.toString(),
          meetingUuid: meeting.uuid,
          joinUrl: meeting.joinUrl,
          hostUrl: meeting.startUrl,
          password: meeting.password,
          topic: meeting.topic,
          scheduledAt: input.scheduledAt,
          duration,
          status: 'SCHEDULED',
          platform: 'zoom',
          metadata: {
            zoomResponse: meeting,
            createdAt: new Date().toISOString(),
          } as any,
        },
        include: {
          patient: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          provider: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });

      if (input.appointmentId) {
        await tx.appointment.update({
          where: { id: input.appointmentId },
          data: {
            zoomMeetingId: meeting.id.toString(),
            zoomJoinUrl: meeting.joinUrl,
            videoLink: meeting.joinUrl,
          },
        });
      }

      return newSession;
    });

    // Calendar sync outside transaction (external side effect)
    if (input.appointmentId && input.clinicId) {
      onAppointmentChange(input.providerId, input.clinicId, input.appointmentId, 'updated');
    }

    // HIPAA audit log
    auditLog(null, {
      eventType: AuditEventType.PHI_CREATE,
      userId: input.providerId,
      clinicId: input.clinicId,
      resourceType: 'TelehealthSession',
      resourceId: session.id,
      patientId: input.patientId,
      action: 'telehealth_session_created',
      outcome: 'SUCCESS',
      metadata: { meetingId: meeting.id, duration },
    }).catch((err) => {
      logger.error('Failed to write HIPAA audit for telehealth session creation', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    });

    logger.info('Telehealth session created', {
      sessionId: session.id,
      meetingId: meeting.id,
      patientId: input.patientId,
      providerId: input.providerId,
    });

    return { success: true, session, meeting };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create telehealth session', { error: errorMessage, input });
    return { success: false, error: errorMessage };
  }
}

/**
 * Cancel a telehealth session
 */
export async function cancelTelehealthSession(
  sessionId: number,
  reason?: string
): Promise<TelehealthSessionResult> {
  try {
    const session = await prisma.telehealthSession.findUnique({
      where: { id: sessionId },
      include: { appointment: true, clinic: { select: { id: true } } },
    });

    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    // Cancel Zoom meeting using clinic-specific or platform credentials
    if (session.meetingId) {
      if (session.clinicId) {
        // Try clinic-specific Zoom first
        const cancelled = await cancelClinicZoomMeeting(session.clinicId, session.meetingId);
        if (!cancelled) {
          // Fall back to platform credentials
          await cancelZoomMeeting(session.meetingId);
        }
      } else {
        await cancelZoomMeeting(session.meetingId);
      }
    }

    const updatedSession = await prisma.$transaction(async (tx) => {
      const updated = await tx.telehealthSession.update({
        where: { id: sessionId },
        data: {
          status: 'CANCELLED',
          endReason: reason || 'Cancelled',
          endedAt: new Date(),
        },
      });

      if (session.appointmentId) {
        await tx.appointment.update({
          where: { id: session.appointmentId },
          data: {
            zoomMeetingId: null,
            zoomJoinUrl: null,
            videoLink: null,
          },
        });
      }

      return updated;
    });

    auditLog(null, {
      eventType: AuditEventType.PHI_UPDATE,
      userId: 0,
      clinicId: session.clinicId ?? undefined,
      resourceType: 'TelehealthSession',
      resourceId: sessionId,
      patientId: session.patientId,
      action: 'telehealth_session_cancelled',
      outcome: 'SUCCESS',
      reason,
      metadata: { meetingId: session.meetingId },
    }).catch((err) => {
      logger.error('Failed to write HIPAA audit for telehealth session cancellation', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    });

    logger.info('Telehealth session cancelled', {
      sessionId,
      meetingId: session.meetingId,
      reason,
    });

    return { success: true, session: updatedSession };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to cancel telehealth session', { sessionId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Get telehealth session by meeting ID
 */
export async function getSessionByMeetingId(meetingId: string) {
  return prisma.telehealthSession.findUnique({
    where: { meetingId },
    include: {
      patient: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
      provider: {
        select: { id: true, firstName: true, lastName: true },
      },
      appointment: true,
      participants: true,
    },
  });
}

/**
 * Get upcoming telehealth sessions for a provider
 */
export async function getProviderSessions(
  providerId: number,
  options?: {
    clinicId?: number;
    startDate?: Date;
    endDate?: Date;
    status?: TelehealthSessionStatus[];
  }
) {
  const now = new Date();
  const startDate = options?.startDate || now;
  const endDate = options?.endDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  return prisma.telehealthSession.findMany({
    where: {
      providerId,
      ...(options?.clinicId && { clinicId: options.clinicId }),
      scheduledAt: {
        gte: startDate,
        lte: endDate,
      },
      ...(options?.status && { status: { in: options.status } }),
    },
    include: {
      patient: {
        select: { id: true, firstName: true, lastName: true },
      },
      appointment: {
        select: { id: true, title: true, reason: true },
      },
    },
    orderBy: { scheduledAt: 'asc' },
  });
}

/**
 * Generate join credentials for a participant
 */
export async function getJoinCredentials(
  sessionId: number,
  role: 'host' | 'participant' = 'participant'
): Promise<{
  success: boolean;
  credentials?: {
    meetingNumber: string;
    password: string;
    joinUrl: string;
    hostUrl?: string;
  };
  error?: string;
}> {
  try {
    const session = await prisma.telehealthSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    return {
      success: true,
      credentials: {
        meetingNumber: session.meetingId,
        password: session.password || '',
        joinUrl: role === 'host' ? (session.hostUrl || session.joinUrl) : session.joinUrl,
        hostUrl: session.hostUrl || undefined,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Webhook Handlers
// ============================================================================

/**
 * Verify Zoom webhook signature
 */
export function verifyWebhookSignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  const message = `v0:${timestamp}:${body}`;
  const expectedSignature = `v0=${crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex')}`;

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
}

/**
 * Handle Zoom webhook: meeting.started
 */
export async function handleMeetingStarted(payload: WebhookPayload): Promise<void> {
  const meetingId = payload.payload.object.id?.toString();
  if (!meetingId) return;

  const session = await getSessionByMeetingId(meetingId);
  if (!session) {
    logger.warn('Webhook: Meeting started for unknown session', { meetingId });
    return;
  }

  await prisma.telehealthSession.update({
    where: { id: session.id },
    data: {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      hostJoinedAt: new Date(),
    },
  });

  // Update appointment status
  if (session.appointmentId) {
    await prisma.appointment.update({
      where: { id: session.appointmentId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });
  }

  logger.info('Webhook: Meeting started', {
    sessionId: session.id,
    meetingId,
  });
}

/**
 * Handle Zoom webhook: meeting.ended
 */
export async function handleMeetingEnded(payload: WebhookPayload): Promise<void> {
  const meetingId = payload.payload.object.id?.toString();
  if (!meetingId) return;

  const session = await getSessionByMeetingId(meetingId);
  if (!session) {
    logger.warn('Webhook: Meeting ended for unknown session', { meetingId });
    return;
  }

  const endedAt = new Date();
  const actualDuration = session.startedAt
    ? Math.round((endedAt.getTime() - session.startedAt.getTime()) / 60000)
    : null;

  await prisma.telehealthSession.update({
    where: { id: session.id },
    data: {
      status: 'COMPLETED',
      endedAt,
      actualDuration,
      participantCount: session.participants?.length || 0,
    },
  });

  // Update appointment status
  if (session.appointmentId) {
    await prisma.appointment.update({
      where: { id: session.appointmentId },
      data: {
        status: 'COMPLETED',
        completedAt: endedAt,
      },
    });
  }

  logger.info('Webhook: Meeting ended', {
    sessionId: session.id,
    meetingId,
    actualDuration,
  });
}

/**
 * Handle Zoom webhook: meeting.participant_joined
 */
export async function handleParticipantJoined(payload: WebhookPayload): Promise<void> {
  const meetingId = payload.payload.object.id?.toString();
  const participant = payload.payload.object.participant;
  if (!meetingId || !participant) return;

  const session = await getSessionByMeetingId(meetingId);
  if (!session) {
    logger.warn('Webhook: Participant joined unknown session', { meetingId });
    return;
  }

  const participantIdentifier =
    participant.user_id || participant.participant_uuid || participant.id || `anon-${Date.now()}`;

  await prisma.telehealthParticipant.create({
    data: {
      sessionId: session.id,
      participantId: participantIdentifier,
      name: participant.user_name || 'Unknown',
      email: participant.email,
      role: participant.user_id === payload.payload.object.host_id ? 'host' : 'participant',
      joinedAt: participant.join_time ? new Date(participant.join_time) : new Date(),
    },
  });

  // Detect patient join by decrypting the stored (encrypted) patient email
  let isPatientJoin = false;
  if (participant.email && session.patient?.email) {
    try {
      const decryptedPatientEmail = decryptPHI(session.patient.email);
      if (decryptedPatientEmail) {
        isPatientJoin =
          participant.email.toLowerCase() === decryptedPatientEmail.toLowerCase();
      }
    } catch {
      // Decryption failure — fall back to direct comparison for unencrypted legacy data
      isPatientJoin =
        participant.email.toLowerCase() === session.patient.email.toLowerCase();
    }
  }

  if (isPatientJoin) {
    await prisma.telehealthSession.update({
      where: { id: session.id },
      data: { patientJoinedAt: new Date() },
    });
  }

  if (session.status === 'WAITING') {
    await prisma.telehealthSession.update({
      where: { id: session.id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
    });
  }

  logger.info('Webhook: Participant joined', {
    sessionId: session.id,
    participantName: participant.user_name,
  });
}

/**
 * Handle Zoom webhook: meeting.participant_left
 */
export async function handleParticipantLeft(payload: WebhookPayload): Promise<void> {
  const meetingId = payload.payload.object.id?.toString();
  const participant = payload.payload.object.participant;
  if (!meetingId || !participant) return;

  const session = await getSessionByMeetingId(meetingId);
  if (!session) return;

  const participantIdentifier =
    participant.user_id || participant.participant_uuid || participant.id;

  const participantRecord = participantIdentifier
    ? await prisma.telehealthParticipant.findFirst({
        where: {
          sessionId: session.id,
          participantId: participantIdentifier,
          leftAt: null,
        },
      })
    : await prisma.telehealthParticipant.findFirst({
        where: {
          sessionId: session.id,
          name: participant.user_name || 'Unknown',
          leftAt: null,
        },
        orderBy: { joinedAt: 'desc' },
      });

  if (participantRecord) {
    const leftAt = participant.leave_time ? new Date(participant.leave_time) : new Date();
    const duration = Math.round((leftAt.getTime() - participantRecord.joinedAt.getTime()) / 1000);

    await prisma.telehealthParticipant.update({
      where: { id: participantRecord.id },
      data: {
        leftAt,
        duration,
      },
    });
  }

  logger.info('Webhook: Participant left', {
    sessionId: session.id,
    participantName: participant.user_name,
  });
}

/**
 * Handle Zoom webhook: meeting.participant_waiting
 */
export async function handleParticipantWaiting(payload: WebhookPayload): Promise<void> {
  const meetingId = payload.payload.object.id?.toString();
  const participant = payload.payload.object.participant;
  if (!meetingId || !participant) return;

  const session = await getSessionByMeetingId(meetingId);
  if (!session) return;

  await prisma.telehealthSession.update({
    where: { id: session.id },
    data: {
      status: 'WAITING',
      waitingRoomEnteredAt: new Date(),
    },
  });

  logger.info('Webhook: Participant in waiting room', {
    sessionId: session.id,
    participantName: participant.user_name,
  });

  // Notify the provider that a patient is in the waiting room
  try {
    const provider = await prisma.provider.findUnique({
      where: { id: session.providerId },
      select: { userId: true, clinicId: true },
    });

    if (provider?.userId) {
      const { notificationService } = await import('@/services/notification');
      await notificationService.createNotification({
        userId: provider.userId,
        clinicId: provider.clinicId ?? undefined,
        category: 'CLINICAL',
        priority: 'HIGH',
        title: 'Patient in Waiting Room',
        message: `${participant.user_name ?? 'A patient'} is waiting to join your telehealth session.`,
        actionUrl: '/provider/telehealth',
        sourceType: 'telehealth_waiting',
        sourceId: `session-${session.id}-waiting`,
        metadata: {
          sessionId: session.id,
          meetingId,
          participantName: participant.user_name,
        },
      });
    }
  } catch (notifError) {
    logger.debug('Failed to send waiting room notification (non-blocking)', {
      error: notifError instanceof Error ? notifError.message : 'Unknown',
    });
  }
}

/**
 * Handle Zoom webhook: recording.completed
 */
export async function handleRecordingCompleted(payload: WebhookPayload): Promise<void> {
  const meetingId = payload.payload.object.id?.toString();
  const recordings = payload.payload.object.recording_files;
  if (!meetingId || !recordings || recordings.length === 0) return;

  const session = await getSessionByMeetingId(meetingId);
  if (!session) {
    logger.warn('Webhook: Recording completed for unknown session', { meetingId });
    return;
  }

  // Find the main recording (video)
  const mainRecording =
    recordings.find(
      (r) =>
        r.recording_type === 'shared_screen_with_speaker_view' ||
        r.recording_type === 'active_speaker'
    ) || recordings[0];

  const rawUrl = mainRecording.play_url || mainRecording.download_url || '';
  await prisma.telehealthSession.update({
    where: { id: session.id },
    data: {
      recordingUrl: encrypt(rawUrl),
      recordingPassword: mainRecording.password ? encrypt(mainRecording.password) : null,
      recordingSize: mainRecording.file_size ? BigInt(mainRecording.file_size) : undefined,
    },
  });

  logger.info('Webhook: Recording completed', {
    sessionId: session.id,
    meetingId,
    recordingType: mainRecording.recording_type,
  });
}

/**
 * Main webhook dispatcher.
 * Wrapped in withoutClinicFilter because webhooks have no clinic context
 * but TelehealthSession is in CLINIC_ISOLATED_MODELS.
 */
export async function handleZoomWebhook(payload: WebhookPayload): Promise<void> {
  const eventType = payload.event;

  logger.info('Zoom webhook received', { event: eventType });

  await withoutClinicFilter(async () => {
    switch (eventType) {
      case ZOOM_WEBHOOK_EVENTS.MEETING_STARTED:
        await handleMeetingStarted(payload);
        break;

      case ZOOM_WEBHOOK_EVENTS.MEETING_ENDED:
        await handleMeetingEnded(payload);
        break;

      case ZOOM_WEBHOOK_EVENTS.MEETING_PARTICIPANT_JOINED:
        await handleParticipantJoined(payload);
        break;

      case ZOOM_WEBHOOK_EVENTS.MEETING_PARTICIPANT_LEFT:
        await handleParticipantLeft(payload);
        break;

      case ZOOM_WEBHOOK_EVENTS.PARTICIPANT_WAITING:
        await handleParticipantWaiting(payload);
        break;

      case ZOOM_WEBHOOK_EVENTS.RECORDING_COMPLETED:
        await handleRecordingCompleted(payload);
        break;

      default:
        logger.info('Unhandled Zoom webhook event', { event: eventType });
    }
  });
}

// ============================================================================
// Auto-Create Meeting for Appointments
// ============================================================================

/**
 * Automatically create Zoom meeting for VIDEO appointments
 */
export async function ensureZoomMeetingForAppointment(
  appointmentId: number
): Promise<TelehealthSessionResult> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      telehealthSessions: true,
      patient: true,
      provider: true,
    },
  });

  if (!appointment) {
    return { success: false, error: 'Appointment not found' };
  }

  // Only create for VIDEO appointments
  if (appointment.type !== AppointmentModeType.VIDEO) {
    return { success: false, error: 'Not a video appointment' };
  }

  // Check if session already exists
  const existingSession = (appointment.telehealthSessions as Array<{ status: string }>).find(
    (s: { status: string }) => s.status !== 'CANCELLED'
  );

  if (existingSession) {
    return { success: true, session: existingSession };
  }

  // Create new telehealth session
  return createTelehealthSession({
    clinicId: appointment.clinicId || undefined,
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    providerId: appointment.providerId,
    scheduledAt: appointment.startTime,
    duration: appointment.duration,
    topic: appointment.title || undefined,
  });
}

/**
 * Cancel Zoom meeting when appointment is cancelled
 */
export async function cancelZoomMeetingForAppointment(
  appointmentId: number,
  reason?: string
): Promise<void> {
  const sessions = await prisma.telehealthSession.findMany({
    where: {
      appointmentId,
      status: {
        notIn: ['CANCELLED', 'COMPLETED'],
      },
    },
  });

  for (const session of sessions) {
    await cancelTelehealthSession(session.id, reason);
  }
}
