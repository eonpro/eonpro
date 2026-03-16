import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { getDataSources } from '@/services/reporting/reportEngine';

async function handler() {
  const sources = getDataSources();
  return NextResponse.json({ sources });
}

export const GET = withAuth(handler, { roles: ['super_admin', 'admin', 'provider'] });
