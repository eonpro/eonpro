import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/configure-eonmeds
 *
 * One-time endpoint to configure EONMEDS clinic with Lifefile credentials.
 * Protected by a setup secret.
 */
export async function POST(req: NextRequest) {
  try {
    // Verify setup secret
    const setupSecret = req.headers.get('x-setup-secret');
    const configuredSecret =
      process.env.ADMIN_SETUP_SECRET || process.env.WEIGHTLOSSINTAKE_WEBHOOK_SECRET;

    if (!configuredSecret || setupSecret !== configuredSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    // Find EONMEDS clinic (use select for backwards compatibility)
    let eonmeds = await prisma.clinic.findFirst({
      where: {
        OR: [{ subdomain: 'eonmeds' }, { name: { contains: 'EONMEDS', mode: 'insensitive' } }],
      },
      select: { id: true, name: true, subdomain: true },
    });

    if (!eonmeds) {
      logger.info('[CONFIGURE] EONMEDS clinic not found, creating...');

      eonmeds = await prisma.clinic.create({
        data: {
          name: body.clinicName || 'EONMEDS',
          subdomain: 'eonmeds',
          adminEmail: body.adminEmail || 'admin@eonmeds.com',
          status: 'ACTIVE',
          settings: {},
          features: {},
          integrations: {},
        },
        select: { id: true, name: true, subdomain: true },
      });

      logger.info(`[CONFIGURE] Created EONMEDS clinic with ID: ${eonmeds.id}`);
    }

    // Update with Lifefile credentials (use select for backwards compatibility)
    const updated = await prisma.clinic.update({
      where: { id: eonmeds.id },
      data: {
        lifefileEnabled: true,
        lifefileBaseUrl: body.lifefileBaseUrl,
        lifefileUsername: body.lifefileUsername,
        lifefilePassword: body.lifefilePassword,
        lifefileVendorId: body.lifefileVendorId,
        lifefilePracticeId: body.lifefilePracticeId,
        lifefileLocationId: body.lifefileLocationId,
        lifefileNetworkId: body.lifefileNetworkId,
        lifefilePracticeName: body.lifefilePracticeName,
        lifefilePracticeAddress: body.lifefilePracticeAddress || null,
        lifefilePracticePhone: body.lifefilePracticePhone || null,
        lifefilePracticeFax: body.lifefilePracticeFax || null,
      },
      select: {
        id: true,
        name: true,
        subdomain: true,
        lifefileEnabled: true,
        lifefilePracticeName: true,
        lifefileLocationId: true,
      },
    });

    logger.info(`[CONFIGURE] EONMEDS clinic ${eonmeds.id} configured with Lifefile credentials`);

    return NextResponse.json({
      success: true,
      clinic: {
        id: updated.id,
        name: updated.name,
        subdomain: updated.subdomain,
        lifefileEnabled: updated.lifefileEnabled,
        lifefilePracticeName: updated.lifefilePracticeName,
        lifefileLocationId: updated.lifefileLocationId,
      },
    });
  } catch (error: any) {
    logger.error('[CONFIGURE] Error configuring EONMEDS:', error);
    return NextResponse.json({ error: error.message || 'Configuration failed' }, { status: 500 });
  }
}
