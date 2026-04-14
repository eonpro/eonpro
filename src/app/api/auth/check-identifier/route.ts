/**
 * Check identifier (email) status for login routing
 *
 * POST /api/auth/check-identifier
 * Used by the login page to:
 *   1. Auto-redirect providers to the provider login flow
 *   2. Detect first-time users who need to set up their password
 *
 * Returns:
 *   { isProvider: boolean }                           — normal case
 *   { isProvider: boolean, needsSetup: true, firstName: string } — first-time user (never logged in)
 *
 * Security: Rate limited (separate from login), no PHI in response or logs.
 * needsSetup is only returned for non-patient users with lastLogin === null.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
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

/** Detect Prisma connection pool exhaustion / timeout errors */
function isPoolExhaustedError(err: unknown): boolean {
  const prismaCode = (err as { code?: string })?.code;
  if (prismaCode === 'P2024' || prismaCode === 'P1002') return true;
  const msg = (err as Error)?.message?.toLowerCase() ?? '';
  return (
    msg.includes('connection pool') ||
    msg.includes('timed out fetching') ||
    msg.includes('connection refused')
  );
}

async function checkIdentifierHandler(req: NextRequest) {
  try {
    const body = await req.json();
    const result = checkIdentifierSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid input', isProvider: false }, { status: 400 });
    }

    const { email } = result.data;
    const emailLower = email.toLowerCase().trim();

    // Single query: fetch the user record to check provider role AND first-time login status.
    // We only check the unified User table (not legacy Provider table).
    const user = await basePrisma.user.findFirst({
      where: {
        email: { equals: emailLower, mode: 'insensitive' },
        status: 'ACTIVE',
      },
      select: { id: true, role: true, lastLogin: true, firstName: true },
    });

    const isProvider = user?.role === 'PROVIDER';
    const needsSetup = !!user && user.lastLogin === null && user.role !== 'PATIENT';

    if (isProvider) {
      logger.info('[CheckIdentifier] Provider email detected', {
        emailPrefix: emailLower.substring(0, 3) + '***',
      });
    }

    return NextResponse.json({
      isProvider,
      ...(needsSetup ? { needsSetup: true, firstName: user!.firstName } : {}),
    });
  } catch (err) {
    const errorMessage = (err as Error).message ?? 'Unknown error';
    logger.error('[CheckIdentifier] Error', {
      error: errorMessage,
      prismaCode: (err as { code?: string })?.code,
    });

    Sentry.captureException(err, {
      tags: { route: 'POST /api/auth/check-identifier' },
    });

    // Return 503 with Retry-After for pool exhaustion so clients can back off
    if (isPoolExhaustedError(err)) {
      return NextResponse.json(
        {
          isProvider: false,
          error: 'Service is busy. Please try again in a moment.',
          retryAfter: 10,
        },
        { status: 503, headers: { 'Retry-After': '10' } }
      );
    }

    return NextResponse.json({ isProvider: false }, { status: 500 });
  }
}

export const POST = checkIdentifierRateLimit(checkIdentifierHandler);
