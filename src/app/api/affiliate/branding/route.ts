/**
 * Affiliate Portal Branding API
 *
 * GET /api/affiliate/branding
 *
 * Returns clinic branding for the affiliate portal (white-label support).
 * Uses the same branding mechanism as the patient portal.
 *
 * @security Affiliate role only (derived from auth session)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      // Get affiliate's clinic
      const affiliate = await prisma.affiliate.findUnique({
        where: { userId: user.id },
        select: {
          id: true,
          clinicId: true,
          displayName: true,
          status: true,
        },
      });

      if (!affiliate) {
        return NextResponse.json({ error: 'Affiliate profile not found' }, { status: 404 });
      }

      // Get clinic branding
      const clinic = await prisma.clinic.findUnique({
        where: { id: affiliate.clinicId },
        select: {
          id: true,
          name: true,
          logoUrl: true,
          faviconUrl: true,
          primaryColor: true,
          secondaryColor: true,
          customCss: true,
          settings: true,
          adminEmail: true,
          supportEmail: true,
          phone: true,
        },
      });

      if (!clinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      // Parse settings for affiliate-specific customizations
      const settings = (clinic.settings as any) || {};
      const affiliateSettings = settings.affiliatePortal || {};

      const branding = {
        clinicId: clinic.id,
        clinicName: clinic.name,
        affiliateName: affiliate.displayName,
        logoUrl: clinic.logoUrl,
        faviconUrl: clinic.faviconUrl,
        primaryColor: clinic.primaryColor || '#8B5CF6', // Default violet for affiliate
        secondaryColor: clinic.secondaryColor || '#7C3AED',
        accentColor: affiliateSettings.accentColor || '#C4B5FD',
        customCss: clinic.customCss,
        features: {
          showPerformanceChart: affiliateSettings.showPerformanceChart ?? true,
          showRefCodeManager: affiliateSettings.showRefCodeManager ?? true,
          showPayoutHistory: affiliateSettings.showPayoutHistory ?? true,
          showResources: affiliateSettings.showResources ?? true,
        },
        supportEmail: clinic.supportEmail || clinic.adminEmail,
        supportPhone: clinic.phone,
        // Affiliate-specific resources
        resources: affiliateSettings.resources || [
          {
            id: 'getting-started',
            title: 'Getting Started Guide',
            description: 'Learn how to maximize your affiliate earnings',
            url: '/affiliate-resources/getting-started',
            type: 'guide',
          },
          {
            id: 'marketing-materials',
            title: 'Marketing Materials',
            description: 'Download banners, images, and copy',
            url: '/affiliate-resources/marketing',
            type: 'download',
          },
        ],
      };

      return NextResponse.json(branding);
    } catch (error) {
      logger.error('[Affiliate Branding] Error fetching branding', error);
      return NextResponse.json({ error: 'Failed to fetch branding' }, { status: 500 });
    }
  },
  { roles: ['affiliate', 'super_admin', 'admin'] }
);
