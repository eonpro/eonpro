import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';
import { verifyAuth } from '@/lib/auth/middleware';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    // CRITICAL: Verify admin authentication - this endpoint resets passwords!
    const auth = await verifyAuth(req);
    if (!auth.success || !auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowedRoles = ['super_admin', 'admin'];
    if (!allowedRoles.includes(auth.user.role)) {
      logger.security('Unauthorized password reset attempt', {
        attemptedBy: auth.user.email,
        role: auth.user.role,
      });
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
    }

    const params = await context.params;
    const { password } = await req.json();
    const influencerId = parseInt(params.id);

    if (!password || password.length < 12) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Check if influencer exists
    const influencer = await prisma.influencer.findUnique({
      where: { id: influencerId },
    });

    if (!influencer) {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update the influencer's password
    await prisma.influencer.update({
      where: { id: influencerId },
      data: { passwordHash: hashedPassword },
    });

    // Log the password reset for audit trail
    logger.security('Influencer password reset', {
      influencerId,
      influencerEmail: influencer.email,
      resetBy: auth.user.email,
      resetByUserId: auth.user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error: any) {
    logger.error('[Admin Reset Password] Error:', error);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
