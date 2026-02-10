import { NextResponse } from 'next/server';

/**
 * Proxies the EONPRO logo from the CDN so it loads from the app origin.
 * This ensures the "Powered by EONPRO" logo displays on all clinic subdomains
 * (e.g. ot.eonpro.io) where the external URL might be blocked or fail to load.
 */
const EONPRO_LOGO_URL =
  'https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg';

export async function GET() {
  try {
    const res = await fetch(EONPRO_LOGO_URL, {
      headers: { Accept: 'image/svg+xml' },
      next: { revalidate: 86400 }, // cache 24h
    });
    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }
    const body = await res.arrayBuffer();
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
