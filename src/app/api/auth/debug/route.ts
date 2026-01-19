/**
 * Auth Debug Endpoint
 * ====================
 * This endpoint helps debug authentication issues by showing
 * what tokens/cookies are being received by the server.
 * 
 * GET /api/auth/debug - Returns auth status (public)
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Get JWT secret
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || '');

// Version marker to verify deployment
const API_VERSION = '2026-01-19-v9-intake-overhaul';

export async function GET(req: NextRequest) {
  const result: any = {
    apiVersion: API_VERSION,
    timestamp: new Date().toISOString(),
    headers: {},
    cookies: {},
    tokenFound: false,
    tokenValid: false,
    tokenPayload: null,
    error: null,
  };

  // Check Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    result.headers.authorization = authHeader.substring(0, 20) + '...' + (authHeader.length > 20 ? `(${authHeader.length} chars)` : '');
    
    if (authHeader.startsWith('Bearer ')) {
      result.tokenFound = true;
      const token = authHeader.slice(7);
      
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        result.tokenValid = true;
        result.tokenPayload = {
          id: payload.id,
          email: payload.email,
          role: payload.role,
          exp: payload.exp,
          iat: payload.iat,
        };
      } catch (e: any) {
        result.error = `Token verification failed: ${e.message}`;
      }
    }
  }

  // Check all cookies
  const allCookies = req.cookies.getAll();
  result.cookies = {
    count: allCookies.length,
    names: allCookies.map(c => c.name),
  };

  // Try to find auth token in cookies
  const authCookieNames = ['auth-token', 'token', 'admin-token', 'provider-token', 'staff-token', 'super_admin-token'];
  for (const cookieName of authCookieNames) {
    const cookieValue = req.cookies.get(cookieName)?.value;
    if (cookieValue) {
      result.cookies[cookieName] = `found (${cookieValue.length} chars)`;
      
      if (!result.tokenFound) {
        result.tokenFound = true;
        try {
          const { payload } = await jwtVerify(cookieValue, JWT_SECRET);
          result.tokenValid = true;
          result.tokenPayload = {
            id: payload.id,
            email: payload.email,
            role: payload.role,
            exp: payload.exp,
            iat: payload.iat,
          };
        } catch (e: any) {
          result.error = `Cookie token verification failed: ${e.message}`;
        }
      }
    } else {
      result.cookies[cookieName] = 'not found';
    }
  }

  // Check if JWT_SECRET is configured
  result.jwtSecretConfigured = !!process.env.JWT_SECRET;
  result.jwtSecretLength = process.env.JWT_SECRET?.length || 0;

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
