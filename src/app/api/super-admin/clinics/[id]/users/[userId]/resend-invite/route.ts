import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { sendUserWelcomeNotification } from '@/lib/notifications/user-welcome';
import { logger } from '@/lib/logger';

type RouteParams = { id: string; userId: string };
type RouteContext = { params: Promise<RouteParams> };

function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser, params: RouteParams) => Promise<Response>
) {
  return withAuthParams<RouteContext>(
    async (req, user, context) => {
      const params = await context.params;
      return handler(req, user, params);
    },
    { roles: ['super_admin'] }
  );
}

/**
 * POST /api/super-admin/clinics/[id]/users/[userId]/resend-invite
 * Resend the "Set Your Password" invitation email to a user.
 */
export const POST = withSuperAdminAuth(
  async (req: NextRequest, adminUser: AuthUser, params: RouteParams) => {
    try {
      const clinicId = parseInt(params.id);
      const userId = parseInt(params.userId);

      if (isNaN(clinicId) || isNaN(userId)) {
        return NextResponse.json({ error: 'Invalid clinic or user ID' }, { status: 400 });
      }

      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true, subdomain: true, customDomain: true, logoUrl: true },
      });

      if (!clinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      const targetUser = await prisma.user.findFirst({
        where: {
          id: userId,
          OR: [{ clinicId }, { userClinics: { some: { clinicId, isActive: true } } }],
        },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, phone: true },
      });

      if (!targetUser) {
        return NextResponse.json({ error: 'User not found in this clinic' }, { status: 404 });
      }

      const body = await req.json().catch(() => ({}));
      const sendSms = !!body.sendSms;

      const result = await sendUserWelcomeNotification({
        userId: targetUser.id,
        email: targetUser.email,
        firstName: targetUser.firstName || '',
        lastName: targetUser.lastName || '',
        role: targetUser.role,
        clinicId,
        clinicName: clinic.name,
        clinicSubdomain: clinic.subdomain,
        clinicCustomDomain: clinic.customDomain,
        clinicLogoUrl: clinic.logoUrl,
        phone: targetUser.phone,
        sendEmail: true,
        sendSms,
      });

      logger.info('[ResendInvite] Invite resent', {
        targetUserId: userId,
        clinicId,
        performedBy: adminUser.id,
        emailSent: result.emailSent,
        smsSent: result.smsSent,
      });

      if (!result.emailSent && !result.smsSent) {
        return NextResponse.json(
          {
            error: 'Failed to send invitation',
            emailError: result.emailError,
            smsError: result.smsError,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        emailSent: result.emailSent,
        smsSent: result.smsSent,
        message: 'Invitation resent successfully',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[ResendInvite] Error', { error: message });
      return NextResponse.json({ error: 'Failed to resend invitation' }, { status: 500 });
    }
  }
);
