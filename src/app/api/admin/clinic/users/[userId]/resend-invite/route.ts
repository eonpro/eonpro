import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import { sendUserWelcomeNotification } from '@/lib/notifications/user-welcome';
import { logger } from '@/lib/logger';

type RouteContext = { params: Promise<{ userId: string }> };

/**
 * POST /api/admin/clinic/users/[userId]/resend-invite
 * Resend the "Set Your Password" invitation email to a user in the admin's clinic.
 */
export const POST = withAuthParams<RouteContext>(
  async (req: NextRequest, user: AuthUser, context: RouteContext) => {
    try {
      const { userId: userIdParam } = await context.params;
      const userId = parseInt(userIdParam);

      if (isNaN(userId)) {
        return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
      }

      if (!user.clinicId) {
        return NextResponse.json(
          { error: 'User is not associated with a clinic' },
          { status: 400 }
        );
      }

      const clinic = await prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { id: true, name: true, subdomain: true, customDomain: true, logoUrl: true },
      });

      if (!clinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      const targetUser = await prisma.user.findFirst({
        where: {
          id: userId,
          OR: [
            { clinicId: user.clinicId },
            { userClinics: { some: { clinicId: user.clinicId, isActive: true } } },
          ],
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
        clinicId: user.clinicId,
        clinicName: clinic.name,
        clinicSubdomain: clinic.subdomain,
        clinicCustomDomain: clinic.customDomain,
        clinicLogoUrl: clinic.logoUrl,
        phone: targetUser.phone,
        sendEmail: true,
        sendSms,
      });

      logger.info('[ResendInvite] Invite resent by admin', {
        targetUserId: userId,
        clinicId: user.clinicId,
        performedBy: user.id,
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
      logger.error('[ResendInvite] Admin error', { error: message });
      return NextResponse.json({ error: 'Failed to resend invitation' }, { status: 500 });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
