/**
 * Token refresh endpoint
 * Allows clients to get a new access token using their refresh token
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { JWT_SECRET, AUTH_CONFIG } from '@/lib/auth/config';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

/**
 * POST /api/auth/refresh-token
 * Refresh the access token using a valid refresh token
 */
export async function POST(req: NextRequest) {
  try {
    // Get refresh token from Authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Refresh token required in Authorization header' },
        { status: 401 }
      );
    }

    const refreshToken = authHeader.slice(7);

    // Verify refresh token
    let payload;
    try {
      const result = await jwtVerify(refreshToken, JWT_SECRET);
      payload = result.payload;
    } catch (error: any) {
    // @ts-ignore
   
      logger.warn('Invalid refresh token attempt');
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
    }

    // Check if it's a refresh token
    if (payload.type !== 'refresh') {
      return NextResponse.json(
        { error: 'Invalid token type' },
        { status: 401 }
      );
    }

    // Get user based on ID and role from the token
    let user = null;
    const userId = payload.id as number;
    
    // Since we don't store the role in refresh token, we need to check multiple tables
    // In production, you'd want to store user sessions in a dedicated table
    
    // Try provider first
    user = await prisma.provider.findUnique({
      where: { id: userId },
    });
    
    if (user) {
      // Create new access token for provider
      const newAccessToken = await new SignJWT({
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        role: 'provider',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.provider)
        .sign(JWT_SECRET);

      // Create new refresh token
      const newRefreshToken = await new SignJWT({
        id: user.id,
        type: 'refresh',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
        .sign(JWT_SECRET);

      logger.info(`Token refreshed for provider: ${user.email}`);

      return NextResponse.json({
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: 'provider',
        },
      });
    }

    // Try influencer
    user = await prisma.influencer.findUnique({
      where: { id: userId },
    });
    
    if (user) {
      // Create new access token for influencer
      const newAccessToken = await new SignJWT({
        id: user.id,
        email: user.email,
        name: user.name,
        role: 'influencer',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.influencer)
        .sign(JWT_SECRET);

      // Create new refresh token
      const newRefreshToken = await new SignJWT({
        id: user.id,
        type: 'refresh',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
        .sign(JWT_SECRET);

      logger.info(`Token refreshed for influencer: ${user.email}`);

      return NextResponse.json({
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: 'influencer',
        },
      });
    }

    // Check for admin (special case)
    if (userId === 0 && process.env.ADMIN_EMAIL) {
      const newAccessToken = await new SignJWT({
        id: 0,
        email: process.env.ADMIN_EMAIL,
        name: 'Admin',
        role: 'admin',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.access)
        .sign(JWT_SECRET);

      const newRefreshToken = await new SignJWT({
        id: 0,
        type: 'refresh',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
        .sign(JWT_SECRET);

      logger.info(`Token refreshed for admin`);

      return NextResponse.json({
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: 0,
          email: process.env.ADMIN_EMAIL,
          name: 'Admin',
          role: 'admin',
        },
      });
    }

    // No user found
    return NextResponse.json(
      { error: 'User not found' },
      { status: 404 }
    );
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh token' },
      { status: 500 }
    );
  }
}
