import { NextRequest, NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth/middleware';
import { searchAllergens } from '@/lib/clinical/allergens';
import { searchDrugsRxNorm } from '@/lib/clinical/rxnorm-client';

async function handler(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const [localResults, rxResults] = await Promise.all([
    Promise.resolve(searchAllergens(q)),
    searchDrugsRxNorm(q),
  ]);

  const results = [
    ...localResults.map((a) => ({
      name: a.name,
      category: a.category,
      drugClass: a.drugClass,
    })),
    ...rxResults
      .filter((r) => !localResults.some((l) => l.name.toLowerCase() === r.name.toLowerCase()))
      .slice(0, 5)
      .map((r) => ({
        name: r.name,
        category: 'drug' as const,
        drugClass: r.drugClass,
      })),
  ];

  return NextResponse.json(
    { results: results.slice(0, 15) },
    { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } }
  );
}

export const GET = withAuth(handler);
