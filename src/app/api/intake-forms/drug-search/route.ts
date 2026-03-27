/**
 * GET /api/intake-forms/drug-search?q=...
 *
 * Public endpoint for medication autocomplete in intake forms.
 * No authentication required. Uses server-side caching to limit
 * upstream RxNorm/OpenFDA calls.
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchDrugs } from '@/lib/clinical/rxnorm-client';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchDrugs(q);
  return NextResponse.json(
    { results },
    { headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=600' } },
  );
}
