/**
 * Token refresh endpoint
 * Allows clients to get a new access token using their refresh token
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { JWT_SECRET, AUTH_CONFIG } from '@/lib/auth/config';
import { logger } from '@/lib/logger';
import { basePrisma as prisma } from '@/lib/db';

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
    } catch (error: unknown) {
      logger.warn('Invalid refresh token attempt');
      return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 });
    }

    // Check if it's a refresh token
    if (payload.type !== 'refresh') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }

    // Get user based on ID and role from the token
    const userId = payload.id as number;

    // Since we don't store the role in refresh token, we need to check multiple tables
    // In production, you'd want to store user sessions in a dedicated table

    // Try provider first
    const providerUser = await prisma.provider.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true, clinicId: true },
    });

    if (providerUser) {
      const payload: Record<string, unknown> = {
        id: providerUser.id,
        email: providerUser.email || '',
        name: `${providerUser.firstName} ${providerUser.lastName}`,
        role: 'provider',
      };
      if (providerUser.clinicId != null) payload.clinicId = providerUser.clinicId;

      const newAccessToken = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.provider)
        .sign(JWT_SECRET);

      // Create new refresh token
      const newRefreshToken = await new SignJWT({
        id: providerUser.id,
        type: 'refresh',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
        .sign(JWT_SECRET);

      logger.info('Token refreshed for provider', { userId: providerUser.id });

      return NextResponse.json({
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: providerUser.id,
          email: providerUser.email,
          name: `${providerUser.firstName} ${providerUser.lastName}`,
          role: 'provider',
        },
      });
    }

    // Try influencer
    const influencerUser = await prisma.influencer.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });

    if (influencerUser) {
      // Create new access token for influencer
      const newAccessToken = await new SignJWT({
        id: influencerUser.id,
        email: influencerUser.email,
        name: influencerUser.name,
        role: 'influencer',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.influencer)
        .sign(JWT_SECRET);

      // Create new refresh token
      const newRefreshToken = await new SignJWT({
        id: influencerUser.id,
        type: 'refresh',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
        .sign(JWT_SECRET);

      logger.info('Token refreshed for influencer', { userId: influencerUser.id });

      return NextResponse.json({
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: influencerUser.id,
          email: influencerUser.email,
          name: influencerUser.name,
          role: 'influencer',
        },
      });
    }

    // Try User table (unified: admin, staff, support, patient, sales_rep)
    const appUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        clinicId: true,
        providerId: true,
        patientId: true,
        permissions: true,
        features: true,
      },
    });

    if (appUser) {
      const expiry =
        String(appUser.role).toUpperCase() === 'PATIENT'
          ? AUTH_CONFIG.tokenExpiry.patient
          : AUTH_CONFIG.tokenExpiry.access;
      const payload: Record<string, unknown> = {
        id: appUser.id,
        email: appUser.email,
        name: `${appUser.firstName || ''} ${appUser.lastName || ''}`.trim() || appUser.email,
        role: appUser.role,
      };
      if (appUser.clinicId != null) payload.clinicId = appUser.clinicId;
      if (appUser.providerId != null) payload.providerId = appUser.providerId;
      if (appUser.patientId != null) payload.patientId = appUser.patientId;
      if (Array.isArray(appUser.permissions)) payload.permissions = appUser.permissions;
      if (Array.isArray(appUser.features)) payload.features = appUser.features;

      const newAccessToken = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(expiry)
        .sign(JWT_SECRET);

      const newRefreshToken = await new SignJWT({
        id: appUser.id,
        type: 'refresh',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
        .sign(JWT_SECRET);

      logger.info('Token refreshed for user', {
        userId: appUser.id,
        role: appUser.role,
        clinicId: appUser.clinicId ?? undefined,
      });

      return NextResponse.json({
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: appUser.id,
          email: appUser.email,
          firstName: appUser.firstName,
          lastName: appUser.lastName,
          name: `${appUser.firstName || ''} ${appUser.lastName || ''}`.trim() || appUser.email,
          role: appUser.role,
          clinicId: appUser.clinicId ?? undefined,
          providerId: appUser.providerId ?? undefined,
          patientId: appUser.patientId ?? undefined,
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
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  } catch (error: unknown) {
    logger.error('Token refresh error:', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({ error: 'Failed to refresh token' }, { status: 500 });
  }
}
