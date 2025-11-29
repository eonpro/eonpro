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

// Webhook configuration schema
const webhookSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  headers: z.record(z.string()).optional(),
  secret: z.string().optional(),
  retryPolicy: z.object({
    maxAttempts: z.number().min(1).max(5).default(3),
    backoffMultiplier: z.number().min(1).max(5).default(2),
    initialDelay: z.number().min(1000).max(60000).default(5000),
  }).optional(),
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
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

/**
 * GET /api/admin/webhooks
 * List all webhook configurations
 */
export const GET = withAuth(async (req: NextRequest, user) => {
  try {
    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_READ)) {
      return NextResponse.json(
        { error: 'You do not have permission to view webhooks' },
        { status: 403 }
      );
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
      active: webhooks.filter((w: any) => w.isActive).length,
      inactive: webhooks.filter((w: any) => !w.isActive).length,
      deliveries24h: deliveryStats.reduce((sum, stat) => sum + stat._count, 0),
      successful24h: deliveryStats.find((s: any) => s.status === "DELIVERED")?._count || 0,
      failed24h: deliveryStats.find((s: any) => (s.status as any) === "FAILED")?._count || 0,
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
    
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error fetching webhooks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch webhooks' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin"] });

/**
 * POST /api/admin/webhooks
 * Create a new webhook configuration
 */
export const POST = withAuth(async (req: NextRequest, user) => {
  try {
    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_CREATE)) {
      return NextResponse.json(
        { error: 'You do not have permission to create webhooks' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = webhookSchema.parse(body);

    // Validate events
    const validEvents = validated.events.filter((event: any) => 
      Object.keys(WEBHOOK_EVENTS).includes(event)
    );

    if (validEvents.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid event is required' },
        { status: 400 }
      );
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
          deliveredAt: response.ok  ? new Date()  : undefined,
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
          status: "FAILED" as any,
          error: (error as Error).message,
        },
      });
    }

    logger.info(`Webhook ${validated.name} created by ${user.email}`);

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
    
  } catch (error: any) {
    logger.error('Error creating webhook:', error);
    
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid webhook configuration', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create webhook' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin"] });

/**
 * PUT /api/admin/webhooks
 * Update webhook configuration
 */
export const PUT = withAuth(async (req: NextRequest, user) => {
  try {
    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_UPDATE)) {
      return NextResponse.json(
        { error: 'You do not have permission to update webhooks' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, name, url, events, headers, isActive, retryPolicy } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Webhook ID is required' },
        { status: 400 }
      );
    }

    // Get existing webhook
    const existing = await prisma.webhookConfig.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
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

    logger.info(`Webhook ${existing.name} updated by ${user.email}`);

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
    
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error updating webhook:', error);
    return NextResponse.json(
      { error: 'Failed to update webhook' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin"] });

/**
 * DELETE /api/admin/webhooks
 * Delete a webhook configuration
 */
export const DELETE = withAuth(async (req: NextRequest, user) => {
  try {
    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_DELETE)) {
      return NextResponse.json(
        { error: 'You do not have permission to delete webhooks' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = parseInt(searchParams.get('id') || '0');

    if (!id) {
      return NextResponse.json(
        { error: 'Webhook ID is required' },
        { status: 400 }
      );
    }

    // Get webhook
    const webhook = await prisma.webhookConfig.findUnique({
      where: { id },
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Delete webhook and its deliveries
    await prisma.$transaction([
      prisma.webhookDelivery.deleteMany({ where: { webhookId: id } }),
      prisma.webhookConfig.delete({ where: { id } }),
    ]);

    logger.info(`Webhook ${webhook.name} deleted by ${user.email}`);

    return NextResponse.json({
      success: true,
      message: 'Webhook deleted successfully',
    });
    
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error deleting webhook:', error);
    return NextResponse.json(
      { error: 'Failed to delete webhook' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin"] });
