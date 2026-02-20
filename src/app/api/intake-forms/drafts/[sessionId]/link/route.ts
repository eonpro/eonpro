/**
 * POST /api/intake-forms/drafts/[sessionId]/link
 *
 * Links an anonymous draft to an authenticated patient.
 * Called when a patient creates an account or logs in during the intake flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export const POST = withAuth<RouteParams>(
  async (req: NextRequest, user: AuthUser, { params } = {} as RouteParams) => {
    try {
      const { sessionId } = await params;

      if (!user.patientId) {
        return NextResponse.json(
          { error: 'Patient ID required' },
          { status: 400 },
        );
      }

      const draft = await prisma.intakeFormDraft.findUnique({
        where: { sessionId },
      });

      if (!draft) {
        return NextResponse.json(
          { error: 'Draft not found' },
          { status: 404 },
        );
      }

      if (draft.patientId && draft.patientId !== user.patientId) {
        return NextResponse.json(
          { error: 'Draft belongs to another patient' },
          { status: 403 },
        );
      }

      if (user.clinicId && draft.clinicId !== user.clinicId) {
        return NextResponse.json(
          { error: 'Draft belongs to a different clinic' },
          { status: 403 },
        );
      }

      await prisma.intakeFormDraft.update({
        where: { sessionId },
        data: { patientId: user.patientId },
      });

      logger.info('Draft linked to patient', {
        sessionId,
        patientId: user.patientId,
      });

      return NextResponse.json({ success: true, sessionId });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'POST /api/intake-forms/drafts/[sessionId]/link' },
      });
    }
  },
);
