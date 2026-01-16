import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

/**
 * GET /api/auth/verify
 * Verify if the current token is valid
 */
async function verifyHandler(req: NextRequest, user: AuthUser) {
  return NextResponse.json({
    valid: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId,
    },
    expiresAt: user.exp ? new Date(user.exp * 1000).toISOString() : null,
  });
}

export const GET = withAuth(verifyHandler);
