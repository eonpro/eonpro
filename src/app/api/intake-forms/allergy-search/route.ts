/**
 * GET /api/intake-forms/allergy-search?q=...
 *
 * Public endpoint for allergen autocomplete in intake forms.
 * No authentication required. Searches local allergen DB first,
 * then RxNorm for drug-based allergens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchAllergens } from '@/lib/clinical/allergens';
import { searchDrugsRxNorm } from '@/lib/clinical/rxnorm-client';

export async function GET(req: NextRequest) {
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
    { headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=600' } },
  );
}
