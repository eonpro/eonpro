/**
 * Admin Saved Reports API
 *
 * GET  - List saved reports for the clinic
 * POST - Create a new saved report
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const createReportSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  type: z.enum(['REVENUE', 'PATIENTS', 'PAYOUTS', 'RECONCILIATION', 'SUBSCRIPTIONS', 'CUSTOM']).default('CUSTOM'),
  config: z.object({
    metrics: z.array(z.string()).min(1),
    chartType: z.string().optional(),
    dateRange: z.record(z.unknown()).optional(),
    groupBy: z.string().optional(),
  }),
  isPublic: z.boolean().optional(),
  isScheduled: z.boolean().optional(),
  schedule: z.string().optional(),
  recipients: z.array(z.string().email()).optional(),
});

async function handleGet(req: NextRequest, user: any): Promise<Response> {
  try {
    const clinicFilter =
      user.role === 'super_admin' ? {} : user.clinicId ? { clinicId: user.clinicId } : {};

    const reports = await prisma.savedReport.findMany({
      where: {
        ...clinicFilter,
        OR: [
          { createdBy: user.id },
          { isPublic: true },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        config: true,
        isPublic: true,
        isScheduled: true,
        schedule: true,
        lastRunAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    return NextResponse.json({ reports });
  } catch (error) {
    logger.error('[Reports] Failed to list reports', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
  }
}

async function handlePost(req: NextRequest, user: any): Promise<Response> {
  try {
    const body = await req.json();
    const result = createReportSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const data = result.data;

    if (!user.clinicId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const report = await prisma.savedReport.create({
      data: {
        clinicId: user.clinicId,
        createdBy: user.id,
        name: data.name,
        description: data.description,
        type: data.type,
        config: data.config as unknown as Prisma.InputJsonValue,
        isPublic: data.isPublic ?? false,
        isScheduled: data.isScheduled ?? false,
        schedule: data.schedule,
        recipients: data.recipients ?? [],
      },
    });

    logger.info('[Reports] Custom report saved', {
      reportId: report.id,
      clinicId: user.clinicId,
      userId: user.id,
    });

    return NextResponse.json({ success: true, report: { id: report.id, name: report.name } }, { status: 201 });
  } catch (error) {
    logger.error('[Reports] Failed to create report', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to save report' }, { status: 500 });
  }
}

export const GET = withAdminAuth(handleGet);
export const POST = withAdminAuth(handlePost);
