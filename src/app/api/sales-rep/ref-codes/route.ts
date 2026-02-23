/**
 * Sales Rep Ref Codes API
 *
 * GET - List current sales rep's ref codes with stats (clicks, intakes, conversions)
 * POST - Create a new ref code
 * DELETE - Deactivate a ref code (query: code=xxx)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const createRefCodeSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/i, 'Name may only contain letters, numbers, hyphens, and underscores'),
});

const MAX_REF_CODES = 10;

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    if (user.role !== 'sales_rep' || !user.clinicId) {
      return NextResponse.json({ error: 'Sales rep clinic context required' }, { status: 403 });
    }

    const clinicId = user.clinicId;
    const salesRepId = user.id;

    const result = await runWithClinicContext(clinicId, async () => {
      const refCodes = await prisma.salesRepRefCode.findMany({
        where: { salesRepId, clinicId, isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      const refCodeStats = await Promise.all(
        refCodes.map(async (code) => {
          const [clickCount, lastClick, intakeCount] = await Promise.all([
            prisma.salesRepTouch.count({
              where: {
                salesRepId,
                refCode: code.refCode,
                touchType: 'CLICK',
              },
            }),
            prisma.salesRepTouch.findFirst({
              where: {
                salesRepId,
                refCode: code.refCode,
                touchType: 'CLICK',
              },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true },
            }),
            prisma.salesRepTouch.count({
              where: {
                salesRepId,
                refCode: code.refCode,
                convertedPatientId: { not: null },
              },
            }),
          ]);

          const conversions = await prisma.salesRepTouch.count({
            where: {
              salesRepId,
              refCode: code.refCode,
              convertedPatientId: { not: null },
            },
          });

          return {
            id: code.id.toString(),
            code: code.refCode,
            name: code.description || code.refCode,
            isDefault: refCodes.indexOf(code) === 0,
            clickCount,
            intakeCount,
            conversionCount: conversions,
            lastClickAt: lastClick?.createdAt?.toISOString() ?? null,
            createdAt: code.createdAt.toISOString(),
          };
        })
      );

      return { refCodes: refCodeStats };
    });

    const requestHost = request.headers.get('host') || request.headers.get('x-forwarded-host');
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const baseUrl = requestHost ? `${protocol}://${requestHost}` : process.env.NEXT_PUBLIC_APP_URL || '';

    return NextResponse.json({
      baseUrl,
      refCodes: result.refCodes,
      canCreateMore: result.refCodes.length < MAX_REF_CODES,
      maxCodes: MAX_REF_CODES,
    });
  } catch (error) {
    logger.error('[SalesRep RefCodes] GET error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to fetch ref codes' }, { status: 500 });
  }
}

async function handlePost(request: NextRequest, user: AuthUser) {
  try {
    if (user.role !== 'sales_rep' || !user.clinicId) {
      return NextResponse.json({ error: 'Sales rep clinic context required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createRefCodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const clinicId = user.clinicId;
    const salesRepId = user.id;
    const name = parsed.data.name;

    const created = await runWithClinicContext(clinicId, async () => {
      const currentCount = await prisma.salesRepRefCode.count({
        where: { salesRepId, clinicId, isActive: true },
      });
      if (currentCount >= MAX_REF_CODES) {
        throw new Error('MAX_CODES');
      }

      const MAX_ATTEMPTS = 10;
      for (let attempts = 0; attempts < MAX_ATTEMPTS; attempts++) {
        const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
        const refCode = `${name.trim().replace(/\s+/g, '').slice(0, 4).toUpperCase()}${randomPart}`;
        try {
          return await prisma.salesRepRefCode.create({
            data: {
              clinicId,
              salesRepId,
              refCode,
              description: name.trim(),
              isActive: true,
            },
          });
        } catch (err: unknown) {
          if (
            err &&
            typeof err === 'object' &&
            'code' in err &&
            (err as { code: string }).code === 'P2002'
          ) {
            if (attempts === MAX_ATTEMPTS - 1) throw new Error('UNIQUE_FAIL');
            continue;
          }
          throw err;
        }
      }
      throw new Error('UNIQUE_FAIL');
    });

    logger.info('[SalesRep RefCodes] Created', { salesRepId, refCode: created.refCode });
    return NextResponse.json({
      id: created.id.toString(),
      code: created.refCode,
      name: created.description,
      isDefault: false,
      clickCount: 0,
      conversionCount: 0,
      intakeCount: 0,
      createdAt: created.createdAt.toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    if (msg === 'MAX_CODES') {
      return NextResponse.json(
        { error: `Maximum ${MAX_REF_CODES} referral codes allowed` },
        { status: 400 }
      );
    }
    if (msg === 'UNIQUE_FAIL') {
      return NextResponse.json(
        { error: 'Unable to generate a unique code. Try again.' },
        { status: 409 }
      );
    }
    logger.error('[SalesRep RefCodes] POST error', { error: msg });
    return NextResponse.json({ error: 'Failed to create ref code' }, { status: 500 });
  }
}

async function handleDelete(request: NextRequest, user: AuthUser) {
  try {
    if (user.role !== 'sales_rep' || !user.clinicId) {
      return NextResponse.json({ error: 'Sales rep clinic context required' }, { status: 403 });
    }

    const code = request.nextUrl.searchParams.get('code');
    if (!code || !code.trim()) {
      return NextResponse.json({ error: 'Query parameter code is required' }, { status: 400 });
    }

    const clinicId = user.clinicId;
    const salesRepId = user.id;

    await runWithClinicContext(clinicId, async () => {
      await prisma.salesRepRefCode.updateMany({
        where: {
          clinicId,
          salesRepId,
          refCode: code.trim().toUpperCase(),
        },
        data: { isActive: false },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[SalesRep RefCodes] DELETE error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to deactivate ref code' }, { status: 500 });
  }
}

export const GET = withAuth(handleGet, { roles: ['sales_rep'] });
export const POST = withAuth(handlePost, { roles: ['sales_rep'] });
export const DELETE = withAuth(handleDelete, { roles: ['sales_rep'] });
