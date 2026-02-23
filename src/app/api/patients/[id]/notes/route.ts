import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ensureTenantResource, tenantNotFoundResponse } from '@/lib/tenant-response';
import { logger } from '@/lib/logger';
import { withAuthParams } from '@/lib/auth/middleware-with-params';
import { z } from 'zod';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';

type Params = { params: Promise<{ id: string }> };

const createBodySchema = z.object({
  content: z.string().min(1).max(20000),
  noteType: z.string().max(100).optional(),
});

function roleAbbreviation(role: string): string {
  const map: Record<string, string> = {
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
  return map[role] ?? role.slice(0, 2).toUpperCase();
}

function formatCenter(
  clinic: { name?: string | null; address?: unknown } | null
): string | null {
  if (!clinic?.name) return null;
  const addr = clinic.address as { city?: string; state?: string } | undefined;
  if (addr && (addr.city || addr.state)) {
    const parts = [addr.city, addr.state].filter(Boolean);
    return `${clinic.name}, ${parts.join(' ')}`;
  }
  return clinic.name;
}

const getHandler = withAuthParams(
  async (request: NextRequest, user, { params }: Params) => {
    try {
      const resolvedParams = await params;
      const patientId = parseInt(resolvedParams.id, 10);
      if (isNaN(patientId)) {
        return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
      }

      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });
      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId ?? undefined;
      if (ensureTenantResource(patient, clinicId)) return tenantNotFoundResponse();
      if (user.role === 'patient' && user.patientId !== patientId) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      const notes = await prisma.patientNote.findMany({
        where: { patientId },
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true, role: true },
          },
          clinic: {
            select: { id: true, name: true, address: true },
          },
        },
      });

      const data = notes.map((n) => ({
        id: n.id,
        content: n.content,
        noteType: n.noteType ?? null,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
        createdBy: n.createdBy
          ? {
              id: n.createdBy.id,
              firstName: n.createdBy.firstName,
              lastName: n.createdBy.lastName,
              role: n.createdBy.role,
              initials:
                (n.createdBy.firstName?.slice(0, 1) || '') +
                (n.createdBy.lastName?.slice(0, 1) || ''),
              roleAbbrev: roleAbbreviation(n.createdBy.role),
            }
          : null,
        center: formatCenter(n.clinic),
      }));

      return NextResponse.json({ ok: true, data });
    } catch (err) {
      logger.error('Error fetching patient notes', {
        patientId: (await params).id,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: 'Failed to fetch notes' },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin', 'provider', 'staff', 'support', 'patient'] }
);

const postHandler = withAuthParams(
  async (request: NextRequest, user, { params }: Params) => {
    try {
      const resolvedParams = await params;
      const patientId = parseInt(resolvedParams.id, 10);
      if (isNaN(patientId)) {
        return NextResponse.json({ error: 'Invalid patient ID' }, { status: 400 });
      }

      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { id: true, clinicId: true },
      });
      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId ?? undefined;
      if (ensureTenantResource(patient, clinicId)) return tenantNotFoundResponse();
      if (user.role === 'patient') {
        return NextResponse.json({ error: 'Patients cannot create profile notes' }, { status: 403 });
      }

      const body = await request.json();
      const parsed = createBodySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const note = await prisma.patientNote.create({
        data: {
          patientId,
          clinicId: patient!.clinicId,
          createdById: user.id,
          content: parsed.data.content,
          noteType: parsed.data.noteType ?? null,
        },
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
        action: 'PATIENT_NOTE_CREATED',
        outcome: 'SUCCESS',
        metadata: { noteId: note.id },
      });

      const center = formatCenter(note.clinic);

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
                roleAbbrev: roleAbbreviation(note.createdBy.role),
              }
            : null,
          center,
        },
      });
    } catch (err) {
      logger.error('Error creating patient note', {
        patientId: (await params).id,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: 'Failed to create note' },
        { status: 500 }
      );
    }
  },
  { roles: ['super_admin', 'admin', 'provider', 'staff', 'support'] }
);

export const GET = getHandler;
export const POST = postHandler;
