/**
 * Patient Portal Visit Notes API
 *
 * GET /api/patient-portal/visit-notes
 *
 * Returns approved SOAP notes for the authenticated patient.
 * Only notes with status APPROVED or LOCKED are visible to patients.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';

export const GET = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      const patientId = user.patientId;
      if (!patientId) {
        return NextResponse.json({ error: 'Patient context required' }, { status: 400 });
      }

      const soapNotes = await withoutClinicFilter(async () =>
        prisma.sOAPNote.findMany({
          where: {
            patientId,
            status: { in: ['APPROVED', 'LOCKED'] },
          },
          select: {
            id: true,
            createdAt: true,
            assessment: true,
            plan: true,
            medicalNecessity: true,
            status: true,
            approvedAt: true,
            approvedByProvider: {
              select: { firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
      );

      const visitNotes = soapNotes.map((note) => ({
        id: note.id,
        date: note.approvedAt ?? note.createdAt,
        provider: note.approvedByProvider
          ? `${note.approvedByProvider.firstName} ${note.approvedByProvider.lastName}`
          : undefined,
        summary: note.assessment ?? 'Clinical assessment on file.',
        nextSteps: note.plan ?? undefined,
      }));

      auditLog(request, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId,
        eventType: AuditEventType.PHI_VIEW,
        resourceType: 'SOAPNote',
        patientId,
        action: 'PATIENT_VIEW_VISIT_NOTES',
        outcome: 'SUCCESS',
        metadata: { noteCount: visitNotes.length },
      }).catch(() => {});

      return NextResponse.json({ visitNotes });
    } catch (error) {
      logger.error('[API] Error fetching patient visit notes', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return NextResponse.json({ error: 'Failed to load visit notes' }, { status: 500 });
    }
  },
  { roles: ['patient'] }
);
