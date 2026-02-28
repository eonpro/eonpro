/**
 * Apply Macro API Route
 * =====================
 *
 * POST /api/tickets/macros/[id]/apply - Apply a macro to a ticket
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth } from '@/lib/auth';
import { ticketService } from '@/domains/ticket';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = withAuth<RouteParams>(async (request, user, { params } = {} as RouteParams) => {
  try {
    const { id } = await params;
    const macroId = parseInt(id, 10);
    if (isNaN(macroId)) {
      return NextResponse.json({ error: 'Invalid macro ID' }, { status: 400 });
    }

    const body = await request.json();
    const ticketId = parseInt(body.ticketId, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Valid ticketId is required' }, { status: 400 });
    }

    const macro = await prisma.ticketMacro.findUnique({ where: { id: macroId } });
    if (!macro || !macro.isActive) {
      return NextResponse.json({ error: 'Macro not found or inactive' }, { status: 404 });
    }

    const userContext = {
      id: user.id,
      email: user.email ?? '',
      role: user.role.toLowerCase() as 'super_admin' | 'admin' | 'provider' | 'staff' | 'patient',
      clinicId: user.clinicId ?? null,
    };

    await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { lastActivityAt: new Date() };
      if (macro.setStatus) updateData.status = macro.setStatus;
      if (macro.setPriority) updateData.priority = macro.setPriority;
      if (macro.setCategory) updateData.category = macro.setCategory;

      if (Object.keys(updateData).length > 1) {
        await tx.ticket.update({ where: { id: ticketId }, data: updateData });
      }

      if (macro.addTags.length > 0 || macro.removeTags.length > 0) {
        const ticket = await tx.ticket.findUnique({ where: { id: ticketId }, select: { tags: true } });
        if (ticket) {
          let tags = [...ticket.tags];
          if (macro.removeTags.length > 0) {
            tags = tags.filter((t) => !macro.removeTags.includes(t));
          }
          if (macro.addTags.length > 0) {
            for (const tag of macro.addTags) {
              if (!tags.includes(tag)) tags.push(tag);
            }
          }
          await tx.ticket.update({ where: { id: ticketId }, data: { tags } });
        }
      }

      if (macro.responseContent) {
        await tx.ticketComment.create({
          data: {
            ticketId,
            authorId: user.id,
            comment: macro.responseContent,
            isInternal: false,
          },
        });
      }

      await tx.ticketMacro.update({
        where: { id: macroId },
        data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
      });

      await tx.ticketActivity.create({
        data: {
          ticketId,
          userId: user.id,
          activityType: 'AUTOMATION_TRIGGERED',
          details: { macroId, macroName: macro.name },
        },
      });
    }, { timeout: 15000 });

    logger.info('[API] Macro applied', { macroId, ticketId, userId: user.id });

    const ticket = await ticketService.getById(ticketId, userContext);
    return NextResponse.json({ ticket, message: `Macro "${macro.name}" applied` });
  } catch (error) {
    return handleApiError(error, { route: `POST /api/tickets/macros/${(await params).id}/apply` });
  }
});
