/**
 * Integration Management API
 * Configure and manage third-party integrations
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import { z } from 'zod';
import crypto from 'crypto';

// Integration configuration schema
const integrationSchema = z.object({
  name: z.string(),
  provider: z.enum(['stripe', 'lifefile', 'twilio', 'sendgrid', 'aws', 'sentry', 'openai', 'zoom', 'google', 'microsoft']),
  config: z.object({}).passthrough(),
  credentials: z.object({}).passthrough().optional(),
  webhookUrl: z.string().url().optional(),
});

// Available integrations with their configurations
const AVAILABLE_INTEGRATIONS = {
  stripe: {
    name: 'Stripe',
    description: 'Payment processing and subscription management',
    requiredFields: ['publishableKey', 'secretKey', 'webhookSecret'],
    features: ['payments', 'subscriptions', 'invoicing'],
  },
  lifefile: {
    name: 'Lifefile',
    description: 'Pharmacy fulfillment and prescription management',
    requiredFields: ['apiUrl', 'username', 'password'],
    features: ['prescriptions', 'fulfillment', 'tracking'],
  },
  twilio: {
    name: 'Twilio',
    description: 'SMS, voice, and video communication',
    requiredFields: ['accountSid', 'authToken', 'phoneNumber'],
    features: ['sms', 'voice', 'video', 'chat'],
  },
  sendgrid: {
    name: 'SendGrid',
    description: 'Email delivery and marketing campaigns',
    requiredFields: ['apiKey', 'fromEmail'],
    features: ['transactional', 'marketing', 'templates'],
  },
  aws: {
    name: 'AWS',
    description: 'Cloud storage and computing services',
    requiredFields: ['accessKeyId', 'secretAccessKey', 'region', 'bucket'],
    features: ['storage', 'compute', 'database'],
  },
  sentry: {
    name: 'Sentry',
    description: 'Error tracking and performance monitoring',
    requiredFields: ['dsn', 'environment'],
    features: ['errors', 'performance', 'releases'],
  },
  openai: {
    name: 'OpenAI',
    description: 'AI-powered features and SOAP note generation',
    requiredFields: ['apiKey', 'organization'],
    features: ['gpt4', 'embeddings', 'whisper'],
  },
  zoom: {
    name: 'Zoom',
    description: 'Video conferencing for telemedicine',
    requiredFields: ['clientId', 'clientSecret', 'accountId'],
    features: ['meetings', 'webinars', 'recordings'],
  },
  google: {
    name: 'Google Workspace',
    description: 'Calendar, Drive, and other Google services',
    requiredFields: ['clientId', 'clientSecret', 'redirectUri'],
    features: ['calendar', 'drive', 'maps'],
  },
  microsoft: {
    name: 'Microsoft 365',
    description: 'Office apps and Azure services',
    requiredFields: ['tenantId', 'clientId', 'clientSecret'],
    features: ['teams', 'outlook', 'sharepoint'],
  },
};

/**
 * Encrypt sensitive data using AES-256-GCM
 * @security Uses 16-byte auth tag for integrity verification
 */
function encryptData(data: any): string {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-encryption-key-change-this', 'base64').slice(0, 32);
  const iv = crypto.randomBytes(16);
  // GCM with explicit 16-byte (128-bit) auth tag length for security
  const cipher = crypto.createCipheriv(algorithm, key, iv, { authTagLength: 16 });
  
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return JSON.stringify({
    encrypted,
    authTag: authTag.toString('hex'),
    iv: iv.toString('hex'),
  });
}

/**
 * Decrypt sensitive data using AES-256-GCM
 * @security Uses 16-byte auth tag for integrity verification
 */
function decryptData(encryptedData: string): any {
  try {
    const { encrypted, authTag, iv } = JSON.parse(encryptedData);
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-encryption-key-change-this', 'base64').slice(0, 32);
    
    // GCM with explicit 16-byte (128-bit) auth tag length for security
    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'hex'), { authTagLength: 16 });
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error: any) {
    logger.error('Failed to decrypt data:', error);
    return null;
  }
}

/**
 * GET /api/admin/integrations
 * List all integrations with their status
 */
export const GET = withAuth(async (req: NextRequest, user) => {
  try {
    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_READ)) {
      return NextResponse.json(
        { error: 'You do not have permission to view integrations' },
        { status: 403 }
      );
    }

    // Get all configured integrations
    const integrations = await prisma.integration.findMany({
      select: {
        id: true,
        name: true,
        provider: true,
        status: true,
        lastSyncAt: true,
        errorCount: true,
        lastError: true,
        webhookUrl: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    // Merge with available integrations
    const allIntegrations = Object.entries(AVAILABLE_INTEGRATIONS).map(([key, details]) => {
      const configured = integrations.find((i: any) => i.provider === key);
      
      return {
        provider: key,
        ...details,
        status: configured ? configured.status : 'NOT_CONFIGURED',
        isConfigured: !!configured,
        configuredData: configured || undefined,
      };
    });

    // Get recent integration logs
    const recentLogs = await prisma.integrationLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        integration: {
          select: {
            name: true,
            provider: true,
          },
        },
      },
    });

    return NextResponse.json({
      integrations: allIntegrations,
      stats: {
        total: allIntegrations.length,
        configured: integrations.length,
        active: integrations.filter((i: any) => i.status === 'ACTIVE').length,
        errors: integrations.filter((i: any) => i.status === 'ERROR').length,
      },
      recentActivity: recentLogs,
    });
    
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error fetching integrations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch integrations' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin"] });

/**
 * POST /api/admin/integrations
 * Configure a new integration
 */
export const POST = withAuth(async (req: NextRequest, user) => {
  try {
    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_CREATE)) {
      return NextResponse.json(
        { error: 'You do not have permission to configure integrations' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = integrationSchema.parse(body);

    // Check if integration already exists
    const existing: any = await prisma.integration.findFirst({
      where: { provider: validated.provider },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'This integration is already configured. Use PUT to update.' },
        { status: 409 }
      );
    }

    // Encrypt sensitive credentials
    const encryptedConfig = encryptData(validated.config);
    const encryptedCredentials = validated.credentials 
       ? encryptData(validated.credentials)
       : undefined;

    // Create integration
    const integration = await prisma.integration.create({
      data: {
        name: validated.name,
        provider: validated.provider,
        status: 'INACTIVE', // Start as inactive until tested
        config: encryptedConfig,
        credentials: encryptedCredentials,
        webhookUrl: validated.webhookUrl,
        createdById: user.id > 0  ? user.id  : undefined,
      },
    });

    // Create audit log
    await prisma.integrationLog.create({
      data: {
        integrationId: integration.id,
        action: 'CONFIGURED',
        status: 'success',
        message: `Integration configured by ${user.email}`,
        details: {
          provider: validated.provider,
          hasWebhook: !!validated.webhookUrl,
        },
      },
    });

    logger.info(`Integration ${validated.provider} configured by ${user.email}`);

    return NextResponse.json({
      success: true,
      message: 'Integration configured successfully',
      integration: {
        id: integration.id,
        name: integration.name,
        provider: integration.provider,
        status: integration.status,
      },
    });
    
  } catch (error: any) {
    logger.error('Error configuring integration:', error);
    
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid configuration data', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to configure integration' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin"] });

/**
 * PUT /api/admin/integrations
 * Update an existing integration
 */
export const PUT = withAuth(async (req: NextRequest, user) => {
  try {
    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.INTEGRATION_UPDATE)) {
      return NextResponse.json(
        { error: 'You do not have permission to update integrations' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { id, status, config, credentials } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Integration ID is required' },
        { status: 400 }
      );
    }

    // Get existing integration
    const existing = await prisma.integration.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Prepare update data
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (status) {
      updateData.status = status;
    }

    if (config) {
      updateData.config = encryptData(config);
    }

    if (credentials) {
      updateData.credentials = encryptData(credentials);
    }

    // Update integration
    const updated = await prisma.integration.update({
      where: { id },
      data: updateData,
    });

    // Create audit log
    await prisma.integrationLog.create({
      data: {
        integrationId: id,
        action: 'UPDATED',
        status: 'success',
        message: `Integration updated by ${user.email}`,
        details: {
          diff: Object.keys(updateData),
        },
      },
    });

    logger.info(`Integration ${existing.provider} updated by ${user.email}`);

    return NextResponse.json({
      success: true,
      message: 'Integration updated successfully',
      integration: {
        id: updated.id,
        name: updated.name,
        provider: updated.provider,
        status: updated.status,
      },
    });
    
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error updating integration:', error);
    return NextResponse.json(
      { error: 'Failed to update integration' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin"] });

/**
 * DELETE /api/admin/integrations
 * Remove an integration
 */
export const DELETE = withAuth(async (req: NextRequest, user) => {
  try {
    // Only SUPER_ADMIN can delete integrations
    if (user.role !== "admin") {
      return NextResponse.json(
        { error: 'Only Super Admins can delete integrations' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = parseInt(searchParams.get('id') || '0');

    if (!id) {
      return NextResponse.json(
        { error: 'Integration ID is required' },
        { status: 400 }
      );
    }

    // Get integration
    const integration = await prisma.integration.findUnique({
      where: { id },
      include: {
        apiKeys: true,
        webhooks: true,
      },
    });

    if (!integration) {
      return NextResponse.json(
        { error: 'Integration not found' },
        { status: 404 }
      );
    }

    // Check if integration has dependencies
    if (integration.apiKeys.length > 0 || integration.webhooks.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete integration with active API keys or webhooks',
          details: {
            apiKeys: integration.apiKeys.length,
            webhooks: integration.webhooks.length,
          }
        },
        { status: 409 }
      );
    }

    // Delete integration and logs
    await prisma.$transaction([
      prisma.integrationLog.deleteMany({ where: { integrationId: id } }),
      prisma.integration.delete({ where: { id } }),
    ]);

    logger.warn(`Integration ${integration.provider} deleted by ${user.email}`);

    return NextResponse.json({
      success: true,
      message: 'Integration deleted successfully',
    });
    
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error deleting integration:', error);
    return NextResponse.json(
      { error: 'Failed to delete integration' },
      { status: 500 }
    );
  }
}, { roles: ["admin"] });
