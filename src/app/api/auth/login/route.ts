/**
 * Login endpoint with rate limiting
 * Example of combining security features
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { prisma } from '@/lib/db';
import { JWT_SECRET, AUTH_CONFIG } from '@/lib/auth/config';
import { strictRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

/**
 * POST /api/auth/login
 * Login endpoint with strict rate limiting
 */
async function loginHandler(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, role = 'patient' } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user from unified User table first
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        provider: true,
        influencer: true,
        patient: true,
      },
    });

    let passwordHash: string | null = null;

    if (user) {
      // User exists in unified system
      passwordHash = user.passwordHash;
    } else {
      // Fallback to legacy tables for backward compatibility
      switch (role) {
        case 'provider':
          const provider: any = await // @ts-ignore
    prisma.provider.findFirst({
            where: { email: email.toLowerCase() },
          });
          if (provider) {
            user = {
              id: provider.id,
              email: provider.email || '',
              firstName: provider.firstName,
              lastName: provider.lastName,
              role: "provider",
              status: 'ACTIVE',
            } as any;
            passwordHash = provider.passwordHash;
          }
          break;

        case 'influencer':
          const influencer = await prisma.influencer.findUnique({
            where: { email: email.toLowerCase() },
          });
          if (influencer) {
            user = {
              id: influencer.id,
              email: influencer.email,
              firstName: influencer.name,
              lastName: '',
              role: "influencer",
              status: 'ACTIVE',
            } as any;
            passwordHash = influencer.passwordHash;
          }
          break;

        case 'admin':
          // Default admin from environment variables
          if (
            email === process.env.ADMIN_EMAIL &&
            password === process.env.ADMIN_PASSWORD
          ) {
            user = {
              id: 0,
              email: process.env.ADMIN_EMAIL,
              firstName: 'Admin',
              lastName: 'User',
              role: "admin",
              status: 'ACTIVE',
            } as any;
            passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD!, 10);
          }
          break;
        
        default:
          return NextResponse.json(
            { error: 'Invalid role specified' },
            { status: 400 }
          );
      }
    }

    // Check if user exists
    if (!user) {
      // Log failed attempt
      logger.warn(`Failed login attempt for ${email} (${role})`);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password (if passwordHash exists)
    if (passwordHash) {
      const isValid = await bcrypt.compare(password, passwordHash);
      if (!isValid) {
        logger.warn(`Invalid password for ${email} (${role})`);
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }
    }

    // Create JWT token
    const tokenPayload: any = {
      id: user.id,
      email: user.email,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      role: user.role || role.toUpperCase(),
      clinicId: 1, // Default clinic ID - in multi-tenant setup, get from user's clinic assignment
    };

    // Add permissions and features if available
    if ('permissions' in user && user.permissions) {
      tokenPayload.permissions = user.permissions;
    }
    if ('features' in user && user.features) {
      tokenPayload.features = user.features;
    }

    const token = await new SignJWT(tokenPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONFIG.tokenExpiry.access)
      .sign(JWT_SECRET);

    // Create refresh token
    const refreshToken = await new SignJWT({
      id: user.id,
      type: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
      .sign(JWT_SECRET);

    // Log successful login
    logger.debug(`Successful login: ${email} (${role})`);

    // Update last login if it's a User model
    if (user && 'lastLogin' in user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { 
          lastLogin: new Date(),
          failedLoginAttempts: 0,
        },
      });
      
      // Create audit log
      await prisma.userAuditLog.create({ data: {
          userId: user.id,
          action: 'LOGIN',
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
          userAgent: req.headers.get('user-agent'),
        },
      }).catch(error => {
        logger.warn('Failed to create audit log:', error);
      });
    }

    // Return tokens
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        role: user.role || role.toUpperCase(),
        permissions: 'permissions' in user ? user.permissions : undefined,
        features: 'features' in user ? user.features : undefined,
      },
      token,
      refreshToken,
    });

    // Set secure cookie
    response.cookies.set({
      name: `${role}-token`,
      value: token,
      ...AUTH_CONFIG.cookie,
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}

// Apply rate limiting to the handler
export const POST = strictRateLimit(loginHandler);
