import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

const GOOGLE_MAPS_KEY =
  process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

async function handler(request: NextRequest, user: AuthUser) {
  const placeId = request.nextUrl.searchParams.get('placeId');

  if (!GOOGLE_MAPS_KEY) {
    return Response.json(
      { ok: false, error: { message: 'Google Maps API key is not configured' } },
      { status: 500 }
    );
  }

  if (!placeId) {
    return Response.json({ ok: false, error: { message: 'placeId is required' } }, { status: 400 });
  }

  const params = new URLSearchParams({
    place_id: placeId,
    key: GOOGLE_MAPS_KEY,
    fields: 'address_component,formatted_address',
  });

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`
    );
    const data = await res.json().catch((err) => {
      logger.warn('[Maps Details] Failed to parse JSON response', { error: err instanceof Error ? err.message : String(err) });
      return null;
    });

    if (!res.ok || !data || data.status !== 'OK') {
      return Response.json(
        {
          ok: false,
          error: {
            message:
              data?.error_message ??
              data?.status ??
              (await res.text().catch((err) => {
                logger.warn('[Maps Details] Failed to read error response text', { error: err instanceof Error ? err.message : String(err) });
                return null;
              })) ??
              'Place details failed',
          },
        },
        { status: res.status || 500 }
      );
    }

    return Response.json({ ok: true, result: data.result });
  } catch (err: unknown) {
    logger.error('[Maps Details] request failed', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return Response.json(
      { ok: false, error: { message: 'Place details service unavailable' } },
      { status: 502 }
    );
  }
}

// Require authentication to prevent API abuse
export const GET = withAuth(handler);
