import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * Debug endpoint to check token validity
 * GET /api/debug/token
 * 
 * This helps diagnose authentication issues.
 */
export async function GET(req: NextRequest) {
  try {
    // Get token from various sources
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({
        error: 'No token provided',
        headers: {
          authorization: authHeader,
        },
      }, { status: 400 });
    }

    // Check if JWT_SECRET is configured
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return NextResponse.json({
        error: 'JWT_SECRET not configured on server',
        tokenLength: token.length,
        tokenPreview: token.substring(0, 50) + '...',
      }, { status: 500 });
    }

    // Try to verify the token
    try {
      const secretKey = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(token, secretKey);
      
      return NextResponse.json({
        valid: true,
        payload: {
          id: payload.id,
          email: payload.email,
          role: payload.role,
          clinicId: payload.clinicId,
          exp: payload.exp,
          iat: payload.iat,
          expiresAt: payload.exp ? new Date(Number(payload.exp) * 1000).toISOString() : null,
        },
        message: 'Token is valid!',
      });
    } catch (verifyError: any) {
      return NextResponse.json({
        valid: false,
        error: verifyError.message,
        code: verifyError.code,
        tokenLength: token.length,
        tokenParts: token.split('.').length,
        secretConfigured: !!secret,
        secretLength: secret.length,
      }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({
      error: 'Debug failed',
      message: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
