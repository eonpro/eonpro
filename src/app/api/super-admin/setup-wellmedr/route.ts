/**
 * Setup Wellmedr Lifefile Credentials
 * POST /api/super-admin/setup-wellmedr
 * Super Admin only
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

async function handler(req: NextRequest) {
  try {
    logger.info('[SETUP-WELLMEDR] Starting Wellmedr Lifefile configuration...');

    // Find Wellmedr clinic
    let wellmedr = await prisma.clinic.findFirst({
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

    // Update with Lifefile credentials
    const updated = await prisma.clinic.update({
      where: { id: wellmedr.id },
      data: {
        lifefileEnabled: true,
        lifefileBaseUrl: 'https://host47a.lifefile.net:10165/lfapi/v1',
        lifefileUsername: 'api11596-4',
        lifefilePassword: '8+?QEFGWA(,TUP?[ZWZK',
        lifefileVendorId: '11596',
        lifefilePracticeId: '1270306',
        lifefileLocationId: '110396',
        lifefileNetworkId: '1594',
        lifefilePracticeName: 'WELLMEDR LLC',
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
