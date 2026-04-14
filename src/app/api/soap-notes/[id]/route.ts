import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import {
  getSOAPNoteById,
  approveSOAPNote,
  lockSOAPNote,
  editApprovedSOAPNote,
  formatSOAPNote,
  approveSOAPNoteSchema,
  editSOAPNoteSchema,
} from '@/services/ai/soapNoteService';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/soap-notes/[id] - Get a specific SOAP note
 */
async function getHandler(request: NextRequest, user: AuthUser, context?: RouteContext) {
  try {
    const resolvedParams = await context!.params;
    const { searchParams } = new URL(request.url);
    const includeRevisions = searchParams.get('includeRevisions') === 'true';
    const format = searchParams.get('format');

    const soapNoteId = parseInt(resolvedParams.id, 10);

    const soapNote = await getSOAPNoteById(soapNoteId, includeRevisions);

    if (user.role !== 'super_admin' && soapNote.clinicId && soapNote.clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (format === 'text') {
      // Return formatted text version
      const formatted = formatSOAPNote(soapNote);
      return new NextResponse(formatted, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }

    return NextResponse.json({
      ok: true,
      data: soapNote,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[API] Error fetching SOAP note:', error);
    return NextResponse.json(
      { error: errorMessage || 'Failed to fetch SOAP note' },
      { status: (error as any).message === 'SOAP note not found' ? 404 : 500 }
    );
  }
}

/**
 * PATCH /api/soap-notes/[id] - Update a SOAP note (edit or approve)
 */
async function patchHandler(request: NextRequest, user: AuthUser, context?: RouteContext) {
  try {
    const resolvedParams = await context!.params;
    const body = await request.json();
    const soapNoteId = parseInt(resolvedParams.id, 10);

    // Determine action type
    if (body.action === 'approve') {
      // Approve SOAP note
      const validated = approveSOAPNoteSchema.parse({
        ...body,
        soapNoteId,
      });

      const approved = await approveSOAPNote(soapNoteId, validated.providerId, validated.password);

      return NextResponse.json({
        ok: true,
        data: approved,
        message: 'SOAP note approved successfully',
      });
    } else if (body.action === 'lock') {
      // Lock SOAP note
      const locked = await lockSOAPNote(soapNoteId, body.providerId);

      return NextResponse.json({
        ok: true,
        data: locked,
        message: 'SOAP note locked successfully',
      });
    } else if (body.action === 'edit') {
      // Edit approved SOAP note
      const validated = editSOAPNoteSchema.parse({
        ...body,
        soapNoteId,
      });

      const edited = await editApprovedSOAPNote(
        soapNoteId,
        validated.password,
        validated.updates,
        body.editorEmail || 'unknown',
        validated.changeReason
      );

      return NextResponse.json({
        ok: true,
        data: edited,
        message: 'SOAP note updated successfully',
      });
    } else if (!body.action) {
      // Direct content update (save draft) — no action specified
      const allowedFields = [
        'subjective',
        'objective',
        'assessment',
        'plan',
        'medicalNecessity',
      ] as const;
      const updateData: Record<string, string> = {};
      for (const field of allowedFields) {
        if (typeof body[field] === 'string') {
          updateData[field] = body[field];
        }
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
      }

      const existing = await prisma.sOAPNote.findUnique({
        where: { id: soapNoteId },
        select: { status: true, patientId: true, clinicId: true },
      });

      if (!existing) {
        return NextResponse.json({ error: 'SOAP note not found' }, { status: 404 });
      }

      if (user.role !== 'super_admin' && existing.clinicId && existing.clinicId !== user.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      if (existing.status === 'LOCKED') {
        return NextResponse.json({ error: 'Cannot edit a locked SOAP note' }, { status: 400 });
      }

      const updated = await prisma.sOAPNote.update({
        where: { id: soapNoteId },
        data: updateData,
      });

      return NextResponse.json({
        ok: true,
        data: updated,
        message: 'SOAP note updated',
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Must be approve, lock, or edit' },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('[API] Error updating SOAP note:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    if (errorMessage === 'Invalid password') {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    return NextResponse.json(
      { error: errorMessage || 'Failed to update SOAP note' },
      { status: 500 }
    );
  }
}

export const GET = withAuth<RouteContext>(getHandler);
export const PATCH = withAuth<RouteContext>(patchHandler);
