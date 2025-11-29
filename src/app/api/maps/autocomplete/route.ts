import { NextRequest } from "next/server";
import { logger } from '@/lib/logger';

const GOOGLE_MAPS_KEY =
  process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function GET(request: NextRequest) {
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
  } catch (err: any) {
    // @ts-ignore
   
    logger.error("[Maps Autocomplete] request failed", err);
    return Response.json(
      { ok: false, error: { message: "Autocomplete service unavailable" } },
      { status: 502 }
    );
  }
}


