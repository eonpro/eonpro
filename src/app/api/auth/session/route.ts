/**
 * Session Verification API
 *
 * GET /api/auth/session
 *
 * SECURITY: Server-side JWT verification to prevent client-side secret exposure.
 * This endpoint safely verifies the JWT token and returns user info.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { logger } from '@/lib/logger';

const JWT_SECRET = process.env.JWT_SECRET;

// User shape returned to client
interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: string;
  providerId?: number;
  patientId?: number;
  influencerId?: number;
  clinicId?: number;
  permissions?: string[];
}

export async function GET(request: NextRequest) {
  try {
    // Extract token from Authorization header or cookies
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : request.cookies.get('auth-token')?.value ||
        request.cookies.get('admin-token')?.value ||
        request.cookies.get('provider-token')?.value ||
        request.cookies.get('patient-token')?.value ||
        request.cookies.get('influencer-token')?.value;

    if (!token) {
      return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
    }

    // SECURITY: Server-side JWT verification with secret that stays server-side
    if (!JWT_SECRET) {
      logger.error('[AUTH/SESSION] JWT_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);

    // Check token expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return NextResponse.json(
        { authenticated: false, user: null, expired: true },
        { status: 200 }
      );
    }

    // Build user object from JWT payload
    const user: SessionUser = {
      id: payload.id as number,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
      providerId: payload.providerId as number | undefined,
      patientId: payload.patientId as number | undefined,
      influencerId: payload.influencerId as number | undefined,
      clinicId: payload.clinicId as number | undefined,
      permissions: payload.permissions as string[] | undefined,
    };

    return NextResponse.json({
      authenticated: true,
      user,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Handle specific JWT errors
    if (errorMessage.includes('expired')) {
      return NextResponse.json(
        { authenticated: false, user: null, expired: true },
        { status: 200 }
      );
    }

    if (errorMessage.includes('invalid') || errorMessage.includes('signature')) {
      logger.security('[AUTH/SESSION] Invalid token verification attempt', {
        error: errorMessage,
      });
      return NextResponse.json({ authenticated: false, user: null }, { status: 200 });
    }

    logger.error('[AUTH/SESSION] Session verification error', { error: errorMessage });
    return NextResponse.json({ error: 'Session verification failed' }, { status: 500 });
  }
}
