/**
 * Affiliate Traffic Sources API
 * 
 * GET /api/affiliate/traffic-sources?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * Returns traffic source breakdown for the authenticated affiliate:
 * - UTM source/medium breakdown
 * - Device type distribution
 * - Top landing pages
 * 
 * @security Affiliate role only
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface TrafficSource {
  source: string;
  clicks: number;
  conversions: number;
  percentage: number;
}

interface DeviceBreakdown {
  device: string;
  clicks: number;
  percentage: number;
}

interface LandingPage {
  page: string;
  clicks: number;
  conversions: number;
  conversionRate: number;
}

// Parse user agent to determine device type
function getDeviceType(userAgent: string | null): string {
  if (!userAgent) return 'Unknown';
  
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return 'Mobile';
  }
  if (ua.includes('tablet') || ua.includes('ipad')) {
    return 'Tablet';
  }
  return 'Desktop';
}

export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    // Get affiliate from user
    const affiliate = await prisma.affiliate.findUnique({
      where: { userId: user.id },
      select: { id: true, clinicId: true, status: true }
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate profile not found' }, { status: 404 });
    }

    if (affiliate.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Affiliate account is not active' }, { status: 403 });
    }

    // Parse date filters
    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');
    
    const fromDate = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = toStr ? new Date(toStr + 'T23:59:59.999Z') : new Date();

    // Get all touches for this affiliate in date range
    const touches = await prisma.affiliateTouch.findMany({
      where: {
        affiliateId: affiliate.id,
        clinicId: affiliate.clinicId,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        }
      },
      select: {
        utmSource: true,
        utmMedium: true,
        userAgent: true,
        landingPage: true,
        convertedAt: true,
      }
    });

    const totalClicks = touches.length;

    if (totalClicks === 0) {
      return NextResponse.json({
        sources: [],
        devices: [],
        landingPages: [],
        totalClicks: 0,
        dateRange: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        }
      });
    }

    // Aggregate by UTM source
    const sourceMap = new Map<string, { clicks: number; conversions: number }>();
    const deviceMap = new Map<string, number>();
    const landingPageMap = new Map<string, { clicks: number; conversions: number }>();

    for (const touch of touches) {
      // UTM Source
      const source = touch.utmSource || 'Direct';
      const sourceData = sourceMap.get(source) || { clicks: 0, conversions: 0 };
      sourceData.clicks++;
      if (touch.convertedAt) sourceData.conversions++;
      sourceMap.set(source, sourceData);

      // Device Type
      const device = getDeviceType(touch.userAgent);
      deviceMap.set(device, (deviceMap.get(device) || 0) + 1);

      // Landing Page
      if (touch.landingPage) {
        // Normalize landing page URL (remove query params for grouping)
        let page = touch.landingPage;
        try {
          const url = new URL(touch.landingPage);
          page = url.pathname;
        } catch (error: unknown) {
          // Keep original if not a valid URL
          logger.warn('[Affiliate Traffic Sources] URL parse failed', { error: error instanceof Error ? error.message : 'Unknown error', landingPage: touch.landingPage });
        }
        
        const pageData = landingPageMap.get(page) || { clicks: 0, conversions: 0 };
        pageData.clicks++;
        if (touch.convertedAt) pageData.conversions++;
        landingPageMap.set(page, pageData);
      }
    }

    // Build sources array
    const sources: TrafficSource[] = Array.from(sourceMap.entries())
      .map(([source, data]) => ({
        source,
        clicks: data.clicks,
        conversions: data.conversions,
        percentage: (data.clicks / totalClicks) * 100,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);

    // Build devices array
    const devices: DeviceBreakdown[] = Array.from(deviceMap.entries())
      .map(([device, clicks]) => ({
        device,
        clicks,
        percentage: (clicks / totalClicks) * 100,
      }))
      .sort((a, b) => b.clicks - a.clicks);

    // Build landing pages array
    const landingPages: LandingPage[] = Array.from(landingPageMap.entries())
      .map(([page, data]) => ({
        page,
        clicks: data.clicks,
        conversions: data.conversions,
        conversionRate: data.clicks > 0 ? (data.conversions / data.clicks) * 100 : 0,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);

    return NextResponse.json({
      sources,
      devices,
      landingPages,
      totalClicks,
      dateRange: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      }
    });

  } catch (error) {
    logger.error('[Affiliate Traffic Sources] Error fetching data', error);
    return NextResponse.json({ error: 'Failed to fetch traffic sources' }, { status: 500 });
  }
}, { roles: ['affiliate', 'super_admin', 'admin'] });
