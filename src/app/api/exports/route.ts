/**
 * Exports API
 * 
 * POST /api/exports - Create export job
 * GET /api/exports - List recent exports
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getClinicContext, withClinicContext } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { ExportService } from '@/services/export/exportService';

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
    const { reportType, format, dateRange, metrics, filters } = body;

    if (!reportType || !format) {
      return NextResponse.json(
        { error: 'reportType and format are required' },
        { status: 400 }
      );
    }

    // Parse date range
    const start = dateRange?.start ? new Date(dateRange.start) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = dateRange?.end ? new Date(dateRange.end) : new Date();

    // Generate export
    const result = await ExportService.generateExport(clinicId, {
      reportType,
      format,
      dateRange: { start, end },
      metrics,
      filters,
    });

    // Return file as response
    return new NextResponse(result.buffer, {
      headers: {
        'Content-Type': result.mimeType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': result.buffer.length.toString(),
      },
    });
  } catch (error) {
    logger.error('Failed to generate export', { error });
    return NextResponse.json(
      { error: 'Failed to generate export' },
      { status: 500 }
    );
  }
}

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

    // Get recent exports
    const exports = await prisma.reportExport.findMany({
      where: { clinicId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        reportType: true,
        format: true,
        status: true,
        fileUrl: true,
        fileName: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return NextResponse.json({ exports });
  } catch (error) {
    logger.error('Failed to fetch exports', { error });
    return NextResponse.json(
      { error: 'Failed to fetch exports' },
      { status: 500 }
    );
  }
}
