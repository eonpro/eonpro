/**
 * TEMPORARY DEBUG ENDPOINT
 * GET /api/debug-auth - reads the auth cookie, verifies JWT, tests DB
 * Returns all diagnostics as JSON. Remove after debugging.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import * as jose from 'jose';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const diag: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    steps: {} as Record<string, unknown>,
  };

  const steps = diag.steps as Record<string, unknown>;

  // Step 1: Read auth cookie
  try {
    const cookieStore = await cookies();
    const authToken = cookieStore.get('auth-token')?.value;
    steps.cookie = authToken
      ? { found: true, length: authToken.length, preview: authToken.substring(0, 20) + '...' }
      : { found: false };

    if (!authToken) {
      return NextResponse.json(diag, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }

    // Step 2: Verify JWT
    try {
      const secret = process.env.JWT_SECRET;
      steps.jwtSecretPresent = !!secret;
      steps.jwtSecretLength = secret?.length || 0;

      if (secret) {
        const { payload } = await jose.jwtVerify(
          authToken,
          new TextEncoder().encode(secret)
        );
        steps.jwt = {
          valid: true,
          userId: payload.userId || payload.sub,
          role: payload.role,
          clinicId: payload.clinicId,
          email: typeof payload.email === 'string' ? payload.email.substring(0, 3) + '***' : undefined,
          sessionId: !!payload.sessionId,
          exp: payload.exp,
          iat: payload.iat,
        };
      }
    } catch (err: unknown) {
      steps.jwt = {
        valid: false,
        error: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.constructor.name : 'Unknown',
      };
    }

    // Step 3: Test database via dynamic import (to catch module-level errors)
    try {
      const db = await import('@/lib/db');
      steps.dbModuleLoaded = true;

      try {
        await db.basePrisma.$queryRaw`SELECT 1 as ok`;
        steps.dbRawQuery = 'OK';
      } catch (err: unknown) {
        steps.dbRawQuery = { error: err instanceof Error ? err.message : String(err) };
      }
    } catch (err: unknown) {
      steps.dbModuleLoaded = false;
      steps.dbModuleError = {
        error: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.constructor.name : 'Unknown',
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5) : undefined,
      };
    }

    // Step 4: Test auth middleware import
    try {
      const authMod = await import('@/lib/auth/middleware');
      steps.authModuleLoaded = true;
      steps.authModuleExports = Object.keys(authMod);
    } catch (err: unknown) {
      steps.authModuleLoaded = false;
      steps.authModuleError = {
        error: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.constructor.name : 'Unknown',
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5) : undefined,
      };
    }

    // Step 5: Test error handler import
    try {
      const errMod = await import('@/domains/shared/errors/handler');
      steps.errorHandlerLoaded = true;
      steps.errorHandlerExports = Object.keys(errMod);
    } catch (err: unknown) {
      steps.errorHandlerLoaded = false;
      steps.errorHandlerError = {
        error: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.constructor.name : 'Unknown',
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5) : undefined,
      };
    }

    // Step 6: Try the full auth flow manually
    try {
      const authMod = await import('@/lib/auth/middleware');
      // Create a minimal handler
      const testHandler = async () => {
        return NextResponse.json({ authFlowSuccess: true });
      };
      const wrappedHandler = authMod.withAuth(testHandler);
      // Call the wrapped handler with the original request
      const result = await wrappedHandler(request);
      const body = await result.json();
      steps.fullAuthFlow = {
        status: result.status,
        body,
      };
    } catch (err: unknown) {
      steps.fullAuthFlow = {
        error: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.constructor.name : 'Unknown',
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 8) : undefined,
      };
    }

  } catch (err: unknown) {
    steps.topLevelError = {
      error: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.constructor.name : 'Unknown',
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5) : undefined,
    };
  }

  return NextResponse.json(diag, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
