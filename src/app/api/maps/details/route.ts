import { NextRequest } from "next/server";
import { logger } from '@/lib/logger';

const GOOGLE_MAPS_KEY =
  process.env.GOOGLE_MAPS_SERVER_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get("placeId");

  if (!GOOGLE_MAPS_KEY) {
    return Response.json(
      { ok: false, error: { message: "Google Maps API key is not configured" } },
      { status: 500 }
    );
  }

  if (!placeId) {
    return Response.json(
      { ok: false, error: { message: "placeId is required" } },
      { status: 400 }
    );
  }

  const params = new URLSearchParams({
    place_id: placeId,
    key: GOOGLE_MAPS_KEY,
    fields: "address_component,formatted_address",
  });

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`
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
              "Place details failed",
          },
        },
        { status: res.status || 500 }
      );
    }

    return Response.json({ ok: true, result: data.result });
  } catch (err: any) {
    // @ts-ignore
   
    logger.error("[Maps Details] request failed", err);
    return Response.json(
      { ok: false, error: { message: "Place details service unavailable" } },
      { status: 502 }
    );
  }
}


