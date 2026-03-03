/**
 * POST /api/patients/[id]/portal-access/reset
 *
 * Resets a patient's portal access by removing their linked User account
 * and sending a fresh portal invite. Used when a patient is locked out
 * or their credentials are no longer working.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, type AuthUser } from '@/lib/auth/middleware-with-params';
import { patientService, type UserContext } from '@/domains/patient';
import { handleApiError, BadRequestError, NotFoundError } from '@/domains/shared/errors';
import { createAndSendPortalInvite } from '@/lib/portal-invite/service';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';

type Params = { params: Promise<{ id: string }> };

const postHandler = withAuthParams(
  async (request: NextRequest, user: AuthUser, { params }: Params) => {
    try {
      const resolvedParams = await params;
      const id = Number(resolvedParams.id);

      if (Number.isNaN(id) || id <= 0) {
        throw new BadRequestError('Invalid patient id');
      }

      const userContext: UserContext = {
        id: user.id,
        email: user.email,
        role: user.role as UserContext['role'],
        clinicId: user.clinicId,
        patientId: user.patientId,
      };

      await patientService.getPatient(id, userContext);

      const patient = await prisma.patient.findUnique({
        where: { id },
        include: { user: { select: { id: true, email: true } } },
      });

      if (!patient) {
        throw new NotFoundError('Patient not found');
      }

      if (!patient.user) {
        return NextResponse.json(
          { error: 'This patient does not have portal access to reset.' },
          { status: 400 }
        );
      }

      const portalUserId = patient.user.id;
      const portalUserEmail = patient.user.email;

      await prisma.$transaction(async (tx) => {
        await tx.userSession.deleteMany({ where: { userId: portalUserId } });
        await tx.userAuditLog.deleteMany({ where: { userId: portalUserId } });
        await tx.apiKey.deleteMany({ where: { userId: portalUserId } });
        await tx.user.delete({ where: { id: portalUserId } });
      }, { timeout: 15000 });

      logger.info('[PortalAccess] Portal access reset', {
        patientId: id,
        deletedUserId: portalUserId,
        resetBy: user.id,
      });

      await auditLog({
        eventType: AuditEventType.PHI_UPDATE,
        userId: user.id,
        patientId: id,
        clinicId: user.clinicId ?? patient.clinicId,
        action: 'PORTAL_ACCESS_RESET',
        details: {
          deletedUserId: portalUserId,
          deletedUserEmail: '[REDACTED]',
          reason: 'Admin-initiated portal access reset',
        },
      });

      const body = await request.json().catch(() => ({}));
      const channel = body.channel === 'sms' ? 'sms' : 'email';

      const host = request.headers.get('host');
      const proto =
        request.headers.get('x-forwarded-proto') ||
        request.headers.get('x-forwarded-protocol') ||
        'https';
      const baseUrlOverride = host ? `${proto}://${host}` : undefined;

      const inviteResult = await createAndSendPortalInvite(id, 'manual', {
        createdById: user.id,
        channel,
        baseUrlOverride,
      });

      return NextResponse.json({
        success: true,
        message: 'Portal access has been reset. A new invite has been sent to the patient.',
        inviteSent: inviteResult.success,
        inviteError: inviteResult.success ? undefined : inviteResult.error,
        expiresAt: inviteResult.expiresAt?.toISOString(),
      });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'POST /api/patients/[id]/portal-access/reset' },
      });
    }
  },
  { roles: ['super_admin', 'admin', 'provider', 'staff'] }
);

export const POST = postHandler;
