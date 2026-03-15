/**
 * Telehealth Webhook Handler Tests
 *
 * Tests for Zoom webhook event processing: meeting started/ended,
 * participant joined/left, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => {
  const telehealthSession = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const telehealthParticipant = {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  const appointment = {
    update: vi.fn(),
  };
  const provider = {
    findUnique: vi.fn(),
  };
  return {
    prisma: { telehealthSession, telehealthParticipant, appointment, provider },
    withoutClinicFilter: vi.fn((cb: () => any) => cb()),
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPHI: vi.fn((val: string) => {
    if (val.includes(':')) return `decrypted-${val}`;
    return val;
  }),
}));

vi.mock('@/lib/security/encryption', () => ({
  encrypt: vi.fn((val: string) => `encrypted:${val}`),
}));

vi.mock('@/lib/audit/hipaa-audit', () => ({
  auditLog: vi.fn(() => Promise.resolve()),
  AuditEventType: { PHI_CREATE: 'PHI_CREATE', PHI_UPDATE: 'PHI_UPDATE' },
}));

vi.mock('@/services/notification', () => ({
  notificationService: {
    createNotification: vi.fn(() => Promise.resolve()),
  },
}));

import { prisma } from '@/lib/db';
import {
  handleMeetingStarted,
  handleMeetingEnded,
  handleParticipantJoined,
  handleParticipantLeft,
  type WebhookPayload,
} from '@/lib/integrations/zoom/telehealthService';
import { logger } from '@/lib/logger';

function createPayload(
  event: string,
  meetingId: number,
  overrides?: Partial<WebhookPayload['payload']['object']>
): WebhookPayload {
  return {
    event,
    event_ts: Date.now(),
    payload: {
      account_id: 'test-account',
      object: {
        id: String(meetingId),
        uuid: `uuid-${meetingId}`,
        host_id: 'host-123',
        ...overrides,
      },
    },
  };
}

const mockSession = {
  id: 1,
  meetingId: '12345678',
  appointmentId: 100,
  patientId: 200,
  providerId: 300,
  status: 'SCHEDULED',
  startedAt: null,
  participants: [],
  patient: {
    id: 200,
    firstName: 'enc:Jane',
    lastName: 'enc:Doe',
    email: 'enc:jane@example.com',
    phone: null,
  },
  provider: { id: 300, firstName: 'Dr', lastName: 'Smith' },
  appointment: { id: 100 },
};

describe('Telehealth Webhook Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleMeetingStarted', () => {
    it('updates session to IN_PROGRESS and appointment status', async () => {
      (prisma.telehealthSession.findUnique as any).mockResolvedValue(mockSession);
      (prisma.telehealthSession.update as any).mockResolvedValue({});
      (prisma.appointment.update as any).mockResolvedValue({});

      await handleMeetingStarted(createPayload('meeting.started', 12345678));

      expect(prisma.telehealthSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            status: 'IN_PROGRESS',
          }),
        })
      );
      expect(prisma.appointment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 100 },
          data: expect.objectContaining({ status: 'IN_PROGRESS' }),
        })
      );
    });

    it('handles unknown meeting gracefully', async () => {
      (prisma.telehealthSession.findUnique as any).mockResolvedValue(null);

      await handleMeetingStarted(createPayload('meeting.started', 99999));

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('unknown session'),
        expect.any(Object)
      );
      expect(prisma.telehealthSession.update).not.toHaveBeenCalled();
    });

    it('catches and logs DB errors', async () => {
      (prisma.telehealthSession.findUnique as any).mockRejectedValue(new Error('DB down'));

      await handleMeetingStarted(createPayload('meeting.started', 12345678));

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('handleMeetingStarted failed'),
        expect.objectContaining({ error: 'DB down' })
      );
    });

    it('skips if meetingId is missing', async () => {
      const payload = createPayload('meeting.started', 12345678);
      payload.payload.object.id = undefined;

      await handleMeetingStarted(payload);

      expect(prisma.telehealthSession.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('handleMeetingEnded', () => {
    it('updates session to COMPLETED with duration', async () => {
      const startedAt = new Date(Date.now() - 30 * 60000);
      (prisma.telehealthSession.findUnique as any).mockResolvedValue({
        ...mockSession,
        status: 'IN_PROGRESS',
        startedAt,
      });
      (prisma.telehealthSession.update as any).mockResolvedValue({});
      (prisma.appointment.update as any).mockResolvedValue({});

      await handleMeetingEnded(createPayload('meeting.ended', 12345678));

      expect(prisma.telehealthSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            actualDuration: expect.any(Number),
          }),
        })
      );
    });

    it('handles null startedAt gracefully', async () => {
      (prisma.telehealthSession.findUnique as any).mockResolvedValue({
        ...mockSession,
        status: 'IN_PROGRESS',
        startedAt: null,
      });
      (prisma.telehealthSession.update as any).mockResolvedValue({});
      (prisma.appointment.update as any).mockResolvedValue({});

      await handleMeetingEnded(createPayload('meeting.ended', 12345678));

      expect(prisma.telehealthSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actualDuration: null,
          }),
        })
      );
    });
  });

  describe('handleParticipantJoined', () => {
    it('creates participant record with fallback identifier', async () => {
      (prisma.telehealthSession.findUnique as any).mockResolvedValue(mockSession);
      (prisma.telehealthParticipant.create as any).mockResolvedValue({});

      const payload = createPayload('meeting.participant_joined', 12345678, {
        participant: {
          user_id: undefined,
          participant_uuid: 'puuid-abc',
          user_name: 'Jane Doe',
          email: 'jane@example.com',
          join_time: new Date().toISOString(),
        },
      });

      await handleParticipantJoined(payload);

      expect(prisma.telehealthParticipant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            participantId: 'puuid-abc',
            name: 'Jane Doe',
          }),
        })
      );
    });

    it('detects patient join via decrypted email', async () => {
      (prisma.telehealthSession.findUnique as any).mockResolvedValue({
        ...mockSession,
        patient: { ...mockSession.patient, email: 'jane@example.com' },
      });
      (prisma.telehealthParticipant.create as any).mockResolvedValue({});
      (prisma.telehealthSession.update as any).mockResolvedValue({});

      const payload = createPayload('meeting.participant_joined', 12345678, {
        participant: {
          user_id: 'user-456',
          user_name: 'Jane',
          email: 'jane@example.com',
          join_time: new Date().toISOString(),
        },
      });

      await handleParticipantJoined(payload);

      expect(prisma.telehealthSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ patientJoinedAt: expect.any(Date) }),
        })
      );
    });
  });

  describe('handleParticipantLeft', () => {
    it('updates participant record with leftAt and duration', async () => {
      const joinedAt = new Date(Date.now() - 1800000);
      (prisma.telehealthSession.findUnique as any).mockResolvedValue(mockSession);
      (prisma.telehealthParticipant.findFirst as any).mockResolvedValue({
        id: 10,
        joinedAt,
        participantId: 'user-456',
      });
      (prisma.telehealthParticipant.update as any).mockResolvedValue({});

      const payload = createPayload('meeting.participant_left', 12345678, {
        participant: {
          user_id: 'user-456',
          user_name: 'Jane Doe',
          leave_time: new Date().toISOString(),
        },
      });

      await handleParticipantLeft(payload);

      expect(prisma.telehealthParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          data: expect.objectContaining({
            leftAt: expect.any(Date),
            duration: expect.any(Number),
          }),
        })
      );
    });

    it('handles unknown participant gracefully', async () => {
      (prisma.telehealthSession.findUnique as any).mockResolvedValue(mockSession);
      (prisma.telehealthParticipant.findFirst as any).mockResolvedValue(null);

      const payload = createPayload('meeting.participant_left', 12345678, {
        participant: {
          user_id: 'unknown-user',
          user_name: 'Ghost',
        },
      });

      await handleParticipantLeft(payload);

      expect(prisma.telehealthParticipant.update).not.toHaveBeenCalled();
    });
  });
});
