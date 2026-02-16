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
      return NextResponse.json(
        { error: 'Invalid input', isProvider: false },
        { status: 400 }
      );
    }

    const { email } = result.data;
    const emailLower = email.toLowerCase().trim();

    // Check: User with role=PROVIDER in the unified User table only.
    // We intentionally do NOT check:
    //   - ADMIN/SUPER_ADMIN roles (they have their own dashboards and should not be auto-redirected to provider login)
    //   - Legacy Provider table (may contain stale records or emails that belong to patients in the unified system)
    // Users in the legacy Provider table without a unified User record can still log in as provider
    // by clicking the "Provider? Log in as provider" link on the login page.
    const userWithProviderRole = await basePrisma.user.findFirst({
      where: {
        email: { equals: emailLower, mode: 'insensitive' },
        role: 'PROVIDER',
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    const isProvider = !!userWithProviderRole;

    if (isProvider) {
      logger.info('[CheckIdentifier] Provider email detected', {
        emailPrefix: emailLower.substring(0, 3) + '***',
      });
    }

    return NextResponse.json({ isProvider });
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
        { isProvider: false, error: 'Service is busy. Please try again in a moment.', retryAfter: 10 },
        { status: 503, headers: { 'Retry-After': '10' } }
      );
    }

    return NextResponse.json({ isProvider: false }, { status: 500 });
  }
}

export const POST = checkIdentifierRateLimit(checkIdentifierHandler);
