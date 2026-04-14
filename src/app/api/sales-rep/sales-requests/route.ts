import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

const requestSchema = z.object({
  patientId: z.number().positive(),
  note: z.string().max(200).optional(),
});

const SALES_REQUEST_TAG_PREFIX = 'sales-request:pending:';

function parseRequestTag(tag: string): number | null {
  if (!tag.startsWith(SALES_REQUEST_TAG_PREFIX)) return null;
  const repId = Number(tag.slice(SALES_REQUEST_TAG_PREFIX.length));
  return Number.isInteger(repId) && repId > 0 ? repId : null;
}

async function createRequestHandler(req: NextRequest, user: AuthUser) {
  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    const { patientId, note } = parsed.data;
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        clinicId: true,
        tags: true,
      },
    });

    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && patient.clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const existingAssignment = await prisma.patientSalesRepAssignment.findFirst({
      where: {
        patientId,
        isActive: true,
      },
      select: { salesRepId: true },
    });

    if (existingAssignment?.salesRepId === user.id) {
      return NextResponse.json({ error: 'Patient is already assigned to you' }, { status: 409 });
    }

    const currentTags = Array.isArray(patient.tags) ? (patient.tags as string[]) : [];
    const existingRequest = currentTags.find((tag) => parseRequestTag(tag) !== null);
    if (existingRequest) {
      return NextResponse.json(
        { error: 'A pending sales request already exists for this patient' },
        { status: 409 }
      );
    }

    const requestTag = `${SALES_REQUEST_TAG_PREFIX}${user.id}`;
    const updatedTags = [...currentTags, requestTag];

    await prisma.$transaction(async (tx) => {
      await tx.patient.update({
        where: { id: patientId },
        data: { tags: updatedTags },
      });

      await tx.patientAudit.create({
        data: {
          patientId,
          actorEmail: user.email,
          action: 'update',
          diff: {
            salesRequest: {
              status: 'PENDING',
              requestedBy: user.id,
              note: note || null,
            },
            tags: {
              before: currentTags,
              after: updatedTags,
              added: requestTag,
            },
          },
        },
      });
    });

    logger.info('[SalesRep Sales Request] Created', {
      patientId,
      clinicId: patient.clinicId,
      requestedBy: user.id,
    });

    return NextResponse.json({ success: true, requestTag }, { status: 201 });
  } catch (error) {
    logger.error('[SalesRep Sales Request] POST failed', {
      error: error instanceof Error ? error.message : String(error),
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to create sales request' }, { status: 500 });
  }
}

async function deleteRequestHandler(req: NextRequest, user: AuthUser) {
  try {
    const parsed = requestSchema.pick({ patientId: true }).safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }
    const { patientId } = parsed.data;

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        clinicId: true,
        tags: true,
      },
    });
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && patient.clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const currentTags = Array.isArray(patient.tags) ? (patient.tags as string[]) : [];
    const requestTags = currentTags.filter((tag) => parseRequestTag(tag) !== null);
    if (requestTags.length === 0) {
      return NextResponse.json({ error: 'No pending sales request found' }, { status: 404 });
    }

    const removableTags =
      user.role === 'admin' || user.role === 'super_admin'
        ? requestTags
        : requestTags.filter((tag) => parseRequestTag(tag) === user.id);

    if (removableTags.length === 0) {
      return NextResponse.json(
        { error: 'You can only remove your own pending sales request' },
        { status: 403 }
      );
    }

    const updatedTags = currentTags.filter((tag) => !removableTags.includes(tag));
    await prisma.$transaction(async (tx) => {
      await tx.patient.update({
        where: { id: patientId },
        data: { tags: updatedTags },
      });

      await tx.patientAudit.create({
        data: {
          patientId,
          actorEmail: user.email,
          action: 'update',
          diff: {
            salesRequest: {
              status: 'REMOVED',
              removedBy: user.id,
            },
            tags: {
              before: currentTags,
              after: updatedTags,
              removed: removableTags,
            },
          },
        },
      });
    });

    return NextResponse.json({ success: true, removed: removableTags.length });
  } catch (error) {
    logger.error('[SalesRep Sales Request] DELETE failed', {
      error: error instanceof Error ? error.message : String(error),
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to remove sales request' }, { status: 500 });
  }
}

export const POST = withAuth(createRequestHandler, {
  roles: ['sales_rep', 'admin', 'super_admin'],
});
export const DELETE = withAuth(deleteRequestHandler, {
  roles: ['sales_rep', 'admin', 'super_admin'],
});
