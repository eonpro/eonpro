import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const createOrderSetSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        medicationKey: z.string().min(1),
        sig: z.string().min(1),
        quantity: z.string().min(1),
        refills: z.string(),
        daysSupply: z.number().int().min(1).max(365).default(30),
        sortOrder: z.number().int().min(0).default(0),
      })
    )
    .min(1, 'At least one medication is required'),
});

async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const clinicId = user.clinicId;
    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const orderSets = await prisma.rxOrderSet.findMany({
      where: {
        ...(clinicId ? { clinicId } : {}),
        isActive: true,
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ orderSets });
  } catch (err) {
    logger.error('[ORDER_SETS/GET] Failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to fetch order sets' }, { status: 500 });
  }
}

async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const clinicId = user.clinicId;
    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    if (!['admin', 'provider', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Not authorized to create order sets' }, { status: 403 });
    }

    const body = await req.json();
    const result = createOrderSetSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { name, description, items } = result.data;

    const orderSet = await prisma.rxOrderSet.create({
      data: {
        clinicId,
        name,
        description: description || null,
        createdById: user.id,
        items: {
          create: items.map((item, idx) => ({
            medicationKey: item.medicationKey,
            sig: item.sig,
            quantity: item.quantity,
            refills: item.refills,
            daysSupply: item.daysSupply,
            sortOrder: item.sortOrder ?? idx,
          })),
        },
      },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    logger.info('[ORDER_SETS/POST] Created', {
      orderSetId: orderSet.id,
      clinicId,
      userId: user.id,
      itemCount: items.length,
    });

    return NextResponse.json({ orderSet }, { status: 201 });
  } catch (err) {
    logger.error('[ORDER_SETS/POST] Failed', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Failed to create order set' }, { status: 500 });
  }
}

export const GET = withClinicalAuth(handleGet);
export const POST = withClinicalAuth(handlePost);
