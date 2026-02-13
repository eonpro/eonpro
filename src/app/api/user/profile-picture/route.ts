/**
 * User Profile Picture API
 *
 * Handles profile picture upload, retrieval, and deletion for all user types.
 * Supports: SUPER_ADMIN, ADMIN, PROVIDER, INFLUENCER, AFFILIATE, PATIENT, STAFF, SUPPORT, SALES_REP
 *
 * GET - Get current user's profile picture URL
 * POST - Upload/update profile picture (accepts multipart form data or generates presigned URL)
 * DELETE - Remove profile picture
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { uploadToS3, deleteFromS3, generateSignedUrl } from '@/lib/integrations/aws/s3Service';
import { FileCategory, STORAGE_CONFIG, isS3Enabled } from '@/lib/integrations/aws/s3Config';
import { v4 as uuidv4 } from 'uuid';

// Maximum file size for profile pictures (5MB)
const MAX_PROFILE_PICTURE_SIZE = 5 * 1024 * 1024;

// Allowed image types for profile pictures
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

/**
 * GET /api/user/profile-picture
 * Returns the current user's profile picture URL
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
        avatarUrl: true,
      },
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If user has an avatar URL and S3 is enabled, generate a fresh signed URL
    let signedUrl = null;
    if (dbUser.avatarUrl) {
      try {
        // Check if the avatarUrl is already a full URL or an S3 key
        if (dbUser.avatarUrl.startsWith('http')) {
          signedUrl = dbUser.avatarUrl;
        } else {
          // It's an S3 key, generate a signed URL
          signedUrl = await generateSignedUrl(dbUser.avatarUrl, 'GET', 3600);
        }
      } catch {
        // If signing fails, the image may have been deleted
        signedUrl = null;
      }
    }

    return NextResponse.json({
      avatarUrl: signedUrl,
      avatarKey: dbUser.avatarUrl, // The S3 key for reference
      user: {
        id: dbUser.id,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        initials: `${dbUser.firstName.charAt(0)}${dbUser.lastName.charAt(0)}`.toUpperCase(),
      },
    });
  } catch (error) {
    logger.error('[Profile Picture] GET error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to get profile picture' }, { status: 500 });
  }
}

/**
 * POST /api/user/profile-picture
 * Upload or generate presigned URL for profile picture
 *
 * Two modes:
 * 1. Direct upload: Send multipart form data with 'file' field
 * 2. Presigned URL: Send JSON { action: 'getUploadUrl', contentType: 'image/jpeg' }
 */
async function handlePost(req: NextRequest, user: AuthUser) {
  try {
    const contentType = req.headers.get('content-type') || '';

    // Handle presigned URL request (JSON body)
    if (contentType.includes('application/json')) {
      const body = await req.json();

      if (body.action === 'getUploadUrl') {
        // Validate content type
        if (!body.contentType || !ALLOWED_TYPES.includes(body.contentType)) {
          return NextResponse.json(
            { error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
            { status: 400 }
          );
        }

        // Generate unique key for the file
        const extension = body.contentType.split('/')[1].replace('jpeg', 'jpg');
        const key = `${STORAGE_CONFIG.PATHS.PROFILE_PICTURES}/${user.id}/${uuidv4()}.${extension}`;

        // Generate presigned URL for upload
        const uploadUrl = await generateSignedUrl(key, 'PUT', 300); // 5 min expiry

        return NextResponse.json({
          uploadUrl,
          key,
          expiresIn: 300,
        });
      }

      // Handle confirm upload (after client uploads to S3)
      if (body.action === 'confirmUpload' && body.key) {
        // Delete old avatar if exists
        const currentUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { avatarUrl: true },
        });

        if (currentUser?.avatarUrl && !currentUser.avatarUrl.startsWith('http')) {
          try {
            await deleteFromS3(currentUser.avatarUrl);
          } catch {
            // Ignore deletion errors for old file
          }
        }

        // Update user with new avatar URL
        await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: body.key },
        });

        // Generate signed URL for immediate use
        const signedUrl = await generateSignedUrl(body.key, 'GET', 3600);

        logger.info('[Profile Picture] Updated via presigned URL', {
          userId: user.id,
          key: body.key,
        });

        return NextResponse.json({
          success: true,
          avatarUrl: signedUrl,
          avatarKey: body.key,
        });
      }

      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Handle direct file upload (multipart form data)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate file size
      if (file.size > MAX_PROFILE_PICTURE_SIZE) {
        return NextResponse.json(
          { error: `File too large. Maximum size: ${MAX_PROFILE_PICTURE_SIZE / 1024 / 1024}MB` },
          { status: 400 }
        );
      }

      // Convert file to buffer
      const buffer = Buffer.from(await file.arrayBuffer());

      // Delete old avatar if exists
      const currentUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { avatarUrl: true },
      });

      if (currentUser?.avatarUrl && !currentUser.avatarUrl.startsWith('http')) {
        try {
          await deleteFromS3(currentUser.avatarUrl);
        } catch {
          // Ignore deletion errors for old file
        }
      }

      // Upload to S3
      const extension = file.type.split('/')[1].replace('jpeg', 'jpg');
      const fileName = `${uuidv4()}.${extension}`;

      const result = await uploadToS3({
        file: buffer,
        fileName,
        category: FileCategory.PROFILE_PICTURES,
        contentType: file.type,
        metadata: {
          userId: user.id.toString(),
          uploadedAt: new Date().toISOString(),
        },
      });

      // Update user with new avatar URL (store the key, not the signed URL)
      await prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl: result.key },
      });

      logger.info('[Profile Picture] Uploaded', {
        userId: user.id,
        key: result.key,
        size: file.size,
      });

      return NextResponse.json({
        success: true,
        avatarUrl: result.url,
        avatarKey: result.key,
      });
    }

    return NextResponse.json(
      { error: 'Invalid request format. Use multipart/form-data or application/json' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('[Profile Picture] POST error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to upload profile picture' }, { status: 500 });
  }
}

/**
 * DELETE /api/user/profile-picture
 * Remove the current user's profile picture
 */
async function handleDelete(req: NextRequest, user: AuthUser) {
  try {
    // Get current avatar
    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    });

    if (!currentUser?.avatarUrl) {
      return NextResponse.json({ error: 'No profile picture to delete' }, { status: 404 });
    }

    // Delete from S3 if it's an S3 key
    if (!currentUser.avatarUrl.startsWith('http')) {
      try {
        await deleteFromS3(currentUser.avatarUrl);
      } catch (error) {
        logger.warn('[Profile Picture] Failed to delete from S3', {
          userId: user.id,
          key: currentUser.avatarUrl,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue even if S3 deletion fails
      }
    }

    // Clear avatar URL in database
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: null },
    });

    logger.info('[Profile Picture] Deleted', { userId: user.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Profile Picture] DELETE error', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to delete profile picture' }, { status: 500 });
  }
}

// All authenticated users can manage their profile picture
export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
export const DELETE = withAuth(handleDelete);
