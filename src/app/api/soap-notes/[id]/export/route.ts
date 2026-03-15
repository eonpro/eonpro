/**
 * SOAP Note Export API
 *
 * GET /api/soap-notes/[id]/export
 *
 * Returns a SOAP note as a downloadable formatted text document.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withAuth<RouteContext>(
  async (request: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      if (!context?.params) {
        return NextResponse.json({ error: 'Missing route parameters' }, { status: 400 });
      }

      const { id } = await context.params;
      const soapNoteId = parseInt(id, 10);

      if (isNaN(soapNoteId)) {
        return NextResponse.json({ error: 'Invalid SOAP note ID' }, { status: 400 });
      }

      const soapNote = await prisma.sOAPNote.findUnique({
        where: { id: soapNoteId },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              dob: true,
              clinicId: true,
            },
          },
          approvedByProvider: {
            select: { firstName: true, lastName: true },
          },
        },
      });

      if (!soapNote) {
        return NextResponse.json({ error: 'SOAP note not found' }, { status: 404 });
      }

      if (user.role !== 'super_admin' && soapNote.patient.clinicId !== user.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const patientFirst = decryptPHI(soapNote.patient.firstName) ?? soapNote.patient.firstName ?? '';
      const patientLast = decryptPHI(soapNote.patient.lastName) ?? soapNote.patient.lastName ?? '';
      const patientDob = decryptPHI(soapNote.patient.dob) ?? soapNote.patient.dob ?? '';
      const patientName = `${patientFirst} ${patientLast}`.trim();

      const approverName = soapNote.approvedByProvider
        ? `${soapNote.approvedByProvider.firstName} ${soapNote.approvedByProvider.lastName}`
        : undefined;

      const createdDate = soapNote.createdAt
        ? new Date(soapNote.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'Unknown';

      const lines = [
        '═══════════════════════════════════════════════════',
        '                    SOAP NOTE',
        '═══════════════════════════════════════════════════',
        '',
        `Patient:    ${patientName}`,
        `DOB:        ${patientDob}`,
        `Date:       ${createdDate}`,
        `Status:     ${soapNote.status}`,
        ...(approverName ? [`Approved by: ${approverName}`] : []),
        ...(soapNote.approvedAt
          ? [`Approved on: ${new Date(soapNote.approvedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`]
          : []),
        '',
        '───────────────────────────────────────────────────',
        'SUBJECTIVE',
        '───────────────────────────────────────────────────',
        soapNote.subjective || 'N/A',
        '',
        '───────────────────────────────────────────────────',
        'OBJECTIVE',
        '───────────────────────────────────────────────────',
        soapNote.objective || 'N/A',
        '',
        '───────────────────────────────────────────────────',
        'ASSESSMENT',
        '───────────────────────────────────────────────────',
        soapNote.assessment || 'N/A',
        '',
        '───────────────────────────────────────────────────',
        'PLAN',
        '───────────────────────────────────────────────────',
        soapNote.plan || 'N/A',
        '',
        ...(soapNote.medicalNecessity
          ? [
              '───────────────────────────────────────────────────',
              'MEDICAL NECESSITY',
              '───────────────────────────────────────────────────',
              soapNote.medicalNecessity,
              '',
            ]
          : []),
        '═══════════════════════════════════════════════════',
        `Generated: ${new Date().toISOString()}`,
        `SOAP Note ID: ${soapNote.id}`,
        '═══════════════════════════════════════════════════',
      ];

      const content = lines.join('\n');
      const filename = `soap-note-${soapNote.id}-${patientLast || 'patient'}.txt`;

      auditLog(request, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId,
        eventType: AuditEventType.PHI_VIEW,
        resourceType: 'SOAPNote',
        resourceId: soapNoteId,
        patientId: soapNote.patientId,
        action: 'EXPORT_SOAP_NOTE',
        outcome: 'SUCCESS',
      }).catch(() => {});

      return new NextResponse(content, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    } catch (error) {
      logger.error('[API] Error exporting SOAP note', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return NextResponse.json({ error: 'Failed to export SOAP note' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin', 'provider'] }
);
