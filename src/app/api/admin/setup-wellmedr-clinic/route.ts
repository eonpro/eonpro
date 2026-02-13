/**
 * One-time setup endpoint to create Wellmedr clinic
 *
 * POST /api/admin/setup-wellmedr-clinic
 * Header: x-admin-secret: <ADMIN_SECRET from env>
 *
 * DELETE THIS ENDPOINT AFTER USE
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  // Simple auth check
  const adminSecret = process.env.ADMIN_SECRET || process.env.WELLMEDR_INTAKE_WEBHOOK_SECRET;
  const providedSecret = req.headers.get('x-admin-secret') || req.headers.get('x-webhook-secret');

  if (!adminSecret || providedSecret !== adminSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if clinic already exists
    const existing = await prisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: 'wellmedr' },
          { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
          { name: { contains: 'Wellmedr', mode: 'insensitive' } },
        ],
      },
    });

    if (existing) {
      return Response.json({
        success: true,
        message: 'Wellmedr clinic already exists',
        clinic: {
          id: existing.id,
          name: existing.name,
          subdomain: existing.subdomain,
        },
        action: 'none',
      });
    }

    // Create the clinic
    const clinic = await prisma.clinic.create({
      data: {
        name: 'Wellmedr',
        subdomain: 'wellmedr',
        adminEmail: 'admin@wellmedr.com',
        settings: {
          intakeUrl: 'https://intake.wellmedr.com',
          specialty: 'GLP-1 Weight Loss',
          webhookEnabled: true,
        },
        features: {},
        integrations: {},
      },
    });

    // Create the patient counter for this clinic
    await prisma.patientCounter.create({
      data: {
        clinicId: clinic.id,
        current: 0,
      },
    });

    return Response.json({
      success: true,
      message: 'Wellmedr clinic created successfully',
      clinic: {
        id: clinic.id,
        name: clinic.name,
        subdomain: clinic.subdomain,
      },
      action: 'created',
      note: 'Set WELLMEDR_CLINIC_ID env var to ' + clinic.id,
    });
  } catch (error) {
    logger.error('Error setting up Wellmedr clinic', { error: error instanceof Error ? error.message : String(error) });
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return Response.json({
    endpoint: '/api/admin/setup-wellmedr-clinic',
    method: 'POST',
    headers: {
      'x-admin-secret': 'Your WELLMEDR_INTAKE_WEBHOOK_SECRET value',
    },
    note: 'DELETE THIS ENDPOINT AFTER USE',
  });
}
