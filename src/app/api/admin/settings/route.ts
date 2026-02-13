/**
 * Settings Dashboard API
 * Central hub for all system settings and configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import { handleApiError, ForbiddenError } from '@/domains/shared/errors';

/**
 * GET /api/admin/settings
 * Get all settings organized by category
 */
export const GET = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Check permission
      if (!hasPermission(user.role as any, PERMISSIONS.SYSTEM_CONFIG)) {
        throw new ForbiddenError('You do not have permission to view system settings');
      }

      // Get all settings categories with counts
      const [generalSettings, integrations, apiKeys, webhooks, developerTools, users, auditLogs] =
        await Promise.all([
          // General Settings
          prisma.systemSettings.findMany({
            where: (user.role as string) === 'admin' ? {} : { isPublic: true },
            orderBy: [{ category: 'asc' }, { key: 'asc' }],
            take: 100,
          }),

          // Integrations
          prisma.integration.count({
            where: { status: 'ACTIVE' },
          }),

          // API Keys
          prisma.apiKey.count({
            where: { status: 'ACTIVE' },
          }),

          // Webhooks
          prisma.webhookConfig.count({
            where: { isActive: true },
          }),

          // Developer Tools
          prisma.developerTool.findMany({
            select: {
              name: true,
              category: true,
              status: true,
              lastCheckAt: true,
            },
            take: 100,
          }),

          // User Stats
          prisma.user.groupBy({
            by: ['role', 'status'],
            _count: true,
          }),

          // Recent Audit Logs
          prisma.userAuditLog.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              user: {
                select: {
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          }),
        ]);

      // Organize settings by category
      const settingsByCategory: Record<string, any[]> = {};
      generalSettings.forEach((setting: any) => {
        if (!settingsByCategory[setting.category]) {
          settingsByCategory[setting.category] = [];
        }
        settingsByCategory[setting.category].push({
          key: setting.key,
          value: setting.value,
          description: setting.description,
          updatedAt: setting.updatedAt,
        });
      });

      // User statistics
      const userStats = {
        total: users.reduce((sum: number, group: { _count: number }) => sum + group._count, 0),
        byRole: {} as Record<string, number>,
        byStatus: {} as Record<string, number>,
      };

      users.forEach((group: any) => {
        if (!userStats.byRole[group.role]) {
          userStats.byRole[group.role] = 0;
        }
        userStats.byRole[group.role] += group._count;

        if (!userStats.byStatus[group.status]) {
          userStats.byStatus[group.status] = 0;
        }
        userStats.byStatus[group.status] += group._count;
      });

      const dashboard = {
        overview: {
          systemStatus: 'operational',
          lastUpdated: new Date(),
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
        },

        settings: {
          categories: Object.keys(settingsByCategory),
          items: settingsByCategory,
          totalSettings: generalSettings.length,
        },

        integrations: {
          active: integrations,
          available: [
            { id: 'stripe', name: 'Stripe', status: 'configured' },
            { id: 'lifefile', name: 'Lifefile', status: 'active' },
            { id: 'twilio', name: 'Twilio', status: 'available' },
            { id: 'sendgrid', name: 'SendGrid', status: 'available' },
            { id: 'aws', name: 'AWS S3', status: 'configured' },
            { id: 'sentry', name: 'Sentry', status: 'active' },
          ],
        },

        developerTools: {
          apiKeys: {
            active: apiKeys,
            limit: 50,
          },
          webhooks: {
            active: webhooks,
            recentDeliveries: [],
          },
          tools: developerTools.map((tool: any) => ({
            ...tool,
            isHealthy: tool.status === 'enabled',
          })),
        },

        userManagement: {
          stats: userStats,
          recentActivity: auditLogs.map((log: any) => ({
            id: log.id,
            action: log.action,
            user: log.user.email,
            timestamp: log.createdAt,
            details: log.details,
          })),
        },

        quickActions: [
          {
            id: 'create_user',
            label: 'Create User',
            icon: 'user-plus',
            path: '/api/users/create',
            requiredPermission: 'user:create',
          },
          {
            id: 'generate_api_key',
            label: 'Generate API Key',
            icon: 'key',
            path: '/api/admin/api-keys/generate',
            requiredPermission: 'system:config',
          },
          {
            id: 'configure_webhook',
            label: 'Configure Webhook',
            icon: 'webhook',
            path: '/api/admin/webhooks/create',
            requiredPermission: 'integration:create',
          },
          {
            id: 'view_logs',
            label: 'View System Logs',
            icon: 'file-text',
            path: '/api/admin/logs',
            requiredPermission: 'system:logs',
          },
        ],
      };

      return NextResponse.json(dashboard);
    } catch (error) {
      return handleApiError(error, { route: 'GET /api/admin/settings' });
    }
  },
  { roles: ['admin', 'admin'] }
);
