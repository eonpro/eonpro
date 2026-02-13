/**
 * API Key Management
 * Create and manage API keys for programmatic access
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import crypto from 'crypto';
import { z } from 'zod';

// API Key schema
const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
  rateLimit: z.number().min(1).max(10000).optional(),
});

/**
 * GET /api/developer/api-keys
 * List all API keys for the user/organization
 */
export const GET = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Check permission
      if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_READ)) {
        return NextResponse.json(
          { error: 'You do not have permission to view API keys' },
          { status: 403 }
        );
      }

      // In production, fetch from database
      // For now, return mock data
      const apiKeys = [
        {
          id: 1,
          name: 'Production API Key',
          description: 'Main production API access',
          key: 'sk_live_••••••••••••••••',
          permissions: ['patient:read', 'order:create'],
          createdAt: new Date('2024-01-01'),
          lastUsed: new Date('2024-11-26'),
          expiresAt: null,
          rateLimit: 1000,
          usageCount: 15234,
          status: 'active',
        },
        {
          id: 2,
          name: 'Development API Key',
          description: 'Development environment access',
          key: 'sk_test_••••••••••••••••',
          permissions: ['*'],
          createdAt: new Date('2024-06-01'),
          lastUsed: new Date('2024-11-25'),
          expiresAt: new Date('2025-06-01'),
          rateLimit: 100,
          usageCount: 542,
          status: 'active',
        },
      ];

      return NextResponse.json({
        apiKeys,
        meta: {
          total: apiKeys.length,
          active: apiKeys.filter((k: any) => k.status === 'active').length,
        },
      });
    } catch (error: any) {
      // @ts-ignore

      logger.error('Error fetching API keys:', error);
      return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
    }
  },
  { roles: ['admin', 'admin', 'provider'] }
);

/**
 * POST /api/developer/api-keys
 * Create a new API key
 */
export const POST = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Check permission
      if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_CREATE)) {
        return NextResponse.json(
          { error: 'You do not have permission to create API keys' },
          { status: 403 }
        );
      }

      const body = await req.json();
      const validated = createApiKeySchema.parse(body);

      // Generate secure API key
      const prefix =
        process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test'
          ? 'sk_live_'
          : 'sk_test_';
      const apiKey = prefix + crypto.randomBytes(32).toString('base64url');
      const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

      // In production, save to database
      // For now, return mock response
      const newApiKey = {
        id: Date.now(),
        name: validated.name,
        description: validated.description,
        key: apiKey, // Only return full key on creation
        hashedKey, // Store this in database
        permissions: validated.permissions || ['patient:read', 'order:read'],
        createdAt: new Date(),
        expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : undefined,
        rateLimit: validated.rateLimit || 100,
        createdBy: user.email,
        status: 'active',
      };

      // Create audit log
      await (prisma.userAuditLog as any)
        .create({
          data: {
            userId: user.id > 0 ? user.id : undefined,
            action: 'API_KEY_CREATED',
            details: {
              keyName: validated.name,
              keyId: newApiKey.id,
              permissions: validated.permissions,
              expiresAt: validated.expiresAt,
            },
            ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
            userAgent: req.headers.get('user-agent'),
          },
        })
        .catch((error: Error) => {
          logger.warn('Failed to create audit log:', error);
        });

      logger.info('API key created', { keyName: validated.name, userId: user.id });

      return NextResponse.json({
        success: true,
        message:
          'API key created successfully. Store this key securely - it will not be shown again.',
        apiKey: newApiKey,
      });
    } catch (error: any) {
      logger.error('Error creating API key:', error);

      if (error.name === 'ZodError') {
        return NextResponse.json(
          { error: 'Invalid request data', details: error.errors },
          { status: 400 }
        );
      }

      return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }
  },
  { roles: ['admin', 'admin'] }
);

/**
 * DELETE /api/developer/api-keys
 * Revoke an API key
 */
export const DELETE = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Check permission
      if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_DELETE)) {
        return NextResponse.json(
          { error: 'You do not have permission to delete API keys' },
          { status: 403 }
        );
      }

      const { searchParams } = new URL(req.url);
      const keyId = searchParams.get('id');

      if (!keyId) {
        return NextResponse.json({ error: 'API key ID is required' }, { status: 400 });
      }

      // In production, delete from database
      // For now, return success

      // Create audit log
      await (prisma.userAuditLog as any)
        .create({
          data: {
            userId: user.id > 0 ? user.id : undefined,
            action: 'API_KEY_REVOKED',
            details: {
              keyId,
              revokedBy: user.email,
            },
            ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
            userAgent: req.headers.get('user-agent'),
          },
        })
        .catch((error: Error) => {
          logger.warn('Failed to create audit log:', error);
        });

      logger.info('API key revoked', { keyId, userId: user.id });

      return NextResponse.json({
        success: true,
        message: 'API key revoked successfully',
      });
    } catch (error: any) {
      // @ts-ignore

      logger.error('Error revoking API key:', error);
      return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 });
    }
  },
  { roles: ['admin', 'admin'] }
);

/**
 * PUT /api/developer/api-keys
 * Update an API key (regenerate, update permissions, etc.)
 */
export const PUT = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Check permission
      if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_UPDATE)) {
        return NextResponse.json(
          { error: 'You do not have permission to update API keys' },
          { status: 403 }
        );
      }

      const body = await req.json();
      const { id, action, ...updateData } = body;

      if (!id) {
        return NextResponse.json({ error: 'API key ID is required' }, { status: 400 });
      }

      let responseData: any = { success: true };

      switch (action) {
        case 'regenerate':
          // Generate new key
          const prefix =
            process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test'
              ? 'sk_live_'
              : 'sk_test_';
          const newApiKey = prefix + crypto.randomBytes(32).toString('base64url');
          const hashedKey = crypto.createHash('sha256').update(newApiKey).digest('hex');

          // In production, update in database
          responseData = {
            success: true,
            message: 'API key regenerated successfully. Store this new key securely.',
            newKey: newApiKey,
          };

          logger.info('API key regenerated', { keyId: id, userId: user.id });
          break;

        case 'update':
          // Update permissions, rate limit, expiry, etc.
          // In production, update in database
          responseData = {
            success: true,
            message: 'API key updated successfully',
            updated: updateData,
          };

          logger.info('API key updated', { keyId: id, userId: user.id });
          break;

        default:
          return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
      }

      // Create audit log
      await (prisma.userAuditLog as any)
        .create({
          data: {
            userId: user.id > 0 ? user.id : undefined,
            action: `API_KEY_${action.toUpperCase()}`,
            details: {
              keyId: id,
              action,
              updateData,
              updatedBy: user.id,
            },
            ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
            userAgent: req.headers.get('user-agent'),
          },
        })
        .catch((error: Error) => {
          logger.warn('Failed to create audit log:', error);
        });

      return NextResponse.json(responseData);
    } catch (error: any) {
      // @ts-ignore

      logger.error('Error updating API key:', error);
      return NextResponse.json({ error: 'Failed to update API key' }, { status: 500 });
    }
  },
  { roles: ['admin', 'admin'] }
);
