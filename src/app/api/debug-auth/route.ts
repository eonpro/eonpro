/**
 * TEMPORARY DEBUG ENDPOINT
 * GET /api/debug-auth - comprehensive auth diagnostic
 * Returns token state, claim names, cookie list, session state, and full auth flow result.
 * Remove after debugging.
 */
import { NextRequest, NextResponse } from 'next/server';
import * as jose from 'jose';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const diag: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
  };

  try {
    // ──────────────────────────────────────────────────────────────────────
    // 1. List ALL cookies present in the request (names + lengths only — no values)
    // ──────────────────────────────────────────────────────────────────────
    const allCookies: Record<string, number> = {};
    for (const [name, value] of request.cookies.getAll().map(c => [c.name, c.value] as const)) {
      allCookies[name] = value.length;
    }
    diag.cookiesPresent = allCookies;
    diag.cookieCount = Object.keys(allCookies).length;

    // ──────────────────────────────────────────────────────────────────────
    // 2. Determine which token the middleware would use (same logic as extractToken)
    // ──────────────────────────────────────────────────────────────────────
    let token: string | null = null;
    let tokenSource = 'none';

    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
      tokenSource = 'authorization-header';
    }

    if (!token) {
      const cookiePriority = [
        'affiliate_session', 'affiliate-token', 'auth-token',
        'super_admin-token', 'admin-token', 'provider-token',
        'patient-token', 'staff-token', 'support-token',
      ];
      for (const name of cookiePriority) {
        const val = request.cookies.get(name)?.value;
        if (val) {
          token = val;
          tokenSource = `cookie:${name}`;
          break;
        }
      }
    }

    diag.tokenSource = tokenSource;
    diag.tokenLength = token?.length ?? 0;
    diag.tokenPreview = token ? token.substring(0, 30) + '…' : null;

    if (!token) {
      diag.error = 'No auth token found in request';
      return NextResponse.json(diag, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }

    // ──────────────────────────────────────────────────────────────────────
    // 3. Decode JWT WITHOUT verification (base64) to see raw claims
    // ──────────────────────────────────────────────────────────────────────
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const rawPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        diag.rawClaimKeys = Object.keys(rawPayload).sort();
        diag.rawClaims = {
          id: typeof rawPayload.id === 'number' ? rawPayload.id : `(${typeof rawPayload.id})`,
          userId: typeof rawPayload.userId === 'number' ? rawPayload.userId : rawPayload.userId === undefined ? '(missing)' : `(${typeof rawPayload.userId})`,
          role: rawPayload.role ?? '(missing)',
          clinicId: rawPayload.clinicId ?? '(missing)',
          sessionId: rawPayload.sessionId ? `(present, len=${String(rawPayload.sessionId).length})` : '(MISSING)',
          hasSessionId: !!rawPayload.sessionId,
          exp: rawPayload.exp,
          iat: rawPayload.iat,
          email: typeof rawPayload.email === 'string' ? rawPayload.email.substring(0, 3) + '***' : '(missing)',
        };
      } else {
        diag.rawDecode = { error: `Token has ${parts.length} parts, expected 3` };
      }
    } catch (err: unknown) {
      diag.rawDecode = { error: err instanceof Error ? err.message : String(err) };
    }

    // ──────────────────────────────────────────────────────────────────────
    // 4. Verify JWT with JWT_SECRET
    // ──────────────────────────────────────────────────────────────────────
    const secret = process.env.JWT_SECRET;
    diag.jwtSecretPresent = !!secret;
    diag.jwtSecretLength = secret?.length ?? 0;

    if (secret) {
      try {
        const { payload } = await jose.jwtVerify(
          token,
          new TextEncoder().encode(secret),
          { algorithms: ['HS256'], clockTolerance: 30 }
        );
        diag.verified = {
          valid: true,
          claimKeys: Object.keys(payload).sort(),
          id: payload.id,
          role: payload.role,
          clinicId: payload.clinicId,
          sessionId: payload.sessionId ? `(present, len=${String(payload.sessionId).length})` : '(MISSING)',
          hasSessionId: !!payload.sessionId,
          exp: payload.exp,
          iat: payload.iat,
        };
      } catch (err: unknown) {
        diag.verified = {
          valid: false,
          error: err instanceof Error ? err.message : String(err),
          code: (err as { code?: string }).code,
        };
      }
    }

    // ──────────────────────────────────────────────────────────────────────
    // 5. Test session lookup (if sessionId present)
    // ──────────────────────────────────────────────────────────────────────
    try {
      const rawPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      if (rawPayload.sessionId) {
        const sessionMgr = await import('@/lib/auth/session-manager');
        const sessionResult = await sessionMgr.validateSession(token, request);
        diag.sessionValidation = {
          valid: sessionResult.valid,
          expired: sessionResult.expired,
          reason: sessionResult.reason ?? null,
          sessionExists: !!sessionResult.session,
        };
        // Also check storage type
        const storageStatus = sessionMgr.getSessionStorageStatus();
        diag.sessionStorage = storageStatus;
      } else {
        diag.sessionValidation = { skipped: true, reason: 'No sessionId in token' };
      }
    } catch (err: unknown) {
      diag.sessionValidation = { error: err instanceof Error ? err.message : String(err) };
    }

    // ──────────────────────────────────────────────────────────────────────
    // 6. Run full withAuth flow
    // ──────────────────────────────────────────────────────────────────────
    try {
      const authMod = await import('@/lib/auth/middleware');
      const testHandler = async () => NextResponse.json({ ok: true });
      const wrapped = authMod.withAuth(testHandler);
      const result = await wrapped(request);
      const body = await result.json();
      diag.fullAuthFlow = { status: result.status, body };
    } catch (err: unknown) {
      diag.fullAuthFlow = { error: err instanceof Error ? err.message : String(err) };
    }

  } catch (err: unknown) {
    diag.topLevelError = {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5) : undefined,
    };
  }

  return NextResponse.json(diag, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
