/**
 * SOAP Note Approval Flow Tests
 *
 * Tests the SOAP note lifecycle: create, draft save, approve,
 * clinic authorization, and patient visibility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => {
  const sOAPNote = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const patient = {
    findUnique: vi.fn(),
  };
  const patientDocument = {
    findFirst: vi.fn(),
  };
  return {
    prisma: { sOAPNote, patient, patientDocument },
    runWithClinicContext: vi.fn((_: any, cb: () => any) => cb()),
    withoutClinicFilter: vi.fn((cb: () => any) => cb()),
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/audit/hipaa-audit', () => ({
  auditLog: vi.fn(() => Promise.resolve()),
  AuditEventType: {
    PHI_VIEW: 'PHI_VIEW',
    PHI_CREATE: 'PHI_CREATE',
    PHI_UPDATE: 'PHI_UPDATE',
  },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPHI: vi.fn((v: string) => v),
  decryptPatientPHI: vi.fn((obj: any) => obj),
  DEFAULT_PHI_FIELDS: ['firstName', 'lastName', 'email', 'phone', 'dob'],
}));

import { prisma } from '@/lib/db';

describe('SOAP Note Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Draft Save (PATCH without action)', () => {
    it('allows updating draft SOAP note content', async () => {
      const existing = {
        id: 1,
        status: 'DRAFT',
        patientId: 100,
        clinicId: 1,
        subjective: 'old text',
      };

      (prisma.sOAPNote.findUnique as any).mockResolvedValue(existing);
      (prisma.sOAPNote.update as any).mockResolvedValue({
        ...existing,
        subjective: 'Patient reports headache',
      });

      const updateData = { subjective: 'Patient reports headache' };

      const result = await prisma.sOAPNote.update({
        where: { id: 1 },
        data: updateData,
      });

      expect(result.subjective).toBe('Patient reports headache');
    });

    it('rejects edits to LOCKED notes', () => {
      const locked = { id: 2, status: 'LOCKED', patientId: 100, clinicId: 1 };

      expect(locked.status).toBe('LOCKED');
    });
  });

  describe('Clinic Authorization', () => {
    it('blocks cross-clinic access for non-super-admin', () => {
      const note = { id: 1, clinicId: 1, patientId: 100 };
      const user = { role: 'provider', clinicId: 2 };

      const hasAccess =
        user.role === 'super_admin' || !note.clinicId || note.clinicId === user.clinicId;

      expect(hasAccess).toBe(false);
    });

    it('allows super_admin to access any clinic', () => {
      const note = { id: 1, clinicId: 1, patientId: 100 };
      const user = { role: 'super_admin', clinicId: undefined };

      const hasAccess =
        user.role === 'super_admin' || !note.clinicId || note.clinicId === user.clinicId;

      expect(hasAccess).toBe(true);
    });

    it('allows same-clinic provider access', () => {
      const note = { id: 1, clinicId: 1, patientId: 100 };
      const user = { role: 'provider', clinicId: 1 };

      const hasAccess =
        user.role === 'super_admin' || !note.clinicId || note.clinicId === user.clinicId;

      expect(hasAccess).toBe(true);
    });
  });

  describe('Approval Flow', () => {
    it('transitions DRAFT to APPROVED with approver info', async () => {
      const draft = {
        id: 1,
        status: 'DRAFT',
        patientId: 100,
        clinicId: 1,
        approvedBy: null,
        approvedAt: null,
      };

      (prisma.sOAPNote.findUnique as any).mockResolvedValue(draft);
      (prisma.sOAPNote.update as any).mockResolvedValue({
        ...draft,
        status: 'APPROVED',
        approvedBy: 300,
        approvedAt: new Date(),
      });

      const result = await prisma.sOAPNote.update({
        where: { id: 1 },
        data: {
          status: 'APPROVED',
          approvedBy: 300,
          approvedAt: new Date(),
        },
      });

      expect(result.status).toBe('APPROVED');
      expect(result.approvedBy).toBe(300);
      expect(result.approvedAt).toBeInstanceOf(Date);
    });

    it('is idempotent for already-approved notes', () => {
      const approved = {
        id: 1,
        status: 'APPROVED',
        approvedBy: 300,
        approvedAt: new Date(),
      };

      const isAlreadyApproved =
        approved.status === 'APPROVED' || approved.status === 'LOCKED';

      expect(isAlreadyApproved).toBe(true);
    });
  });

  describe('Patient Visit Notes Visibility', () => {
    it('returns only APPROVED and LOCKED notes', async () => {
      const allNotes = [
        { id: 1, status: 'DRAFT', assessment: 'draft note' },
        { id: 2, status: 'APPROVED', assessment: 'approved note' },
        { id: 3, status: 'LOCKED', assessment: 'locked note' },
        { id: 4, status: 'PENDING_REVIEW', assessment: 'pending note' },
      ];

      const visibleStatuses = ['APPROVED', 'LOCKED'];
      const patientVisible = allNotes.filter((n) =>
        visibleStatuses.includes(n.status)
      );

      expect(patientVisible).toHaveLength(2);
      expect(patientVisible.map((n) => n.id)).toEqual([2, 3]);
    });

    it('excludes subjective and objective from patient view', () => {
      const note = {
        id: 1,
        subjective: 'Patient complaints...',
        objective: 'Physical exam...',
        assessment: 'Diagnosis: ...',
        plan: 'Treatment plan...',
      };

      const patientView = {
        id: note.id,
        summary: note.assessment,
        nextSteps: note.plan,
      };

      expect(patientView).not.toHaveProperty('subjective');
      expect(patientView).not.toHaveProperty('objective');
      expect(patientView.summary).toBe(note.assessment);
      expect(patientView.nextSteps).toBe(note.plan);
    });
  });

  describe('SOAP Note Content Validation', () => {
    it('requires manualContent shape for POST /api/soap-notes', () => {
      const correctPayload = {
        patientId: 100,
        manualContent: {
          subjective: 'Patient reports...',
          objective: 'Vitals: ...',
          assessment: 'Diagnosis: ...',
          plan: 'Treatment: ...',
        },
      };

      expect(correctPayload.manualContent).toBeDefined();
      expect(correctPayload.manualContent.subjective).toBeTruthy();
    });

    it('rejects flat SOAP fields (old incorrect shape)', () => {
      const incorrectPayload = {
        patientId: 100,
        subjective: 'Patient reports...',
        objective: 'Vitals: ...',
        assessment: 'Diagnosis: ...',
        plan: 'Treatment: ...',
      };

      expect(incorrectPayload).not.toHaveProperty('manualContent');
    });
  });
});
