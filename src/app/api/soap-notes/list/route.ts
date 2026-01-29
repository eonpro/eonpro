import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma, runWithClinicContext } from '@/lib/db';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';

/**
 * GET /api/soap-notes/list - Get all SOAP notes for the clinic
 * Protected: Requires provider or admin authentication with clinic context
 */
export const GET = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      const { searchParams } = new URL(request.url);
      const status = searchParams.get('status');
      const limit = parseInt(searchParams.get('limit') || '100', 10);
      const offset = parseInt(searchParams.get('offset') || '0', 10);

      // Run with clinic context for proper isolation
      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

      const result = await runWithClinicContext(clinicId, async () => {
        // Build where clause
        const where: any = {};
        
        if (status && status !== 'all') {
          where.status = status.toUpperCase();
        }

        // Fetch SOAP notes with patient information
        const soapNotes = await prisma.sOAPNote.findMany({
          where,
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
            approvedByProvider: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        });

        // Get total count for pagination
        const totalCount = await prisma.sOAPNote.count({ where });

        // Transform to include patient name
        const transformedNotes = soapNotes.map((note: typeof soapNotes[number]) => ({
          id: note.id,
          patientId: note.patientId,
          patientName: note.patient 
            ? `${note.patient.firstName} ${note.patient.lastName}`.trim()
            : 'Unknown Patient',
          subjective: note.subjective,
          objective: note.objective,
          assessment: note.assessment,
          plan: note.plan,
          status: note.status,
          createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(),
          approvedBy: note.approvedBy,
          approvedAt: note.approvedAt?.toISOString(),
          approvedByName: note.approvedByProvider
            ? `${note.approvedByProvider.firstName} ${note.approvedByProvider.lastName}`.trim()
            : undefined,
          generatedByAI: note.generatedByAI,
          sourceType: note.sourceType,
        }));

        return { notes: transformedNotes, totalCount };
      });

      // HIPAA Audit: Log bulk PHI access
      await auditLog(request, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId,
        eventType: AuditEventType.PHI_VIEW,
        resourceType: 'SOAPNote',
        action: 'LIST_SOAP_NOTES',
        outcome: 'SUCCESS',
        metadata: {
          notesReturned: result.notes.length,
          totalCount: result.totalCount,
          filterStatus: status,
        },
      });

      return NextResponse.json({
        ok: true,
        data: result.notes,
        meta: {
          total: result.totalCount,
          limit,
          offset,
          accessedBy: user.email,
          role: user.role,
        },
      });
    } catch (error: any) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[API] Error listing SOAP notes:', error);
      return NextResponse.json(
        { error: errorMessage || 'Failed to list SOAP notes' },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin', 'provider'] }
);
