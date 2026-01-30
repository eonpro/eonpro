import * as crypto from 'crypto';

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  // SECURITY: Block in production - this is a development-only endpoint
  if (process.env.NODE_ENV === 'production') {
    logger.security('[INIT-DB] Blocked attempt in production');
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  // Security check - Requires DB_INIT_KEY env var, no fallback
  const expectedKey = process.env.DB_INIT_KEY;
  if (!expectedKey) {
    logger.error('[INIT-DB] DB_INIT_KEY not configured');
    return NextResponse.json({ error: 'Endpoint not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const initKey = searchParams.get('key');

  if (initKey !== expectedKey) {
    logger.warn('[INIT-DB] Invalid init key provided');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Use singleton PrismaClient from lib/db

  try {
    logger.db('INIT', 'database');

    // Test connection
    await prisma.$connect();
    logger.db('CONNECT', 'database');

    // Check existing tables
    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ` as { table_name: string }[];

    logger.db('SELECT', 'information_schema.tables', { count: tables.length });

    // Create admin user if no users exist
    const userCount = await prisma.user.count();
    logger.db('COUNT', 'users', { count: userCount });

    let generatedPassword: string | null = null;
    if (userCount === 0) {
      // SECURITY: Generate a random secure password instead of hardcoded one
      generatedPassword = crypto.randomBytes(16).toString('base64').slice(0, 20);
      const passwordHash = await bcrypt.hash(generatedPassword, 10);

      const admin = await prisma.user.create({
        data: {
          email: 'admin@eonpro.com',
          firstName: 'Admin',
          lastName: 'User',
          passwordHash,
          role: 'ADMIN',
        }
      });
      logger.db('INSERT', 'users', { email: admin.email });
      logger.info('[INIT-DB] Generated secure admin password - save it now, it will not be shown again');
    }

    // Create test clinic if none exists
    const clinicCount = await prisma.clinic.count();
    if (clinicCount === 0) {
      const clinic = await prisma.clinic.create({
        data: {
          name: 'EONPRO Main Clinic',
          subdomain: 'main',
          adminEmail: 'admin@eonpro.com',
          status: 'ACTIVE',
          settings: {},
          features: {},
          integrations: {},
        }
      });
      logger.db('INSERT', 'clinics', { name: clinic.name });
    }

    // Create PhoneOtp table for SMS authentication
    try {
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
      logger.db('CREATE', 'PhoneOtp table');
    } catch (phoneOtpError: unknown) {
      const errorMsg = phoneOtpError instanceof Error ? phoneOtpError.message : 'Unknown error';
      logger.warn('[INIT-DB] PhoneOtp table creation warning:', { error: errorMsg });
    }

    return NextResponse.json({
      success: true,
      message: 'Database initialized successfully!',
      stats: {
        tables: tables.length,
        users: userCount > 0 ? userCount : 1,
        clinics: clinicCount > 0 ? clinicCount : 1,
      },
      loginInfo: {
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://eonpro-kappa.vercel.app'}/login`,
        email: 'admin@eonpro.com',
        // SECURITY: Only show password once when newly created
        password: generatedPassword || '(existing user - password not changed)',
        note: generatedPassword ? 'IMPORTANT: Save this password now! It will not be shown again.' : undefined,
        demoUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://eonpro-kappa.vercel.app'}/demo/login`
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.constructor.name : 'UnknownError';

    logger.error('[INIT-DB] Database initialization failed:', error);

    // Check if it's a connection issue
    if (errorMessage.includes("Can't reach database")) {
      return NextResponse.json({
        success: false,
        error: 'Database connection failed',
        troubleshooting: [
          '1. Check DATABASE_URL is correct in Vercel environment variables',
          '2. Verify AWS RDS Security Group allows Vercel Static IPs',
          '3. Ensure RDS instance has "Public access" enabled',
          '4. Redeploy after updating DATABASE_URL',
        ],
      }, { status: 500 });
    }

    return NextResponse.json({
      success: false,
      error: errorMessage,
      type: errorName
    }, { status: 500 });
  }
  // Note: Don't disconnect singleton PrismaClient - it's managed globally
}
