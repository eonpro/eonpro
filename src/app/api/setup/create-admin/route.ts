/**
 * Secure endpoint to create super admin user
 * Requires ADMIN_SETUP_KEY environment variable
 *
 * Usage: POST /api/setup/create-admin
 * Body: { key: "your-setup-key", email: "admin@example.com", password: "secure-password" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { key, email, password, firstName = 'Super', lastName = 'Admin' } = body;

    // Validate setup key
    const setupKey = process.env.ADMIN_SETUP_KEY;
    if (!setupKey) {
      return NextResponse.json({ error: 'Setup not configured' }, { status: 500 });
    }

    if (key !== setupKey) {
      logger.warn('[CREATE-ADMIN] Invalid setup key attempt');
      return NextResponse.json({ error: 'Invalid setup key' }, { status: 401 });
    }

    // Validate input
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Use singleton PrismaClient from lib/db
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      // Update existing user to super admin
      const updated = await prisma.user.update({
        where: { email: email.toLowerCase() },
        data: {
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          passwordHash: await bcrypt.hash(password, 12),
        },
      });

      return NextResponse.json({
        success: true,
        message: 'User updated to Super Admin',
        userId: updated.id,
      });
    }

    // Ensure a clinic exists (use select for backwards compatibility)
    let clinic = await prisma.clinic.findFirst({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, subdomain: true },
    });

    if (!clinic) {
      clinic = await prisma.clinic.create({
        data: {
          name: 'EONPRO',
          subdomain: 'app',
          adminEmail: email,
          status: 'ACTIVE',
          settings: {},
          features: {},
          integrations: {},
        },
        select: { id: true, name: true, subdomain: true },
      });
    }

    // Create super admin user
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        role: 'SUPER_ADMIN',
        clinicId: clinic.id,
        status: 'ACTIVE',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Super Admin created successfully',
      userId: user.id,
      clinicId: clinic.id,
    });
  } catch (error) {
    logger.error('[CREATE-ADMIN] Setup error:', error);
    return NextResponse.json(
      { error: 'Setup failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
  // Note: Don't disconnect singleton PrismaClient - it's managed globally
}
