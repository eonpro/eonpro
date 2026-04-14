import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminAuth, type AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import {
  resolveCredentialsWithAttribution,
  resolveTrackCredentials,
  fedexEnvironment,
} from '@/lib/fedex';
import { logger } from '@/lib/logger';

export const maxDuration = 30;

async function handleDiagnose(_req: NextRequest, _user: AuthUser) {
  const diagnostics: Record<string, unknown> = {};

  // 1. Check environment
  diagnostics.fedexEnvironment = fedexEnvironment();
  diagnostics.fedexSandboxEnv = process.env.FEDEX_SANDBOX;
  diagnostics.hasClientId = !!process.env.FEDEX_CLIENT_ID;
  diagnostics.hasClientSecret = !!process.env.FEDEX_CLIENT_SECRET;
  diagnostics.hasAccountNumber = !!process.env.FEDEX_ACCOUNT_NUMBER;
  diagnostics.hasTrackClientId = !!process.env.FEDEX_TRACK_CLIENT_ID;
  diagnostics.hasTrackClientSecret = !!process.env.FEDEX_TRACK_CLIENT_SECRET;
  diagnostics.usingDedicatedTrackCredentials = !!(
    process.env.FEDEX_TRACK_CLIENT_ID && process.env.FEDEX_TRACK_CLIENT_SECRET
  );

  // 2. Get a sample tracking number from the DB
  const { searchParams } = new URL(_req.url);
  const mode = searchParams.get('mode') || 'active';
  const specificTn = searchParams.get('trackingNumber');
  diagnostics.mode = mode;

  let sampleWhere: any;
  if (specificTn) {
    sampleWhere = { trackingNumber: specificTn };
  } else if (mode === 'delivered') {
    sampleWhere = { carrier: { in: ['FedEx', 'FEDEX', 'fedex'] }, status: 'DELIVERED' };
  } else {
    sampleWhere = {
      carrier: { in: ['FedEx', 'FEDEX', 'fedex'] },
      status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED'] },
    };
  }

  const sample = await basePrisma.patientShippingUpdate.findFirst({
    where: sampleWhere,
    select: { trackingNumber: true, clinicId: true, carrier: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!sample) {
    diagnostics.error = `No ${mode} FedEx shipments found to test`;
    return NextResponse.json({ success: false, diagnostics });
  }

  diagnostics.sampleTrackingNumber = sample.trackingNumber;
  diagnostics.sampleClinicId = sample.clinicId;
  diagnostics.sampleStatus = sample.status;
  diagnostics.sampleCreatedAt = sample.createdAt;

  // 3. Resolve credentials
  let credentials;
  try {
    const allowEnvFallback = process.env.FEDEX_ALLOW_ENV_FALLBACK_FOR_CLINIC_SHIPPING === 'true';
    const clinic = await basePrisma.clinic.findUnique({
      where: { id: sample.clinicId },
      select: {
        id: true,
        fedexClientId: true,
        fedexClientSecret: true,
        fedexAccountNumber: true,
        fedexEnabled: true,
      },
    });
    const resolution = resolveCredentialsWithAttribution(clinic ?? undefined, { allowEnvFallback });
    credentials = resolution.credentials;
    diagnostics.credentialSource = resolution.source;
    diagnostics.credentialEnvironment = resolution.environment;
    diagnostics.credentialAccountFingerprint = resolution.accountFingerprint;
  } catch (err) {
    diagnostics.credentialError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, diagnostics });
  }

  // 4. Resolve Track-specific credentials (may differ from Ship credentials)
  const trackCreds = resolveTrackCredentials();
  const effectiveTrackCreds = trackCreds || credentials;
  diagnostics.trackCredentialSource = trackCreds
    ? process.env.FEDEX_TRACK_CLIENT_ID
      ? 'dedicated_track_credentials'
      : 'shared_ship_credentials'
    : 'shared_ship_credentials';

  // 5. Get OAuth token using Track credentials
  const fedexApiBase =
    process.env.FEDEX_SANDBOX === 'true'
      ? 'https://apis-sandbox.fedex.com'
      : 'https://apis.fedex.com';

  let accessToken: string;
  try {
    const tokenRes = await fetch(`${fedexApiBase}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: effectiveTrackCreds.clientId,
        client_secret: effectiveTrackCreds.clientSecret,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const tokenBody = await tokenRes.text();
    diagnostics.oauthStatus = tokenRes.status;

    if (!tokenRes.ok) {
      diagnostics.oauthError = tokenBody.slice(0, 500);
      return NextResponse.json({ success: false, diagnostics });
    }

    const tokenData = JSON.parse(tokenBody);
    accessToken = tokenData.access_token;
    diagnostics.oauthSuccess = true;
    diagnostics.tokenScope = tokenData.scope;
  } catch (err) {
    diagnostics.oauthError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, diagnostics });
  }

  // 5. Call Track API directly
  const trackPayload = {
    trackingInfo: [{ trackingNumberInfo: { trackingNumber: sample.trackingNumber } }],
    includeDetailedScans: true,
  };

  try {
    const trackRes = await fetch(`${fedexApiBase}/track/v1/trackingnumbers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(trackPayload),
      signal: AbortSignal.timeout(15000),
    });

    const trackBody = await trackRes.text();
    diagnostics.trackApiStatus = trackRes.status;

    if (!trackRes.ok) {
      diagnostics.trackApiError = trackBody.slice(0, 1000);
      return NextResponse.json({ success: false, diagnostics });
    }

    const trackData = JSON.parse(trackBody);
    const completeResult = trackData.output?.completeTrackResults?.[0];
    const trackResult = completeResult?.trackResults?.[0];

    diagnostics.trackApiSuccess = true;
    diagnostics.hasTrackResults = !!trackResult;
    diagnostics.trackResultError = trackResult?.error || null;
    diagnostics.latestStatus = trackResult?.latestStatusDetail || null;
    diagnostics.dateAndTimes = trackResult?.dateAndTimes || null;
    diagnostics.availableImages = trackResult?.availableImages || null;
    diagnostics.deliveryDetails = trackResult?.deliveryDetails || null;
    diagnostics.rawResponseKeys = trackResult ? Object.keys(trackResult) : null;

    logger.info('[FedEx Diagnose] Track API test complete', {
      trackingNumber: sample.trackingNumber,
      httpStatus: trackRes.status,
      hasResult: !!trackResult,
      error: trackResult?.error?.code,
      status: trackResult?.latestStatusDetail?.code,
    });
  } catch (err) {
    diagnostics.trackApiError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, diagnostics });
  }

  return NextResponse.json({ success: true, diagnostics });
}

export const GET = withSuperAdminAuth(handleDiagnose);
