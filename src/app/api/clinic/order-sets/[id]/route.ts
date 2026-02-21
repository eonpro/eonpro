import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const updateOrderSetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        medicationKey: z.string().min(1),
        sig: z.string().optional().default(''),
        quantity: z.string().optional().default('1'),
        refills: z.string().optional().default('0'),
        daysSupply: z.coerce.number().int().min(1).max(365).default(30),
        sortOrder: z.coerce.number().int().min(0).default(0),
      })
    )
    .min(1)
    .optional(),
});

function extractId(req: NextRequest): number | null {
  const segments = req.nextUrl.pathname.split('/');
  const idStr = segments[segments.length - 1];
  const id = parseInt(idStr, 10);
  return isNaN(id) ? null : id;
}

async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const id = extractId(req);
    if (!id) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    const orderSet = await prisma.rxOrderSet.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!orderSet || !orderSet.isActive) {
      return NextResponse.json({ error: 'Order set not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && orderSet.clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({ orderSet });
  } catch (err) {
    logger.error('[ORDER_SETS/GET_ONE] Failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to fetch order set' }, { status: 500 });
  }
}

async function handlePut(req: NextRequest, user: AuthUser) {
  try {
    const id = extractId(req);
    if (!id) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    if (!['admin', 'provider', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const existing = await prisma.rxOrderSet.findUnique({ where: { id } });
    if (!existing || !existing.isActive) {
      return NextResponse.json({ error: 'Order set not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && existing.clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await req.json();
    const result = updateOrderSetSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { name, description, items } = result.data;

    const orderSet = await prisma.$transaction(async (tx) => {
      if (items) {
        await tx.rxOrderSetItem.deleteMany({ where: { orderSetId: id } });
        await tx.rxOrderSetItem.createMany({
          data: items.map((item, idx) => ({
            orderSetId: id,
            medicationKey: item.medicationKey,
            sig: item.sig ?? '',
            quantity: item.quantity || '1',
            refills: item.refills ?? '0',
            daysSupply: item.daysSupply ?? 30,
            sortOrder: item.sortOrder ?? idx,
          })),
        });
      }

      return tx.rxOrderSet.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    logger.info('[ORDER_SETS/PUT] Updated', { orderSetId: id, userId: user.id });

    return NextResponse.json({ orderSet });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[ORDER_SETS/PUT] Failed', { error: message });
    const body: { error: string; details?: string } = { error: 'Failed to update order set' };
    if (process.env.NODE_ENV === 'development') {
      body.details = message;
    }
    return NextResponse.json(body, { status: 500 });
  }
}

async function handleDelete(req: NextRequest, user: AuthUser) {
  try {
    const id = extractId(req);
    if (!id) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

    if (!['admin', 'provider', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const existing = await prisma.rxOrderSet.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Order set not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && existing.clinicId !== user.clinicId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    await prisma.rxOrderSet.update({
      where: { id },
      data: { isActive: false },
    });

    logger.info('[ORDER_SETS/DELETE] Soft-deleted', { orderSetId: id, userId: user.id });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[ORDER_SETS/DELETE] Failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to delete order set' }, { status: 500 });
  }
}

export const GET = withClinicalAuth(handleGet);
export const PUT = withClinicalAuth(handlePut);
export const DELETE = withClinicalAuth(handleDelete);
