import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/webhook-status - Check recent webhook activity for EONMEDS
 * Protected by admin secret
 */
export async function GET(req: NextRequest) {
  try {
    // Verify admin secret
    const secret = req.headers.get('x-setup-secret');
    const configuredSecret =
      process.env.ADMIN_SETUP_SECRET || process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;

    if (!configuredSecret || secret !== configuredSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find EONMEDS clinic
    const eonmeds = await prisma.clinic.findFirst({
      where: {
        OR: [{ subdomain: 'eonmeds' }, { name: { contains: 'EONMEDS', mode: 'insensitive' } }],
      },
    });

    if (!eonmeds) {
      return NextResponse.json({ error: 'EONMEDS clinic not found' }, { status: 404 });
    }

    // Get recent patients in EONMEDS clinic
    const recentPatients = await prisma.patient.findMany({
      where: { clinicId: eonmeds.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        patientId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        source: true,
        createdAt: true,
        tags: true,
        notes: true,
      },
    });

    // Get recent intake documents
    const recentDocuments = await prisma.patientDocument.findMany({
      where: {
        clinicId: eonmeds.id,
        category: 'MEDICAL_INTAKE_FORM',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        patientId: true,
        filename: true,
        source: true,
        sourceSubmissionId: true,
        createdAt: true,
      },
    });

    // Get recent audit logs for intake
    const recentAuditLogs = await prisma.auditLog.findMany({
      where: {
        action: 'PATIENT_INTAKE_RECEIVED',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        action: true,
        resourceId: true,
        details: true,
        createdAt: true,
        ipAddress: true,
      },
    });

    // Calculate stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const patientsToday = recentPatients.filter(
      (p: { createdAt: Date }) => p.createdAt >= today
    ).length;
    const documentsToday = recentDocuments.filter(
      (d: { createdAt: Date }) => d.createdAt >= today
    ).length;

    logger.info('[WEBHOOK STATUS] Admin checked webhook status', {
      clinicId: eonmeds.id,
      totalPatients: recentPatients.length,
      patientsToday,
    });

    return NextResponse.json({
      clinic: {
        id: eonmeds.id,
        name: eonmeds.name,
        subdomain: eonmeds.subdomain,
      },
      summary: {
        patientsToday,
        documentsToday,
        totalRecentPatients: recentPatients.length,
        totalRecentDocuments: recentDocuments.length,
      },
      recentPatients: recentPatients.map((p: any) => ({
        ...p,
        createdAgo: getTimeAgo(p.createdAt),
      })),
      recentDocuments: recentDocuments.map((d: any) => ({
        ...d,
        createdAgo: getTimeAgo(d.createdAt),
      })),
      recentAuditLogs: recentAuditLogs.map((log: any) => {
        let parsedDiff = null;
        try {
          parsedDiff = typeof log.diff === 'string' ? JSON.parse(log.diff) : log.diff;
        } catch {
          parsedDiff = log.diff;
        }
        return {
          ...log,
          diff: parsedDiff,
          createdAgo: getTimeAgo(log.createdAt),
        };
      }),
      checkedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    logger.error('[WEBHOOK STATUS] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
