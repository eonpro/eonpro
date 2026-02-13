/**
 * Webhook Configuration API
 * Configure, test, and manage webhooks for real-time events
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import crypto from 'crypto';
import { z } from 'zod';
import {
  handleApiError,
  ForbiddenError,
  BadRequestError,
  NotFoundError,
} from '@/domains/shared/errors';

// Webhook configuration schema
const webhookSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  headers: z.record(z.string()).optional(),
  secret: z.string().optional(),
  retryPolicy: z
    .object({
      maxAttempts: z.number().min(1).max(5).default(3),
      backoffMultiplier: z.number().min(1).max(5).default(2),
      initialDelay: z.number().min(1000).max(60000).default(5000),
    })
    .optional(),
  integrationId: z.number().optional(),
});

// Available webhook events
const WEBHOOK_EVENTS = {
  // User events
  'user.created': 'When a new user is created',
  'user.updated': 'When a user is updated',
  'user.deleted': 'When a user is deleted',
  'user.login': 'When a user logs in',
  'user.logout': 'When a user logs out',

  // Patient events
  'patient.created': 'When a new patient is created',
  'patient.updated': 'When a patient is updated',
  'patient.deleted': 'When a patient is deleted',

  // Order events
  'order.created': 'When a new order is created',
  'order.updated': 'When an order is updated',
  'order.shipped': 'When an order is shipped',
  'order.delivered': 'When an order is delivered',
  'order.cancelled': 'When an order is cancelled',

  // SOAP Note events
  'soapnote.created': 'When a SOAP note is created',
  'soapnote.approved': 'When a SOAP note is approved',
  'soapnote.locked': 'When a SOAP note is locked',

  // Payment events
  'payment.succeeded': 'When a payment succeeds',
  'payment.failed': 'When a payment fails',
  'payment.refunded': 'When a payment is refunded',

  // Subscription events
  'subscription.created': 'When a subscription is created',
  'subscription.updated': 'When a subscription is updated',
  'subscription.cancelled': 'When a subscription is cancelled',
  'subscription.renewed': 'When a subscription is renewed',

  // Integration events
  'integration.connected': 'When an integration is connected',
  'integration.disconnected': 'When an integration is disconnected',
  'integration.error': 'When an integration encounters an error',

  // System events
  'system.maintenance': 'When system maintenance is scheduled',
  'system.alert': 'When a system alert is triggered',
};

/**
 * Generate webhook signature
 */
function generateWebhookSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * GET /api/admin/webhooks
 * List all webhook configurations
 */
export const GET = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Check permission
      if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_READ)) {
        throw new ForbiddenError('You do not have permission to view webhooks');
      }

      // Get all webhooks
      const webhooks = await prisma.webhookConfig.findMany({
        include: {
          integration: {
            select: {
              name: true,
              provider: true,
            },
          },
          _count: {
            select: {
              deliveries: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get recent deliveries
      const recentDeliveries = await prisma.webhookDelivery.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: {
          webhook: {
            select: {
              name: true,
              url: true,
            },
          },
        },
      });

      // Calculate statistics
      const deliveryStats = await prisma.webhookDelivery.groupBy({
        by: ['status'],
        _count: true,
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      });

      const stats = {
        total: webhooks.length,
        active: webhooks.filter((w: { isActive: boolean }) => w.isActive).length,
        inactive: webhooks.filter((w: { isActive: boolean }) => !w.isActive).length,
        deliveries24h: deliveryStats.reduce(
          (sum: number, stat: { _count: number }) => sum + stat._count,
          0
        ),
        successful24h:
          deliveryStats.find((s: { status: string }) => s.status === 'DELIVERED')?._count || 0,
        failed24h:
          deliveryStats.find((s: { status: string }) => s.status === 'FAILED')?._count || 0,
      };

      return NextResponse.json({
        webhooks: webhooks.map((webhook: any) => ({
          ...webhook,
          totalDeliveries: webhook._count.deliveries,
          eventsCount: (webhook.events as string[]).length,
        })),
        availableEvents: WEBHOOK_EVENTS,
        recentDeliveries,
        stats,
      });
    } catch (error) {
      return handleApiError(error, { route: 'GET /api/admin/webhooks' });
    }
  },
  { roles: ['admin', 'admin'] }
);

/**
 * POST /api/admin/webhooks
 * Create a new webhook configuration
 */
export const POST = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Check permission
      if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_CREATE)) {
        throw new ForbiddenError('You do not have permission to create webhooks');
      }

      const body = await req.json();
      const validated = webhookSchema.parse(body);

      // Validate events
      const validEvents = validated.events.filter((event: string) =>
        Object.keys(WEBHOOK_EVENTS).includes(event)
      );

      if (validEvents.length === 0) {
        throw new BadRequestError('At least one valid event is required');
      }

      // Generate secret if not provided
      const secret = validated.secret || crypto.randomBytes(32).toString('hex');

      // Create webhook
      const webhook = await prisma.webhookConfig.create({
        data: {
          name: validated.name,
          url: validated.url,
          events: validEvents,
          headers: validated.headers || {},
          secret,
          isActive: true,
          retryPolicy: validated.retryPolicy || {
            maxAttempts: 3,
            backoffMultiplier: 2,
            initialDelay: 5000,
          },
          integrationId: validated.integrationId,
        },
      });

      // Test the webhook endpoint
      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: {
          message: 'This is a test webhook from Lifefile',
          webhookId: webhook.id,
        },
      };

      const signature = generateWebhookSignature(JSON.stringify(testPayload), secret);

      // Send test webhook
      try {
        const response = await fetch(validated.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': 'webhook.test',
            ...validated.headers,
          },
          body: JSON.stringify(testPayload),
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        // Log delivery attempt
        await prisma.webhookDelivery.create({
          data: {
            webhookId: webhook.id,
            event: 'webhook.test',
            payload: testPayload,
            status: response.ok ? 'DELIVERED' : 'FAILED',
            statusCode: response.status,
            deliveredAt: response.ok ? new Date() : undefined,
          },
        });

        if (!response.ok) {
          logger.warn(`Webhook test failed for ${validated.url}: ${response.status}`);
        }
      } catch (error: any) {
        // @ts-ignore

        logger.error(`Webhook test failed for ${validated.url}:`, error);

        await prisma.webhookDelivery.create({
          data: {
            webhookId: webhook.id,
            event: 'webhook.test',
            payload: testPayload,
            status: 'FAILED' as any,
            error: (error as Error).message,
          },
        });
      }

      logger.info('Webhook created', { webhookName: validated.name, userId: user.id });

      return NextResponse.json({
        success: true,
        message: 'Webhook created successfully',
        webhook: {
          id: webhook.id,
          name: webhook.name,
          url: webhook.url,
          events: validEvents,
          secret, // Return secret only on creation
          isActive: webhook.isActive,
        },
      });
    } catch (error) {
      return handleApiError(error, { route: 'POST /api/admin/webhooks' });
    }
  },
  { roles: ['admin', 'admin'] }
);

/**
 * PUT /api/admin/webhooks
 * Update webhook configuration
 */
export const PUT = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Check permission
      if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_UPDATE)) {
        throw new ForbiddenError('You do not have permission to update webhooks');
      }

      const body = await req.json();
      const { id, name, url, events, headers, isActive, retryPolicy } = body;

      if (!id) {
        throw new BadRequestError('Webhook ID is required');
      }

      // Get existing webhook
      const existing = await prisma.webhookConfig.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new NotFoundError('Webhook not found');
      }

      // Prepare update data
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (name) updateData.name = name;
      if (url) updateData.url = url;
      if (headers) updateData.headers = headers;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (retryPolicy) updateData.retryPolicy = retryPolicy;

      if (events && Array.isArray(events)) {
        const validEvents = events.filter((event: any) =>
          Object.keys(WEBHOOK_EVENTS).includes(event)
        );
        if (validEvents.length > 0) {
          updateData.events = validEvents;
        }
      }

      // Update webhook
      const updated = await prisma.webhookConfig.update({
        where: { id },
        data: updateData,
      });

      logger.info('Webhook updated', { webhookName: existing.name, userId: user.id });

      return NextResponse.json({
        success: true,
        message: 'Webhook updated successfully',
        webhook: {
          id: updated.id,
          name: updated.name,
          url: updated.url,
          events: updated.events,
          isActive: updated.isActive,
        },
      });
    } catch (error) {
      return handleApiError(error, { route: 'PUT /api/admin/webhooks' });
    }
  },
  { roles: ['admin', 'admin'] }
);

/**
 * DELETE /api/admin/webhooks
 * Delete a webhook configuration
 */
export const DELETE = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Check permission
      if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_DELETE)) {
        throw new ForbiddenError('You do not have permission to delete webhooks');
      }

      const { searchParams } = new URL(req.url);
      const id = parseInt(searchParams.get('id') || '0');

      if (!id) {
        throw new BadRequestError('Webhook ID is required');
      }

      // Get webhook
      const webhook = await prisma.webhookConfig.findUnique({
        where: { id },
      });

      if (!webhook) {
        throw new NotFoundError('Webhook not found');
      }

      // Delete webhook and its deliveries
      await prisma.$transaction([
        prisma.webhookDelivery.deleteMany({ where: { webhookId: id } }),
        prisma.webhookConfig.delete({ where: { id } }),
      ]);

      logger.info('Webhook deleted', { webhookName: webhook.name, userId: user.id });

      return NextResponse.json({
        success: true,
        message: 'Webhook deleted successfully',
      });
    } catch (error) {
      return handleApiError(error, { route: 'DELETE /api/admin/webhooks' });
    }
  },
  { roles: ['admin', 'admin'] }
);
