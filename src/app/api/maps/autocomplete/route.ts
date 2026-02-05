import { NextRequest, NextResponse } from "next/server";
import { logger } from '@/lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

const GOOGLE_MAPS_KEY =
  process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

async function handler(request: NextRequest, user: AuthUser) {
  const input = request.nextUrl.searchParams.get("input") ?? "";

  if (!GOOGLE_MAPS_KEY) {
    return Response.json(
      { ok: false, error: { message: "Google Maps API key is not configured" } },
      { status: 500 }
    );
  }

  if (!input.trim()) {
    return Response.json({ ok: true, predictions: [] });
  }

  const params = new URLSearchParams({
    input,
    key: GOOGLE_MAPS_KEY,
    types: "address",
    components: "country:us",
  });

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`
    );
    const data = await res.json().catch(() => null);

    if (!res.ok || !data || data.status !== "OK") {
      return Response.json(
        {
          ok: false,
          error: {
            message:
              data?.error_message ??
              data?.status ??
              (await res.text().catch(() => null)) ??
              "Autocomplete failed",
          },
        },
        { status: res.status || 500 }
      );
    }

    return Response.json({ ok: true, predictions: data.predictions ?? [] });
  } catch (err: unknown) {
    logger.error("[Maps Autocomplete] request failed", { 
      error: err instanceof Error ? err.message : 'Unknown error' 
    });
    return Response.json(
      { ok: false, error: { message: "Autocomplete service unavailable" } },
      { status: 502 }
    );
  }
}

// Require authentication to prevent API abuse
export const GET = withAuth(handler);
