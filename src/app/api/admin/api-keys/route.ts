/**
 * API Key Management
 * Generate, manage, and revoke API keys for programmatic access
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import crypto from 'crypto';
import { z } from 'zod';

// API key creation schema
const createApiKeySchema = z.object({
  name: z.string().min(1),
  permissions: z.array(z.string()),
  rateLimit: z.number().min(10).max(10000).default(1000),
  expiresIn: z.enum(['30d', '90d', '1y', 'never']).default('90d'),
  integrationId: z.number().optional(),
});

/**
 * Generate a secure API key
 */
function generateApiKey(): { key: string; hashedKey: string; prefix: string } {
  const key = `lfsk_${crypto.randomBytes(32).toString('hex')}`;
  const hashedKey = crypto.createHash('sha256').update(key).digest('hex');
  const prefix = key.substring(0, 11); // lfsk_xxx
  
  return { key, hashedKey, prefix };
}

/**
 * Calculate expiration date
 */
function calculateExpiry(expiresIn: string): Date | null {
  const now = new Date();
  
  switch (expiresIn) {
    case '30d':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    case '1y':
      return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    case 'never':
      return null;
    default:
      return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  }
}

/**
 * GET /api/admin/api-keys
 * List all API keys
 */
export const GET = withAuth(async (req: NextRequest, user) => {
  try {
    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.SYSTEM_CONFIG)) {
      return NextResponse.json(
        { error: 'You do not have permission to view API keys' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'ACTIVE';

    // Get API keys (only show prefix, not full key)
    const apiKeys = await prisma.apiKey.findMany({
      where: status !== 'ALL' ? { status: status as any } : {},
      select: {
        id: true,
        name: true,
        prefix: true,
        permissions: true,
        rateLimit: true,
        status: true,
        lastUsedAt: true,
        lastUsedIp: true,
        expiresAt: true,
        createdAt: true,
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        integration: {
          select: {
            name: true,
            provider: true,
          },
        },
        _count: {
          select: {
            usageLogs: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get usage statistics
    const usageStats = await prisma.apiUsageLog.groupBy({
      by: ['apiKeyId'],
      where: {
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      _count: true,
      _avg: {
        responseTime: true,
      },
    });

    // Map usage stats to API keys
    const keysWithStats = apiKeys.map((key: any) => {
      const stats = usageStats.find((s: any) => s.apiKeyId === key.id);
      
      return {
        ...key,
        usage24h: stats?._count || 0,
        avgResponseTime: stats?._avg?.responseTime || 0,
        totalUsage: key._count.usageLogs,
        isExpired: key.expiresAt ? new Date(key.expiresAt) < new Date() : false,
      };
    });

    return NextResponse.json({
      apiKeys: keysWithStats,
      stats: {
        total: apiKeys.length,
        active: apiKeys.filter((k: any) => k.status === 'ACTIVE').length,
        expired: apiKeys.filter((k: any) => k.expiresAt && new Date(k.expiresAt) < new Date()).length,
        revoked: apiKeys.filter((k: any) => k.status === 'REVOKED').length,
      },
    });
    
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error fetching API keys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch API keys' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin"] });

/**
 * POST /api/admin/api-keys
 * Generate a new API key
 */
export const POST = withAuth(async (req: NextRequest, user) => {
  try {
    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.SYSTEM_CONFIG)) {
      return NextResponse.json(
        { error: 'You do not have permission to create API keys' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = createApiKeySchema.parse(body);

    // Generate API key
    const { key, hashedKey, prefix } = generateApiKey();
    const expiresAt = calculateExpiry(validated.expiresIn);

    // Validate permissions
    const validPermissions = validated.permissions.filter((p: any) => 
      Object.values(PERMISSIONS).includes(p as any)
    );

    if (validPermissions.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid permission is required' },
        { status: 400 }
      );
    }

    // Create API key
    const apiKey = await prisma.apiKey.create({
      data: {
        name: validated.name,
        key, // Store the full key (should be encrypted in production)
        hashedKey,
        prefix,
        permissions: validPermissions,
        rateLimit: validated.rateLimit,
        expiresAt,
        status: 'ACTIVE',
        userId: user.id,
        integrationId: validated.integrationId,
      },
    });

    // Log API key creation
    await prisma.userAuditLog.create({ data: {
        userId: user.id,
        action: 'API_KEY_CREATED',
        details: {
          keyName: validated.name,
          keyId: apiKey.id,
          prefix,
          permissions: validPermissions.length,
          expiresIn: validated.expiresIn,
        },
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        userAgent: req.headers.get('user-agent'),
      },
    });

    logger.info(`API key ${validated.name} created by ${user.email}`);

    // Return the key only once (user must save it)
    return NextResponse.json({
      success: true,
      message: 'API key created successfully. Save this key securely - it won\'t be shown again.',
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key, // Full key shown only on creation
        prefix,
        permissions: validPermissions,
        rateLimit: apiKey.rateLimit,
        expiresAt: apiKey.expiresAt,
      },
    });
    
  } catch (error: any) {
    logger.error('Error creating API key:', error);
    
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create API key' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin"] });

/**
 * PUT /api/admin/api-keys
 * Update API key (status, permissions, rate limit)
 */
export const PUT = withAuth(async (req: NextRequest, user) => {
  try {
    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.SYSTEM_CONFIG)) {
      return NextResponse.json(
        { error: 'You do not have permission to update API keys' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, status, permissions, rateLimit, name } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'API key ID is required' },
        { status: 400 }
      );
    }

    // Get existing API key
    const existing = await prisma.apiKey.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {};

    if (status) {
      updateData.status = status;
    }

    if (permissions && Array.isArray(permissions)) {
      const validPermissions = permissions.filter((p: any) => 
        Object.values(PERMISSIONS).includes(p as any)
      );
      updateData.permissions = validPermissions;
    }

    if (rateLimit !== undefined) {
      updateData.rateLimit = Math.max(10, Math.min(10000, rateLimit));
    }

    if (name) {
      updateData.name = name;
    }

    // Update API key
    const updated = await prisma.apiKey.update({
      where: { id },
      data: updateData,
    });

    // Log the update
    await prisma.userAuditLog.create({ data: {
        userId: user.id,
        action: 'API_KEY_UPDATED',
        details: {
          keyId: id,
          keyName: existing.name,
          diff: Object.keys(updateData),
        },
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        userAgent: req.headers.get('user-agent'),
      },
    });

    logger.info(`API key ${existing.name} updated by ${user.email}`);

    return NextResponse.json({
      success: true,
      message: 'API key updated successfully',
      apiKey: {
        id: updated.id,
        name: updated.name,
        prefix: updated.prefix,
        status: updated.status,
        permissions: updated.permissions,
        rateLimit: updated.rateLimit,
      },
    });
    
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error updating API key:', error);
    return NextResponse.json(
      { error: 'Failed to update API key' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin"] });

/**
 * DELETE /api/admin/api-keys
 * Revoke an API key
 */
export const DELETE = withAuth(async (req: NextRequest, user) => {
  try {
    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.SYSTEM_CONFIG)) {
      return NextResponse.json(
        { error: 'You do not have permission to revoke API keys' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = parseInt(searchParams.get('id') || '0');
    const permanent = searchParams.get('permanent') === 'true';

    if (!id) {
      return NextResponse.json(
        { error: 'API key ID is required' },
        { status: 400 }
      );
    }

    // Get API key
    const apiKey = await prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }

    if (permanent) {
      // Hard delete (SUPER_ADMIN only)
      if (user.role !== "admin") {
        return NextResponse.json(
          { error: 'Only Super Admins can permanently delete API keys' },
          { status: 403 }
        );
      }

      // Delete usage logs and key
      await prisma.$transaction([
        prisma.apiUsageLog.deleteMany({ where: { apiKeyId: id } }),
        prisma.apiKey.delete({ where: { id } }),
      ]);

      logger.warn(`API key ${apiKey.name} permanently deleted by ${user.email}`);

      return NextResponse.json({
        success: true,
        message: 'API key permanently deleted',
      });
    } else {
      // Soft delete (revoke)
      await prisma.apiKey.update({
        where: { id },
        data: { status: 'REVOKED' },
      });

      // Log the revocation
      await prisma.userAuditLog.create({ data: {
          userId: user.id,
          action: 'API_KEY_REVOKED',
          details: {
            keyId: id,
            keyName: apiKey.name,
            prefix: apiKey.prefix,
          },
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
          userAgent: req.headers.get('user-agent'),
        },
      });

      logger.info(`API key ${apiKey.name} revoked by ${user.email}`);

      return NextResponse.json({
        success: true,
        message: 'API key revoked successfully',
      });
    }
    
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error revoking API key:', error);
    return NextResponse.json(
      { error: 'Failed to revoke API key' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin"] });
