/**
 * Setup Wellmedr Lifefile Credentials
 * POST /api/super-admin/setup-wellmedr
 * Super Admin only
 *
 * SECURITY: All credentials must be provided via environment variables
 * Required env vars:
 *   - WELLMEDR_LIFEFILE_BASE_URL
 *   - WELLMEDR_LIFEFILE_USERNAME
 *   - WELLMEDR_LIFEFILE_PASSWORD
 *   - WELLMEDR_LIFEFILE_VENDOR_ID
 *   - WELLMEDR_LIFEFILE_PRACTICE_ID
 *   - WELLMEDR_LIFEFILE_LOCATION_ID
 *   - WELLMEDR_LIFEFILE_NETWORK_ID
 *   - WELLMEDR_LIFEFILE_PRACTICE_NAME
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

async function handler(req: NextRequest) {
  try {
    logger.info('[SETUP-WELLMEDR] Starting Wellmedr Lifefile configuration...');

    // SECURITY: Validate all required environment variables
    const requiredEnvVars = {
      WELLMEDR_LIFEFILE_BASE_URL: process.env.WELLMEDR_LIFEFILE_BASE_URL,
      WELLMEDR_LIFEFILE_USERNAME: process.env.WELLMEDR_LIFEFILE_USERNAME,
      WELLMEDR_LIFEFILE_PASSWORD: process.env.WELLMEDR_LIFEFILE_PASSWORD,
      WELLMEDR_LIFEFILE_VENDOR_ID: process.env.WELLMEDR_LIFEFILE_VENDOR_ID,
      WELLMEDR_LIFEFILE_PRACTICE_ID: process.env.WELLMEDR_LIFEFILE_PRACTICE_ID,
      WELLMEDR_LIFEFILE_LOCATION_ID: process.env.WELLMEDR_LIFEFILE_LOCATION_ID,
      WELLMEDR_LIFEFILE_NETWORK_ID: process.env.WELLMEDR_LIFEFILE_NETWORK_ID,
      WELLMEDR_LIFEFILE_PRACTICE_NAME: process.env.WELLMEDR_LIFEFILE_PRACTICE_NAME,
    };

    const missingVars = Object.entries(requiredEnvVars)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      logger.error('[SETUP-WELLMEDR] Missing required environment variables', { missingVars });
      return NextResponse.json({
        success: false,
        error: 'Missing required environment variables',
        missingVars,
        hint: 'Configure these variables in your environment before running setup'
      }, { status: 400 });
    }

    // Find Wellmedr clinic
    const wellmedr = await prisma.clinic.findFirst({
      where: {
        OR: [
          { name: { contains: 'Wellmedr', mode: 'insensitive' } },
          { name: { contains: 'WELLMEDR', mode: 'insensitive' } },
          { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
        ]
      }
    });

    if (!wellmedr) {
      // List existing clinics
      const clinics = await prisma.clinic.findMany({
        select: { id: true, name: true, subdomain: true }
      });

      return NextResponse.json({
        success: false,
        error: 'Wellmedr clinic not found',
        existingClinics: clinics,
        hint: 'Create the Wellmedr clinic first in Super Admin → Clinics → New Clinic'
      }, { status: 404 });
    }

    logger.info(`[SETUP-WELLMEDR] Found Wellmedr clinic: ID=${wellmedr.id}, Name="${wellmedr.name}"`);

    // Update with Lifefile credentials from environment
    const updated = await prisma.clinic.update({
      where: { id: wellmedr.id },
      data: {
        lifefileEnabled: true,
        lifefileBaseUrl: requiredEnvVars.WELLMEDR_LIFEFILE_BASE_URL,
        lifefileUsername: requiredEnvVars.WELLMEDR_LIFEFILE_USERNAME,
        lifefilePassword: requiredEnvVars.WELLMEDR_LIFEFILE_PASSWORD,
        lifefileVendorId: requiredEnvVars.WELLMEDR_LIFEFILE_VENDOR_ID,
        lifefilePracticeId: requiredEnvVars.WELLMEDR_LIFEFILE_PRACTICE_ID,
        lifefileLocationId: requiredEnvVars.WELLMEDR_LIFEFILE_LOCATION_ID,
        lifefileNetworkId: requiredEnvVars.WELLMEDR_LIFEFILE_NETWORK_ID,
        lifefilePracticeName: requiredEnvVars.WELLMEDR_LIFEFILE_PRACTICE_NAME,
      }
    });

    logger.info('[SETUP-WELLMEDR] Successfully configured Wellmedr Lifefile credentials');

    return NextResponse.json({
      success: true,
      message: 'Wellmedr Lifefile credentials configured successfully!',
      clinic: {
        id: updated.id,
        name: updated.name,
        lifefileEnabled: updated.lifefileEnabled,
        lifefileBaseUrl: updated.lifefileBaseUrl,
        lifefilePracticeId: updated.lifefilePracticeId,
        lifefilePracticeName: updated.lifefilePracticeName,
        lifefileVendorId: updated.lifefileVendorId,
        lifefileLocationId: updated.lifefileLocationId,
        lifefileNetworkId: updated.lifefileNetworkId,
      },
      nextSteps: [
        'Add Practice Address in Super Admin → Clinics → Wellmedr → Pharmacy',
        'Add Practice Phone in Super Admin → Clinics → Wellmedr → Pharmacy',
        'Add Practice Fax in Super Admin → Clinics → Wellmedr → Pharmacy',
        'Add Dr. Sigle to Wellmedr clinic in Super Admin → Users',
        'Test by logging in as Dr. Sigle and switching to Wellmedr'
      ]
    });

  } catch (error: any) {
    logger.error('[SETUP-WELLMEDR] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

export const POST = withSuperAdminAuth(handler);
