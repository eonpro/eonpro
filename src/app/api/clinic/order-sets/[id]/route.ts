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
        medicationKey: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1)),
        sig: z.union([z.string(), z.number()]).optional().default('').transform((v) => (v == null || v === '' ? '' : String(v))),
        quantity: z.union([z.string(), z.number()]).optional().default('1').transform((v) => String(v ?? '1')),
        refills: z.union([z.string(), z.number()]).optional().default('0').transform((v) => String(v ?? '0')),
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

    let body: unknown;
    try {
      body = await req.json();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid JSON body';
      logger.error('[ORDER_SETS/PUT] Invalid body', { error: msg });
      return NextResponse.json(
        { error: 'Invalid request body', details: msg },
        { status: 400 }
      );
    }

    const result = updateOrderSetSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { name, description, items } = result.data;

    const orderSet = await prisma.$transaction(async (tx) => {
      if (items && items.length > 0) {
        await tx.rxOrderSetItem.deleteMany({ where: { orderSetId: id } });
        const rows = items.map((item, idx) => ({
          orderSetId: id,
          medicationKey: String(item.medicationKey).slice(0, 500),
          sig: String(item.sig ?? '').slice(0, 2000),
          quantity: String(item.quantity ?? '1').slice(0, 50),
          refills: String(item.refills ?? '0').slice(0, 50),
          daysSupply: Math.min(365, Math.max(1, Number(item.daysSupply) || 30)),
          sortOrder: Math.max(0, Number(item.sortOrder) ?? idx),
        }));
        try {
          await tx.rxOrderSetItem.createMany({ data: rows });
        } catch (createErr) {
          const createMsg = createErr instanceof Error ? createErr.message : String(createErr);
          logger.error('[ORDER_SETS/PUT] createMany failed', { error: createMsg, rowCount: rows.length });
          throw createErr;
        }
      }

      const updateData: { name?: string; description?: string | null } = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description ?? null;

      return tx.rxOrderSet.update({
        where: { id },
        data: updateData,
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    logger.info('[ORDER_SETS/PUT] Updated', { orderSetId: id, userId: user.id });

    return NextResponse.json({ orderSet });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[ORDER_SETS/PUT] Failed', { error: message });
    return NextResponse.json(
      { error: 'Failed to update order set', details: message },
      { status: 500 }
    );
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
