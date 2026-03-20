/**
 * Provider Date Override API
 *
 * CRUD for date-specific availability overrides that take precedence
 * over the recurring weekly template.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, type AuthOptions } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { setProviderDateOverrides } from '@/lib/scheduling/scheduling.service';
import { prisma } from '@/lib/db';
import { parseDateET } from '@/lib/utils/timezone';

const overrideRoles: AuthOptions = {
  roles: ['super_admin', 'admin', 'provider', 'staff', 'sales_rep'],
};

const setOverrideSchema = z.object({
  providerId: z.number(),
  clinicId: z.number().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isUnavailable: z.boolean().optional(),
  notes: z.string().optional(),
  blocks: z
    .array(
      z.object({
        startTime: z.string().regex(/^\d{2}:\d{2}$/),
        endTime: z.string().regex(/^\d{2}:\d{2}$/),
      })
    )
    .optional()
    .default([]),
});

/**
 * GET /api/scheduling/availability/overrides
 * Get date overrides for a provider within a date range.
 */
export const GET = withAuth(async (req: NextRequest, user) => {
  try {
    const searchParams = req.nextUrl.searchParams;
    const providerId = searchParams.get('providerId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!providerId) {
      return NextResponse.json({ error: 'providerId is required' }, { status: 400 });
    }

    const where: any = {
      providerId: parseInt(providerId, 10),
    };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const resolvedClinicId =
      user.role === 'super_admin' ? undefined : (user.clinicId ?? undefined);
    if (resolvedClinicId) {
      where.OR = [{ clinicId: resolvedClinicId }, { clinicId: null }];
    }

    const overrides = await prisma.providerDateOverride.findMany({
      where,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    return NextResponse.json({ overrides });
  } catch (error) {
    logger.error('Failed to get date overrides', { error });
    return NextResponse.json({ error: 'Failed to get date overrides' }, { status: 500 });
  }
}, overrideRoles);

/**
 * POST /api/scheduling/availability/overrides
 * Set/replace date overrides for a specific date.
 */
export const POST = withAuth(async (req: NextRequest, user) => {
  try {
    const body = await req.json();
    const parsed = setOverrideSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Validate blocks: startTime must be before endTime
    for (const block of parsed.data.blocks) {
      if (block.startTime >= block.endTime) {
        return NextResponse.json(
          { error: `Invalid block: ${block.startTime} must be before ${block.endTime}` },
          { status: 400 }
        );
      }
    }

    const clinicId =
      user.role === 'super_admin' ? parsed.data.clinicId : (user.clinicId ?? undefined);

    const result = await setProviderDateOverrides(
      parsed.data.providerId,
      parseDateET(parsed.data.date),
      parsed.data.blocks,
      {
        clinicId,
        isUnavailable: parsed.data.isUnavailable,
        notes: parsed.data.notes,
      }
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ overrides: result.overrides }, { status: 201 });
  } catch (error) {
    logger.error('Failed to set date overrides', { error });
    return NextResponse.json({ error: 'Failed to set date overrides' }, { status: 500 });
  }
}, overrideRoles);

/**
 * DELETE /api/scheduling/availability/overrides
 * Remove all overrides for a specific date (reverts to recurring template).
 */
export const DELETE = withAuth(async (req: NextRequest, user) => {
  try {
    const searchParams = req.nextUrl.searchParams;
    const providerId = searchParams.get('providerId');
    const date = searchParams.get('date');

    if (!providerId || !date) {
      return NextResponse.json(
        { error: 'providerId and date are required' },
        { status: 400 }
      );
    }

    const dateOnly = parseDateET(date);
    const resolvedClinicId =
      user.role === 'super_admin' ? undefined : (user.clinicId ?? undefined);

    await prisma.providerDateOverride.deleteMany({
      where: {
        providerId: parseInt(providerId, 10),
        date: dateOnly,
        ...(resolvedClinicId ? { clinicId: resolvedClinicId } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete date overrides', { error });
    return NextResponse.json({ error: 'Failed to delete date overrides' }, { status: 500 });
  }
}, overrideRoles);
