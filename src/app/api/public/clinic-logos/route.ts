import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const FEATURED_CLINIC_SLUGS = ['wellmedr', 'ot', 'eonmeds', 'overnight'];

/**
 * GET /api/public/clinic-logos
 * Public endpoint returning logo URLs for featured clinics on the marketing site.
 * No auth required. Returns only name + logoUrl (no PHI or sensitive data).
 */
export async function GET() {
  try {
    const clinics = await prisma.clinic.findMany({
      where: {
        subdomain: { in: FEATURED_CLINIC_SLUGS },
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      select: {
        name: true,
        subdomain: true,
        logoUrl: true,
      },
      orderBy: { name: 'asc' },
    });

    const ordered = FEATURED_CLINIC_SLUGS
      .map((slug) => clinics.find((c) => c.subdomain === slug))
      .filter(Boolean);

    return NextResponse.json(
      { clinics: ordered },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    );
  } catch {
    return NextResponse.json({ clinics: [] }, { status: 200 });
  }
}
