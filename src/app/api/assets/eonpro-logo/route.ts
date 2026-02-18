import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { EONPRO_LOGO } from '@/lib/constants/brand-assets';

/**
 * Serves the EONPRO logo from the local filesystem.
 * This ensures the "Powered by EONPRO" logo displays on all clinic subdomains
 * (e.g. ot.eonpro.io) when referenced via /api/assets/eonpro-logo.
 */
const LOGO_PATH = path.join(
  process.cwd(),
  'public',
  EONPRO_LOGO.replace(/^\//, '')
);

export async function GET() {
  try {
    const body = await fs.readFile(LOGO_PATH);
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
