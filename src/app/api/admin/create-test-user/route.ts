/**
 * CREATE TEST USER API
 * ====================
 * Creates a test admin user (protected by init key)
 * 
 * ⚠️ SECURITY: This endpoint is DISABLED in production environments.
 * No environment variable can override this restriction.
 * 
 * POST /api/admin/create-test-user?key=<DB_INIT_KEY>
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    // SECURITY: HARD BLOCK in production - NO EXCEPTIONS
    // This cannot be overridden by any environment variable
    if (process.env.NODE_ENV === 'production') {
      logger.security('BLOCKED: Test user creation attempted in production', {
        ip: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown',
      });
      return NextResponse.json(
        { error: 'This endpoint is permanently disabled in production' },
        { status: 403 }
      );
    }
    
    // Security check - Requires DB_INIT_KEY env var, no fallback
    const expectedKey = process.env.DB_INIT_KEY;
    if (!expectedKey) {
      logger.error('[CREATE-TEST-USER] DB_INIT_KEY not configured');
      return NextResponse.json({ error: 'Endpoint not configured' }, { status: 500 });
    }
    
    const { searchParams } = new URL(req.url);
    const initKey = searchParams.get('key');
    
    if (initKey !== expectedKey) {
      logger.warn('[CREATE-TEST-USER] Invalid init key provided');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { email, firstName, lastName, phone, password, clinicName } = body;

    if (!email || !firstName || !lastName || !password) {
      return NextResponse.json(
        { error: 'Missing required fields: email, firstName, lastName, password' },
        { status: 400 }
      );
    }

    // Find or create clinic
    let clinic = await prisma.clinic.findFirst({
      where: {
        OR: [
          { name: { contains: clinicName || 'EONMEDS', mode: 'insensitive' } },
        ],
      },
    });

    if (!clinic) {
      clinic = await prisma.clinic.create({
        data: {
          name: clinicName || 'EONMEDS',
          subdomain: (clinicName || 'eonmeds').toLowerCase().replace(/\s+/g, '-'),
          adminEmail: email,
          status: 'ACTIVE',
          settings: {},
          features: {},
          integrations: {},
        },
      });
      logger.info('Created clinic', { clinicId: clinic.id, name: clinic.name });
    }

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    const passwordHash = await bcrypt.hash(password, 12);

    if (user) {
      // Update existing user
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firstName,
          lastName,
          passwordHash,
          clinicId: clinic.id,
          status: 'ACTIVE',
        },
      });
      logger.info('Updated existing user', { userId: user.id, email: user.email });
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          firstName,
          lastName,
          passwordHash,
          role: 'ADMIN',
          status: 'ACTIVE',
          clinicId: clinic.id,
        },
      });
      logger.info('Created new user', { userId: user.id, email: user.email });
    }

    // Handle phone number - create or update provider
    if (phone) {
      const formattedPhone = phone.replace(/\D/g, '');
      const fullPhone = formattedPhone.length === 10 ? `+1${formattedPhone}` : `+${formattedPhone}`;

      let provider = await prisma.provider.findFirst({
        where: { email: email.toLowerCase() },
      });

      if (provider) {
        provider = await prisma.provider.update({
          where: { id: provider.id },
          data: {
            phone: fullPhone,
            firstName,
            lastName,
            clinicId: clinic.id,
          },
        });
      } else {
        provider = await prisma.provider.create({
          data: {
            firstName,
            lastName,
            email: email.toLowerCase(),
            phone: fullPhone,
            npi: 'PENDING_' + Date.now(),
            clinicId: clinic.id,
          },
        });
      }

      // Link provider to user
      await prisma.user.update({
        where: { id: user.id },
        data: { providerId: provider.id },
      });

      logger.info('Created/updated provider with phone', { providerId: provider.id, phone: fullPhone });
    }

    return NextResponse.json({
      success: true,
      message: 'User created/updated successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        clinicId: user.clinicId,
      },
      clinic: {
        id: clinic.id,
        name: clinic.name,
      },
      loginInfo: {
        email: user.email,
        password: password,
        phone: phone || 'Not set',
      },
    });

  } catch (error: any) {
    logger.error('Error creating test user', { error: error.message });
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
