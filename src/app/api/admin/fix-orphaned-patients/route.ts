import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// Type for orphaned patient select result
interface OrphanedPatient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  tags?: unknown;
  createdAt?: Date;
}

/**
 * Fix Orphaned Patients - Assign to EONMEDS clinic
 *
 * POST /api/admin/fix-orphaned-patients
 *
 * Requires X-Webhook-Secret header for authentication
 */

export async function POST(req: NextRequest) {
  const configuredSecret = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;
  const providedSecret = req.headers.get('x-webhook-secret');

  if (!configuredSecret || providedSecret !== configuredSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Find EONMEDS clinic (use select for backwards compatibility)
    const eonmedsClinic = await prisma.clinic.findFirst({
      where: {
        OR: [{ subdomain: 'eonmeds' }, { name: { contains: 'EONMEDS', mode: 'insensitive' } }],
      },
      select: { id: true, name: true, subdomain: true },
    });

    if (!eonmedsClinic) {
      return NextResponse.json({ error: 'EONMEDS clinic not found' }, { status: 404 });
    }

    // Find all orphaned patients (clinicId is null)
    const orphanedPatients = await prisma.patient.findMany({
      where: { clinicId: null },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (orphanedPatients.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No orphaned patients found',
        fixed: 0,
      });
    }

    // Update all orphaned patients to EONMEDS
    const result = await prisma.patient.updateMany({
      where: { clinicId: null },
      data: {
        clinicId: eonmedsClinic.id,
        // Add eonmeds tag if not present (can't do this in updateMany, so we'll do it separately)
      },
    });

    // Update tags for each patient
    for (const patient of orphanedPatients) {
      const currentPatient = await prisma.patient.findUnique({
        where: { id: patient.id },
        select: { tags: true },
      });

      const currentTags = currentPatient?.tags || [];
      if (!currentTags.includes('eonmeds')) {
        await prisma.patient.update({
          where: { id: patient.id },
          data: { tags: [...currentTags, 'eonmeds', 'migrated'] },
        });
      }
    }

    // Log the fix (find or create system user for audit)
    let systemUser = await prisma.user.findFirst({
      where: { email: 'system@eonpro.io' },
    });

    if (!systemUser) {
      // Use first admin user if no system user exists
      systemUser = await prisma.user.findFirst({
        where: { role: 'super_admin' },
      });
    }

    if (systemUser) {
      await prisma.auditLog.create({
        data: {
          action: 'PATIENTS_MIGRATED_TO_CLINIC',
          entityType: 'Patient',
          entityId: 0,
          userId: systemUser.id,
          details: `Fixed ${result.count} orphaned patients`,
          diff: {
            patients: orphanedPatients.map((p: OrphanedPatient) => ({
              id: p.id,
              name: `${p.firstName} ${p.lastName}`,
              email: p.email,
            })),
            assignedTo: {
              clinicId: eonmedsClinic.id,
              clinicName: eonmedsClinic.name,
            },
          },
          ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
        },
      });
    }

    logger.info('[FIX ORPHANED] Fixed orphaned patients', {
      count: result.count,
      clinicId: eonmedsClinic.id,
    });

    return NextResponse.json({
      success: true,
      message: `Fixed ${result.count} orphaned patients`,
      fixed: result.count,
      patients: orphanedPatients.map((p: OrphanedPatient) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        email: p.email,
      })),
      assignedTo: {
        clinicId: eonmedsClinic.id,
        clinicName: eonmedsClinic.name,
      },
    });
  } catch (error) {
    logger.error('[FIX ORPHANED] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fix orphaned patients',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// GET - Show orphaned patients without fixing
export async function GET(req: NextRequest) {
  const configuredSecret = process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;
  const providedSecret = req.headers.get('x-webhook-secret');

  if (!configuredSecret || providedSecret !== configuredSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const orphanedPatients = await prisma.patient.findMany({
      where: { clinicId: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        tags: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      orphanedCount: orphanedPatients.length,
      patients: orphanedPatients.map((p: OrphanedPatient) => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        email: p.email,
        tags: p.tags,
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch orphaned patients',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
