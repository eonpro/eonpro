/**
 * POST /api/patients/[id]/portal-invite
 * Send a one-time portal invite to this patient (email with link to create account).
 * Only for patients who do not yet have portal access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuthParams, type AuthUser } from '@/lib/auth/middleware-with-params';
import { patientService, type UserContext } from '@/domains/patient';
import { handleApiError, BadRequestError } from '@/domains/shared/errors';
import { createAndSendPortalInvite } from '@/lib/portal-invite/service';
import { logger } from '@/lib/logger';

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

      // Verify user can access this patient (throws if not found or no access)
      await patientService.getPatient(id, userContext);

      const body = await request.json().catch(() => ({}));
      const channel = body.channel === 'sms' ? 'sms' : 'email';

      // Use request origin for invite link so it matches the domain (e.g. eonmeds.eonpro.io)
      const host = request.headers.get('host');
      const proto =
        request.headers.get('x-forwarded-proto') ||
        request.headers.get('x-forwarded-protocol') ||
        'https';
      const baseUrlOverride = host ? `${proto}://${host}` : undefined;

      const result = await createAndSendPortalInvite(id, 'manual', {
        createdById: user.id,
        channel,
        baseUrlOverride,
      });

      if (!result.success) {
        if (result.error === 'Patient already has portal access') {
          return NextResponse.json(
            { error: 'This patient already has portal access.' },
            { status: 400 }
          );
        }
        if (result.error === 'Patient has no email address') {
          return NextResponse.json(
            { error: 'This patient has no email address. Add an email to send an invite.' },
            { status: 400 }
          );
        }
        if (result.error === 'Patient has no phone number') {
          return NextResponse.json(
            {
              error:
                'This patient has no phone number. Add a phone number to send an invite via SMS.',
            },
            { status: 400 }
          );
        }
        if (result.error === 'Patient not found') {
          return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
        }
        logger.error('[PortalInvite API] Send failed', {
          patientId: id,
          userId: user.id,
          error: result.error,
        });
        const isSecuritySensitive =
          result.error &&
          /decryption|encryption|ENCRYPTION_KEY|key must be|key not/i.test(result.error);
        const safeMessage = isSecuritySensitive
          ? 'Unable to load patient contact details. Please try again or contact support.'
          : (result.error ?? 'Failed to send invite. Please try again.');
        return NextResponse.json({ error: safeMessage }, { status: 500 });
      }

      const message =
        channel === 'sms'
          ? 'Portal invite sent to the patient’s phone.'
          : 'Portal invite sent to the patient’s email.';
      return NextResponse.json({
        success: true,
        message,
        expiresAt: result.expiresAt?.toISOString(),
      });
    } catch (error) {
      return handleApiError(error, {
        context: { route: 'POST /api/patients/[id]/portal-invite' },
      });
    }
  },
  { roles: ['super_admin', 'admin', 'provider', 'staff'] }
);

export const POST = postHandler;
