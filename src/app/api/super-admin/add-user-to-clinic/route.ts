/**
 * Add User to Clinic
 * POST /api/super-admin/add-user-to-clinic
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma } from '@/lib/db';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

async function handler(req: NextRequest) {
  try {
    const { userEmail, clinicId, role = 'provider', isPrimary = false } = await req.json();

    if (!userEmail || !clinicId) {
      return NextResponse.json({ error: 'userEmail and clinicId required' }, { status: 400 });
    }

    // Find user
    const user = await basePrisma.user.findFirst({
      where: { email: { equals: userEmail, mode: 'insensitive' } },
    });

    if (!user) {
      return NextResponse.json({ error: `User not found: ${userEmail}` }, { status: 404 });
    }

    // Find clinic
    const clinic = await basePrisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      return NextResponse.json({ error: `Clinic not found: ${clinicId}` }, { status: 404 });
    }

    // Check if already exists
    const existing = await basePrisma.userClinic.findFirst({
      where: { userId: user.id, clinicId: clinic.id },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        message: 'User already has access to this clinic',
        userClinic: existing,
      });
    }

    // Create UserClinic entry
    const userClinic = await basePrisma.userClinic.create({
      data: {
        userId: user.id,
        clinicId: clinic.id,
        role: role.toUpperCase(),
        isPrimary,
        isActive: true,
      },
    });

    logger.info(`[ADD-USER-CLINIC] Added ${userEmail} to ${clinic.name} as ${role}`);

    return NextResponse.json({
      success: true,
      message: `Added ${user.email} to ${clinic.name} as ${role}`,
      userClinic,
    });
  } catch (error: any) {
    logger.error('[ADD-USER-CLINIC] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const POST = withSuperAdminAuth(handler);
