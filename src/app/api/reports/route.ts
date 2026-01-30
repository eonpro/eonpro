/**
 * Saved Reports API
 * 
 * GET /api/reports - List saved reports
 * POST /api/reports - Create new report
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getClinicContext } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clinicId = getClinicContext();
    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const reports = await prisma.savedReport.findMany({
      where: { clinicId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return NextResponse.json({
      reports: reports.map(r => ({
        ...r,
        createdByName: r.user ? `${r.user.firstName} ${r.user.lastName}` : 'Unknown',
      })),
    });
  } catch (error) {
    logger.error('Failed to fetch reports', { error });
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clinicId = getClinicContext();
    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, type, config, isScheduled, schedule, recipients } = body;

    if (!name || !type || !config) {
      return NextResponse.json(
        { error: 'name, type, and config are required' },
        { status: 400 }
      );
    }

    const report = await prisma.savedReport.create({
      data: {
        clinicId,
        createdBy: user.id,
        name,
        description,
        type,
        config,
        isScheduled: isScheduled || false,
        schedule,
        recipients: recipients || [],
      },
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    logger.error('Failed to create report', { error });
    return NextResponse.json(
      { error: 'Failed to create report' },
      { status: 500 }
    );
  }
}
