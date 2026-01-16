/**
 * RUN MIGRATION API
 * =================
 * Runs pending database migrations (admin only)
 * 
 * POST /api/admin/run-migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    // Verify admin or super_admin
    const auth = await verifyAuth(req);
    if (!auth || !['SUPER_ADMIN', 'super_admin'].includes(auth.role || '')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { migration } = await req.json();

    // Only allow specific migrations
    if (migration === 'phone_otp') {
      // Create PhoneOtp table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "PhoneOtp" (
          "id" SERIAL PRIMARY KEY,
          "phone" TEXT NOT NULL,
          "code" TEXT NOT NULL,
          "expiresAt" TIMESTAMP(3) NOT NULL,
          "used" BOOLEAN NOT NULL DEFAULT false,
          "usedAt" TIMESTAMP(3),
          "userId" INTEGER,
          "patientId" INTEGER,
          "ipAddress" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "PhoneOtp_phone_code_expiresAt_idx" 
        ON "PhoneOtp"("phone", "code", "expiresAt")
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "PhoneOtp_phone_idx" 
        ON "PhoneOtp"("phone")
      `;

      logger.info('PhoneOtp migration completed');

      return NextResponse.json({
        success: true,
        message: 'PhoneOtp table created successfully',
      });
    }

    return NextResponse.json(
      { error: 'Unknown migration' },
      { status: 400 }
    );

  } catch (error: any) {
    logger.error('Migration error', { error: error.message });
    return NextResponse.json(
      { error: error.message || 'Migration failed' },
      { status: 500 }
    );
  }
}
