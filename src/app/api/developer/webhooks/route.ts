/**
 * Webhook Management API
 * Configure and manage webhook subscriptions
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import crypto from 'crypto';
import { z } from 'zod';
import { WEBHOOK_EVENTS, type WebhookEvent } from '@/lib/webhooks/constants';

// Webhook events are now imported from constants
/* const WEBHOOK_EVENTS = {
  // Patient events
  'patient.created': 'When a new patient is created',
  'patient.updated': 'When patient information is updated',
  'patient.deleted': 'When a patient is deleted',
  
  // Order events
  'order.created': 'When a new order is placed',
  'order.updated': 'When order status changes',
  'order.shipped': 'When order is shipped',
  'order.delivered': 'When order is delivered',
  
  // Payment events
  'payment.succeeded': 'When a payment is successful',
  'payment.failed': 'When a payment fails',
  'payment.refunded': 'When a payment is refunded',
  
  // User events
  'user.created': 'When a new user is created',
  'user.updated': 'When user information is updated',
  'user.login': 'When a user logs in',
  
  // SOAP Note events
  'soapnote.created': 'When a SOAP note is created',
  'soapnote.approved': 'When a SOAP note is approved',
  
  // Integration events
  'integration.connected': 'When an integration is connected',
  'integration.disconnected': 'When an integration is disconnected',
  'integration.error': 'When an integration error occurs',
}; */

// Webhook schema
const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  description: z.string().optional(),
  headers: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
});

/**
 * GET /api/developer/webhooks
 * List all webhook subscriptions
 */
export const GET = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Check permission
      if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_READ)) {
        return NextResponse.json(
          { error: 'You do not have permission to view webhooks' },
          { status: 403 }
        );
      }

      // Get webhook logs from database
      const recentLogs = await prisma.webhookLog.findMany({
        select: {
          id: true,
          endpoint: true,
          status: true,
          statusCode: true,
          createdAt: true,
        },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });

      // Group logs by endpoint for statistics
      const endpointStats = recentLogs.reduce(
        (
          acc: Record<string, { total: number; success: number; failed: number }>,
          log: { endpoint: string; status: string }
        ) => {
          if (!acc[log.endpoint]) {
            acc[log.endpoint] = {
              total: 0,
              success: 0,
              failed: 0,
            };
          }
          acc[log.endpoint].total++;
          if ((log.status as string) === 'SUCCESS' || (log.status as string) === 'processed') {
            acc[log.endpoint].success++;
          } else {
            acc[log.endpoint].failed++;
          }
          return acc;
        },
        {}
      );

      // Mock webhook subscriptions (in production, fetch from database)
      const webhooks = [
        {
          id: 1,
          name: 'Order Updates',
          url: 'https://api.example.com/webhooks/orders',
          events: ['order.created', 'order.updated', 'order.shipped'],
          secret: 'whsec_••••••••••••••••',
          enabled: true,
          createdAt: new Date('2024-01-15'),
          lastTriggered: new Date('2024-11-25'),
          stats: endpointStats['/api/webhooks/orders'] || { total: 0, success: 0, failed: 0 },
        },
        {
          id: 2,
          name: 'Patient Notifications',
          url: 'https://api.example.com/webhooks/patients',
          events: ['patient.created', 'patient.updated'],
          secret: 'whsec_••••••••••••••••',
          enabled: true,
          createdAt: new Date('2024-03-01'),
          lastTriggered: new Date('2024-11-24'),
          stats: endpointStats['/api/webhooks/patients'] || { total: 0, success: 0, failed: 0 },
        },
      ];

      return NextResponse.json({
        webhooks,
        availableEvents: Object.entries(WEBHOOK_EVENTS).map(([key, description]) => ({
          event: key,
          description,
        })),
        meta: {
          total: webhooks.length,
          active: webhooks.filter((w: any) => w.enabled).length,
        },
      });
    } catch (error: any) {
      // @ts-ignore

      logger.error('Error fetching webhooks:', error);
      return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 });
    }
  },
  { roles: ['admin', 'admin', 'provider'] }
);

/**
 * POST /api/developer/webhooks
 * Create a new webhook subscription
 */
export const POST = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Check permission
      if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_CREATE)) {
        return NextResponse.json(
          { error: 'You do not have permission to create webhooks' },
          { status: 403 }
        );
      }

      const body = await req.json();
      const validated = createWebhookSchema.parse(body);

      // Validate events
      const invalidEvents = validated.events.filter((e: any) => !(e in WEBHOOK_EVENTS));
      if (invalidEvents.length > 0) {
        return NextResponse.json(
          { error: `Invalid events: ${invalidEvents.join(', ')}` },
          { status: 400 }
        );
      }

      // Generate webhook secret
      const secret = 'whsec_' + crypto.randomBytes(32).toString('base64url');

      // Test the webhook URL
      let testResult = { success: false, message: '' };
      try {
        const testPayload = {
          event: 'webhook.test',
          data: {
            message: 'This is a test webhook from Lifefile EHR',
            timestamp: new Date().toISOString(),
          },
        };

        const signature = crypto
          .createHmac('sha256', secret)
          .update(JSON.stringify(testPayload))
          .digest('hex');

        const response = await fetch(validated.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            ...validated.headers,
          },
          body: JSON.stringify(testPayload),
        });

        testResult = {
          success: response.ok,
          message: response.ok
            ? 'Webhook URL is reachable'
            : `Webhook returned status ${response.status}`,
        };
      } catch (error: any) {
        testResult = {
          success: false,
          message: `Failed to reach webhook: ${error.message}`,
        };
      }

      // In production, save to database
      const newWebhook = {
        id: Date.now(),
        name: validated.name,
        url: validated.url,
        events: validated.events,
        description: validated.description,
        headers: validated.headers,
        secret, // Only return on creation
        enabled: validated.enabled,
        createdAt: new Date(),
        createdBy: user.email,
        testResult,
      };

      // Create audit log
      await (prisma.userAuditLog as any)
        .create({
          data: {
            userId: user.id > 0 ? user.id : undefined,
            action: 'WEBHOOK_CREATED',
            details: {
              webhookName: validated.name,
              webhookId: newWebhook.id,
              url: validated.url,
              events: validated.events,
              testResult,
            },
            ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
            userAgent: req.headers.get('user-agent'),
          },
        })
        .catch((error: Error) => {
          logger.warn('Failed to create audit log:', error);
        });

      logger.info('Webhook created', { webhookName: validated.name, userId: user.id });

      return NextResponse.json({
        success: true,
        message: 'Webhook created successfully. Store the secret securely.',
        webhook: newWebhook,
        testResult,
      });
    } catch (error: any) {
      logger.error('Error creating webhook:', error);

      if (error.name === 'ZodError') {
        return NextResponse.json(
          { error: 'Invalid request data', details: error.errors },
          { status: 400 }
        );
      }

      return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
    }
  },
  { roles: ['admin', 'admin'] }
);

/**
 * POST /api/developer/webhooks/test
 * Test a webhook endpoint
 */
// Test endpoint (not exported in production)
/* const POST_TEST = withAuth(async (req: NextRequest, user) => {
  try {
    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_UPDATE)) {
      return NextResponse.json(
        { error: 'You do not have permission to test webhooks' },
        { status: 403 }
      );
    }
    
    const body = await req.json();
    const { webhookId, event } = body;
    
    if (!webhookId || !event) {
      return NextResponse.json(
        { error: 'Webhook ID and event are required' },
        { status: 400 }
      );
    }
    
    // In production, fetch webhook from database
    const webhook = {
      url: 'https://api.example.com/webhooks/test',
      secret: 'whsec_test123',
      headers: {},
    };
    
    // Create test payload
    const testPayload = {
      event,
      timestamp: new Date().toISOString(),
      data: generateTestData(event),
    };
    
    // Calculate signature
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(JSON.stringify(testPayload))
      .digest('hex');
    
    // Send test webhook
    const startTime = Date.now();
    let response;
    let error;
    
    try {
      response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
          'X-Webhook-Test': 'true',
          ...webhook.headers,
        },
        body: JSON.stringify(testPayload),
      });
    } catch (err: any) {
      error = err;
    }
    
    const duration = Date.now() - startTime;
    
    // Log webhook test
    await prisma.webhookLog.create({
      data: {
        endpoint: webhook.url,
        method: 'POST',
        headers: {
          'X-Webhook-Event': event,
          'X-Webhook-Test': 'true',
        },
        payload: testPayload,
        status: (response?.ok ? 'SUCCESS' : 'ERROR') as any,
        statusCode: response?.status || 0,
        errorMessage: error?.message,
        processingTimeMs: duration,
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        userAgent: req.headers.get('user-agent'),
      },
    });
    
    const result = {
      success: response?.ok || false,
      statusCode: response?.status || 0,
      duration,
      message: response?.ok 
        ? 'Test webhook sent successfully' 
        : error?.message || `Webhook returned status ${response?.status}`,
      payload: testPayload,
    };
    
    logger.info('Webhook test', { event, userId: user.id, success: result.success });
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error testing webhook:', error);
    return NextResponse.json(
      { error: 'Failed to test webhook' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin"] }); */

/**
 * Generate test data for different webhook events
 */
function generateTestData(event: string): any {
  const baseData = {
    id: Math.floor(Math.random() * 10000),
    timestamp: new Date().toISOString(),
  };

  switch (event) {
    case 'patient.created':
      return {
        ...baseData,
        patient: {
          id: baseData.id,
          firstName: 'Test',
          lastName: 'Patient',
          email: 'test@example.com',
          phone: '555-0123',
        },
      };

    case 'order.created':
      return {
        ...baseData,
        order: {
          id: baseData.id,
          patientId: 123,
          providerId: 456,
          status: 'PENDING',
          items: [{ medication: 'Test Med', quantity: 30 }],
        },
      };

    case 'payment.succeeded':
      return {
        ...baseData,
        payment: {
          id: baseData.id,
          amount: 9900,
          currency: 'usd',
          status: 'succeeded',
          patientId: 123,
        },
      };

    default:
      return baseData;
  }
}
