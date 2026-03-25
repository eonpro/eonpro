import { NextRequest, NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth/middleware';
import { searchDrugs } from '@/lib/clinical/rxnorm-client';

async function handler(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results = await searchDrugs(q);
  return NextResponse.json(
    { results },
    { headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' } }
  );
}

export const GET = withAuth(handler);
