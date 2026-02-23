import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ensureTenantResource, tenantNotFoundResponse } from '@/lib/tenant-response';
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { z } from 'zod';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';

type Params = { params: Promise<{ id: string; noteId: string }> };

const updateBodySchema = z.object({
  content: z.string().min(1).max(20000).optional(),
  noteType: z.string().max(100).nullable().optional(),
});

const patchHandler = withAuthParams(
  async (request: NextRequest, user, { params }: Params) => {
    try {
      const resolvedParams = await params;
      const patientId = parseInt(resolvedParams.id, 10);
      const noteId = parseInt(resolvedParams.noteId, 10);
      if (isNaN(patientId) || isNaN(noteId)) {
        return NextResponse.json({ error: 'Invalid patient or note ID' }, { status: 400 });
      }

      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });
      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId ?? undefined;
      if (ensureTenantResource(patient, clinicId)) return tenantNotFoundResponse();
      if (user.role === 'patient') {
        return NextResponse.json({ error: 'Patients cannot edit profile notes' }, { status: 403 });
      }

      const existing = await prisma.patientNote.findFirst({
        where: { id: noteId, patientId },
        select: { id: true, patientId: true, clinicId: true },
      });
      if (!existing) return tenantNotFoundResponse();
      if (clinicId != null && existing.clinicId !== clinicId) return tenantNotFoundResponse();

      const body = await request.json();
      const parsed = updateBodySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const updateData: { content?: string; noteType?: string | null } = {};
      if (parsed.data.content !== undefined) updateData.content = parsed.data.content;
      if (parsed.data.noteType !== undefined) updateData.noteType = parsed.data.noteType;

      const note = await prisma.patientNote.update({
        where: { id: noteId },
        data: updateData,
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          clinic: {
            select: { id: true, name: true, address: true },
          },
        },
      });

      const headersList = request.headers;
      await auditLog(headersList, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId ?? undefined,
        eventType: AuditEventType.PHI_UPDATE,
        resourceType: 'Patient',
        resourceId: patientId,
        patientId,
        action: 'PATIENT_NOTE_UPDATED',
        outcome: 'SUCCESS',
        metadata: { noteId: note.id },
      });

      const roleAbbrev: Record<string, string> = {
        SUPER_ADMIN: 'SA',
        ADMIN: 'A',
        PROVIDER: 'P',
        STAFF: 'S',
        SUPPORT: 'Sp',
        SALES_REP: 'SR',
        PATIENT: 'Pt',
        INFLUENCER: 'I',
        AFFILIATE: 'Af',
      };
      const formatCenter = (
        clinic: { name?: string | null; address?: unknown } | null
      ): string | null => {
        if (!clinic?.name) return null;
        const addr = clinic.address as { city?: string; state?: string } | undefined;
        if (addr && (addr.city || addr.state)) {
          const parts = [addr.city, addr.state].filter(Boolean);
          return `${clinic.name}, ${parts.join(' ')}`;
        }
        return clinic.name;
      };

      return NextResponse.json({
        ok: true,
        data: {
          id: note.id,
          content: note.content,
          noteType: note.noteType ?? null,
          createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(),
          createdBy: note.createdBy
            ? {
                id: note.createdBy.id,
                firstName: note.createdBy.firstName,
                lastName: note.createdBy.lastName,
                role: note.createdBy.role,
                initials:
                  (note.createdBy.firstName?.slice(0, 1) || '') +
                  (note.createdBy.lastName?.slice(0, 1) || ''),
                roleAbbrev: roleAbbrev[note.createdBy.role] ?? note.createdBy.role.slice(0, 2).toUpperCase(),
              }
            : null,
          center: formatCenter(note.clinic),
        },
      });
    } catch (err) {
      logger.error('Error updating patient note', {
        params: await params,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: 'Failed to update note' },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin', 'provider', 'staff', 'support'] }
);

const deleteHandler = withAuthParams(
  async (request: NextRequest, user, { params }: Params) => {
    try {
      const resolvedParams = await params;
      const patientId = parseInt(resolvedParams.id, 10);
      const noteId = parseInt(resolvedParams.noteId, 10);
      if (isNaN(patientId) || isNaN(noteId)) {
        return NextResponse.json({ error: 'Invalid patient or note ID' }, { status: 400 });
      }

      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });
      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId ?? undefined;
      if (ensureTenantResource(patient, clinicId)) return tenantNotFoundResponse();
      if (user.role === 'patient') {
        return NextResponse.json({ error: 'Patients cannot delete profile notes' }, { status: 403 });
      }

      const existing = await prisma.patientNote.findFirst({
        where: { id: noteId, patientId },
        select: { id: true, clinicId: true },
      });
      if (!existing) return tenantNotFoundResponse();
      if (clinicId != null && existing.clinicId !== clinicId) return tenantNotFoundResponse();

      await prisma.patientNote.delete({ where: { id: noteId } });

      const headersList = request.headers;
      await auditLog(headersList, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        clinicId: user.clinicId ?? undefined,
        eventType: AuditEventType.PHI_UPDATE,
        resourceType: 'Patient',
        resourceId: patientId,
        patientId,
        action: 'PATIENT_NOTE_DELETED',
        outcome: 'SUCCESS',
        metadata: { noteId },
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      logger.error('Error deleting patient note', {
        params: await params,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: 'Failed to delete note' },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin', 'provider', 'staff', 'support'] }
);

export const PATCH = patchHandler;
export const DELETE = deleteHandler;
