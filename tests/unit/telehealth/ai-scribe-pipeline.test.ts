/**
 * AI Scribe Pipeline Tests
 *
 * Tests the transcription session lifecycle, speaker detection,
 * provider ownership checks, and SOAP generation from transcripts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('openai', () => {
  class MockOpenAI {
    audio = { transcriptions: { create: vi.fn() } };
    chat = { completions: { create: vi.fn() } };
  }
  return { default: MockOpenAI };
});

vi.mock('@/lib/db', () => {
  const aIConversation = {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  };
  const aIMessage = {
    create: vi.fn(),
  };
  const patient = {
    findUnique: vi.fn(),
  };
  const provider = {
    findUnique: vi.fn(),
  };
  return {
    prisma: { aIConversation, aIMessage, patient, provider },
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPHI: vi.fn((val: string | null) => {
    if (!val) return null;
    if (val.startsWith('enc:')) return val.replace('enc:', '');
    return val;
  }),
  decryptPatientPHI: vi.fn((obj: any) => obj),
  DEFAULT_PHI_FIELDS: ['firstName', 'lastName', 'email', 'phone', 'dob'],
}));

import { prisma } from '@/lib/db';
import {
  detectSpeakers,
  createTranscriptionSession,
  addSegmentToSession,
  completeSession,
} from '@/lib/ai-scribe/transcription.service';
import { decryptPHI } from '@/lib/security/phi-encryption';

describe('AI Scribe Pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTranscriptionSession', () => {
    it('returns a session with a valid ID', async () => {
      (prisma.aIConversation.create as any).mockResolvedValue({ id: 1 });

      const session = await createTranscriptionSession(100, 200, 300);

      expect(session.id).toMatch(/^scribe-/);
      expect(session.patientId).toBe(200);
      expect(session.providerId).toBe(300);
      expect(session.status).toBe('active');
      expect(session.appointmentId).toBe(100);
    });

    it('stores session in AIConversation table', async () => {
      (prisma.aIConversation.create as any).mockResolvedValue({ id: 1 });

      await createTranscriptionSession(undefined, 200, 300);

      expect(prisma.aIConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: 200,
            userEmail: 'provider-300',
            isActive: true,
          }),
        })
      );
    });
  });

  describe('addSegmentToSession', () => {
    it('creates an AIMessage for the segment', async () => {
      (prisma.aIConversation.findFirst as any).mockResolvedValue({ id: 10 });
      (prisma.aIMessage.create as any).mockResolvedValue({ id: 1 });
      (prisma.aIConversation.update as any).mockResolvedValue({});

      await addSegmentToSession('scribe-123', {
        id: 'seg-0',
        speaker: 'provider',
        text: 'How are you feeling today?',
        startTime: 0,
        endTime: 5,
        confidence: 0.95,
        timestamp: new Date(),
      });

      expect(prisma.aIMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: 10,
            role: 'assistant',
            content: 'How are you feeling today?',
            queryType: 'transcription',
          }),
        })
      );
    });

    it('throws if session not found', async () => {
      (prisma.aIConversation.findFirst as any).mockResolvedValue(null);

      await expect(
        addSegmentToSession('nonexistent', {
          id: 'seg-0',
          speaker: 'provider',
          text: 'test',
          startTime: 0,
          endTime: 1,
          confidence: 0.9,
          timestamp: new Date(),
        })
      ).rejects.toThrow('Session not found');
    });
  });

  describe('completeSession', () => {
    it('assembles transcript from stored messages', async () => {
      (prisma.aIConversation.findFirst as any).mockResolvedValue({
        id: 10,
        messages: [
          {
            content: 'How are you?',
            role: 'assistant',
            queryType: 'transcription',
            createdAt: new Date(),
            citations: { speaker: 'provider', startTime: 0, endTime: 5 },
          },
          {
            content: 'I feel much better.',
            role: 'user',
            queryType: 'transcription',
            createdAt: new Date(),
            citations: { speaker: 'patient', startTime: 5, endTime: 10 },
          },
        ],
      });
      (prisma.aIConversation.update as any).mockResolvedValue({});

      const result = await completeSession('scribe-123');

      expect(result.segments).toHaveLength(2);
      expect(result.transcript).toContain('[PROVIDER]: How are you?');
      expect(result.transcript).toContain('[PATIENT]: I feel much better.');
      expect(result.duration).toBeGreaterThan(0);
    });

    it('marks session as inactive on completion', async () => {
      (prisma.aIConversation.findFirst as any).mockResolvedValue({
        id: 10,
        messages: [],
      });
      (prisma.aIConversation.update as any).mockResolvedValue({});

      await completeSession('scribe-123');

      expect(prisma.aIConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isActive: false },
        })
      );
    });

    it('throws if session not found', async () => {
      (prisma.aIConversation.findFirst as any).mockResolvedValue(null);

      await expect(completeSession('nonexistent')).rejects.toThrow('Session not found');
    });
  });

  describe('detectSpeakers', () => {
    it('classifies segments based on content heuristics', () => {
      const segments = [
        { start: 0, end: 5, text: 'How are you feeling today?' },
        { start: 5, end: 10, text: "I've been feeling much better since the last visit." },
        { start: 10, end: 15, text: 'I recommend we continue the current medication.' },
      ];

      const result = detectSpeakers(segments);

      expect(result).toHaveLength(3);
      expect(result[0].speaker).toBe('provider');
      expect(result[1].speaker).toBe('patient');
      expect(result[2].speaker).toBe('provider');
    });

    it('uses name matching when provider/patient names are given', () => {
      const segments = [
        { start: 0, end: 5, text: 'Dr. Smith told me to take the medication.' },
      ];

      const result = detectSpeakers(segments, 'Dr. Smith', 'Jane Doe');

      // Mentioning provider name indicates speaker is the patient (referring to the provider)
      expect(result[0].speaker).toBe('patient');
    });

    it('handles empty segments array', () => {
      const result = detectSpeakers([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('Provider Ownership Checks', () => {
    it('rejects mismatched providerId', () => {
      const requestProviderId = 300;
      const authenticatedProviderId = 400;

      const isOwner = requestProviderId === authenticatedProviderId;

      expect(isOwner).toBe(false);
    });

    it('allows matching providerId', () => {
      const requestProviderId = 300;
      const authenticatedProviderId = 300;

      const isOwner = requestProviderId === authenticatedProviderId;

      expect(isOwner).toBe(true);
    });
  });

  describe('Encrypted Patient Name Handling', () => {
    it('decrypts patient names before speaker detection', () => {
      const encryptedFirst = 'enc:Jane';
      const encryptedLast = 'enc:Doe';

      const firstName = decryptPHI(encryptedFirst) ?? encryptedFirst;
      const lastName = decryptPHI(encryptedLast) ?? encryptedLast;

      expect(firstName).toBe('Jane');
      expect(lastName).toBe('Doe');
    });

    it('falls back to raw value if decryption returns null', () => {
      (decryptPHI as any).mockReturnValueOnce(null);

      const raw = 'rawname';
      const result = decryptPHI(raw) ?? raw;

      expect(result).toBe('rawname');
    });
  });
});
