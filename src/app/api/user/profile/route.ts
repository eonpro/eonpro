/**
 * User Profile API
 * 
 * Handles user profile information retrieval and updates.
 * Works for all authenticated users.
 * 
 * GET - Get current user's profile information
 * PATCH - Update profile information (firstName, lastName, phone)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Validation schema for profile updates
const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).optional().nullable(),
  preferredLanguage: z.enum(['en', 'es']).optional(),
});

/**
 * GET /api/user/profile
 * Returns the current user's profile information
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        avatarUrl: true,
        status: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        lastLogin: true,
        metadata: true,
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const metadata = (dbUser.metadata as Record<string, unknown>) || {};
    const preferredLanguage = (metadata.preferredLanguage as string) || 'en';

    return NextResponse.json({
      id: dbUser.id,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      email: dbUser.email,
      phone: dbUser.phone,
      role: dbUser.role,
      avatarUrl: dbUser.avatarUrl,
      status: dbUser.status,
      emailVerified: dbUser.emailVerified,
      twoFactorEnabled: dbUser.twoFactorEnabled,
      createdAt: dbUser.createdAt,
      lastLogin: dbUser.lastLogin,
      preferredLanguage: preferredLanguage === 'es' ? 'es' : 'en',
      clinic: dbUser.clinic,
    });
  } catch (error) {
    logger.error('[User Profile] GET error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to get profile' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user/profile
 * Update user profile information
 */
async function handlePatch(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    
    // Validate input
    const parseResult = updateProfileSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { firstName, lastName, phone, preferredLanguage } = parseResult.data;

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {};
    
    if (firstName !== undefined) {
      updateData.firstName = firstName;
    }
    
    if (lastName !== undefined) {
      updateData.lastName = lastName;
    }
    
    if (phone !== undefined) {
      updateData.phone = phone || null;
    }

    if (preferredLanguage !== undefined) {
      const current = await prisma.user.findUnique({
        where: { id: user.id },
        select: { metadata: true },
      });
      const metadata = (current?.metadata as Record<string, unknown>) || {};
      updateData.metadata = { ...metadata, preferredLanguage };
    }

    // If no fields to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        avatarUrl: true,
        metadata: true,
      },
    });

    logger.info('[User Profile] Updated', {
      userId: user.id,
      updatedFields: Object.keys(updateData),
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    logger.error('[User Profile] PATCH error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}

// All authenticated users can manage their profile
export const GET = withAuth(handleGet);
export const PATCH = withAuth(handlePatch);
