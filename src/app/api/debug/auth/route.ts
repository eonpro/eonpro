/**
 * DEBUG: Auth Test Endpoint
 * GET /api/debug/auth
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { JWT_SECRET } from '@/lib/auth/config';

export async function GET(req: NextRequest): Promise<Response> {
  try {
    // Get token
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    if (!token) {
      return NextResponse.json({ error: 'No token', authHeader: authHeader || 'missing' });
    }

    // Verify token
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      return NextResponse.json({
        success: true,
        user: {
          id: payload.id,
          email: payload.email,
          role: payload.role,
          clinicId: payload.clinicId,
        },
        tokenOk: true,
      });
    } catch (verifyError: any) {
      return NextResponse.json({
        error: 'Token verification failed',
        details: verifyError.message,
      }, { status: 401 });
    }
  } catch (error: any) {
    return NextResponse.json({
      error: 'Unexpected error',
      details: error.message,
    }, { status: 500 });
  }
}
