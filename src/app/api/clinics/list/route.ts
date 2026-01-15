import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * GET /api/clinics/list
 * Public endpoint to get list of clinics (for dropdowns)
 * Only returns basic info (id, name, subdomain)
 */
export async function GET() {
  try {
    const clinics = await prisma.clinic.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      select: {
        id: true,
        name: true,
        subdomain: true,
        status: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json({ clinics });
  } catch (error) {
    console.error('Failed to fetch clinics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinics', clinics: [] },
      { status: 500 }
    );
  }
}
