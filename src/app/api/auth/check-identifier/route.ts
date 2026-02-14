/**
 * Check if an identifier (email) belongs to a provider
 *
 * POST /api/auth/check-identifier
 * Used by the login page to auto-redirect providers to the provider login flow.
 * Returns { isProvider: boolean } without revealing whether the email exists.
 *
 * Security: Rate limited (separate from login), no PHI in response or logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { basePrisma } from '@/lib/db';
import { rateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const checkIdentifierSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const checkIdentifierRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 checks per IP per minute (separate from login budget)
  message: 'Too many identifier checks',
});

async function checkIdentifierHandler(req: NextRequest) {
  try {
    const body = await req.json();
    const result = checkIdentifierSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid input', isProvider: false },
        { status: 400 }
      );
    }

    const { email } = result.data;
    const emailLower = email.toLowerCase().trim();

    // Check: User with role=PROVIDER OR Provider record with this email
    const [userWithRole, providerByEmail] = await Promise.all([
      basePrisma.user.findFirst({
        where: {
          email: { equals: emailLower, mode: 'insensitive' },
          role: { in: ['PROVIDER', 'ADMIN', 'SUPER_ADMIN'] },
          status: 'ACTIVE',
        },
        select: { id: true },
      }),
      basePrisma.provider.findFirst({
        where: { email: { equals: emailLower, mode: 'insensitive' } },
        select: { id: true },
      }),
    ]);

    const isProvider = !!(userWithRole || providerByEmail);

    if (isProvider) {
      logger.info('[CheckIdentifier] Provider email detected', {
        emailPrefix: emailLower.substring(0, 3) + '***',
      });
    }

    return NextResponse.json({ isProvider });
  } catch (err) {
    logger.error('[CheckIdentifier] Error', { error: (err as Error).message });
    return NextResponse.json({ isProvider: false }, { status: 500 });
  }
}

export const POST = checkIdentifierRateLimit(checkIdentifierHandler);
