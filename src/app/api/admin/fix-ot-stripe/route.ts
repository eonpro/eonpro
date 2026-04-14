/**
 * One-time fix: Set OT clinic's stripePlatformAccount flag to true.
 * OT uses the EONpro platform Stripe account directly — it should NOT
 * have a stripeAccountId that causes stripeAccount headers on API calls.
 *
 * POST /api/admin/fix-ot-stripe
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

async function handler(_req: NextRequest, user: AuthUser) {
  if (user.role !== 'super_admin') {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 });
  }

  const otClinic = await prisma.clinic.findFirst({
    where: { subdomain: 'ot' },
    select: {
      id: true,
      name: true,
      subdomain: true,
      stripeAccountId: true,
      stripePlatformAccount: true,
    },
  });

  if (!otClinic) {
    return NextResponse.json({ error: 'OT clinic not found' }, { status: 404 });
  }

  const before = {
    stripeAccountId: otClinic.stripeAccountId,
    stripePlatformAccount: otClinic.stripePlatformAccount,
  };

  await prisma.clinic.update({
    where: { id: otClinic.id },
    data: {
      stripePlatformAccount: true,
      stripeAccountId: null,
    },
  });

  logger.info('[FIX-OT-STRIPE] Updated OT clinic to platform account', {
    clinicId: otClinic.id,
    before,
    after: { stripeAccountId: null, stripePlatformAccount: true },
    userId: user.id,
  });

  return NextResponse.json({
    success: true,
    clinic: otClinic.name,
    before,
    after: { stripeAccountId: null, stripePlatformAccount: true },
  });
}

export const POST = withAuth(handler, { roles: ['super_admin'] });
