/**
 * RUN MIGRATION API
 * =================
 * Runs pending database migrations (admin only)
 * 
 * POST /api/admin/run-migration
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { verifyAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

// GET endpoint for easy browser access
export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAuth(req);
    if (!auth || !['SUPER_ADMIN', 'super_admin'].includes(auth.role || '')) {
      return NextResponse.json({ error: 'Unauthorized - Super Admin only' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const migration = searchParams.get('migration');

    if (!migration) {
      return NextResponse.json({
        message: 'Available migrations',
        migrations: ['phone_otp', 'sms_log'],
        usage: 'Add ?migration=sms_log to URL'
      });
    }

    // Run the migration (reuse POST logic)
    const body = { migration };
    return runMigration(body, auth);
  } catch (error: any) {
    logger.error('Migration error', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify admin or super_admin
    const auth = await verifyAuth(req);
    if (!auth || !['SUPER_ADMIN', 'super_admin'].includes(auth.role || '')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    return runMigration(body, auth);
  } catch (error: any) {
    logger.error('Migration error', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function runMigration(body: any, auth: any) {
  try {
    const { migration } = body;

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

    if (migration === 'sms_log') {
      // Create SmsLog table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "SmsLog" (
          "id" SERIAL PRIMARY KEY,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "clinicId" INTEGER,
          "patientId" INTEGER,
          "messageSid" TEXT UNIQUE,
          "fromPhone" TEXT NOT NULL,
          "toPhone" TEXT NOT NULL,
          "body" TEXT NOT NULL,
          "direction" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'sent',
          "error" TEXT,
          "metadata" JSONB
        )
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "SmsLog_patientId_createdAt_idx" 
        ON "SmsLog"("patientId", "createdAt")
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "SmsLog_fromPhone_idx" 
        ON "SmsLog"("fromPhone")
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "SmsLog_toPhone_idx" 
        ON "SmsLog"("toPhone")
      `;

      await prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS "SmsLog_clinicId_idx" 
        ON "SmsLog"("clinicId")
      `;

      logger.info('SmsLog migration completed');

      return NextResponse.json({
        success: true,
        message: 'SmsLog table created successfully',
      });
    }

    return NextResponse.json(
      { error: 'Unknown migration. Available: phone_otp, sms_log' },
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
