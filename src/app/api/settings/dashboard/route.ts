/**
 * Settings Dashboard API
 * Overview and navigation for all settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { hasPermission, PERMISSIONS, getRolePermissions, getRoleFeatures } from '@/lib/auth/permissions';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';

interface DashboardSection {
  id: string;
  title: string;
  description: string;
  icon: string;
  path: string;
  badge?: string | number;
  requiredPermission?: string;
  isAvailable: boolean;
}

/**
 * GET /api/settings/dashboard
 * Get settings dashboard overview
 */
export const GET = withAuth(async (req: NextRequest, user) => {
  try {
    // Get user statistics
    const [userCount, recentLogs, webhookCount] = await Promise.all([
      // Count users (if permission allows)
      hasPermission(user.role as any, PERMISSIONS.USER_READ)
        ? prisma.user.count().catch(() => 0)
        : Promise.resolve(0),
        
      // Get recent audit logs
      hasPermission(user.role as any, PERMISSIONS.SYSTEM_AUDIT)
        ? prisma.userAuditLog.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              action: true,
              createdAt: true,
              user: {
                select: {
                  email: true,
                },
              },
            },
          }).catch(() => [])
        : Promise.resolve([]),
        
      // Count webhooks (mock for now)
      hasPermission(user.role as any, PERMISSIONS.INTEGRATION_READ)
        ? Promise.resolve(3)
        : Promise.resolve(0),
    ]);
    
    // Define all dashboard sections
    const sections: DashboardSection[] = [
      {
        id: 'general',
        title: 'General Settings',
        description: 'Platform configuration and branding',
        icon: '⚙️',
        path: '/settings/general',
        isAvailable: true,
      },
      {
        id: 'users',
        title: 'User Management',
        description: 'Manage users, roles, and permissions',
        icon: '👥',
        path: '/settings/users',
        badge: userCount > 0 ? userCount : undefined,
        requiredPermission: PERMISSIONS.USER_READ,
        isAvailable: hasPermission(user.role as any, PERMISSIONS.USER_READ),
      },
      {
        id: 'integrations',
        title: 'Integrations',
        description: 'External services and API connections',
        icon: '🔌',
        path: '/settings/integrations',
        requiredPermission: PERMISSIONS.INTEGRATION_READ,
        isAvailable: hasPermission(user.role as any, PERMISSIONS.INTEGRATION_READ),
      },
      {
        id: 'developer',
        title: 'Developer Tools',
        description: 'API keys, webhooks, and documentation',
        icon: '🛠️',
        path: '/settings/developer',
        badge: webhookCount > 0 ? webhookCount : undefined,
        requiredPermission: PERMISSIONS.INTEGRATION_READ,
        isAvailable: hasPermission(user.role as any, PERMISSIONS.INTEGRATION_READ),
      },
      {
        id: 'security',
        title: 'Security',
        description: 'Authentication, compliance, and audit logs',
        icon: '🔒',
        path: '/settings/security',
        requiredPermission: PERMISSIONS.SYSTEM_CONFIG,
        isAvailable: hasPermission(user.role as any, PERMISSIONS.SYSTEM_CONFIG),
      },
      {
        id: 'billing',
        title: 'Billing & Payments',
        description: 'Payment processing and subscription management',
        icon: '💳',
        path: '/settings/billing',
        requiredPermission: PERMISSIONS.BILLING_VIEW,
        isAvailable: hasPermission(user.role as any, PERMISSIONS.BILLING_VIEW),
      },
      {
        id: 'notifications',
        title: 'Notifications',
        description: 'Email, SMS, and push notification settings',
        icon: '📧',
        path: '/settings/notifications',
        isAvailable: true,
      },
      {
        id: 'audit',
        title: 'Audit Logs',
        description: 'System activity and compliance logs',
        icon: '📝',
        path: '/settings/audit',
        badge: 'HIPAA',
        requiredPermission: PERMISSIONS.SYSTEM_AUDIT,
        isAvailable: hasPermission(user.role as any, PERMISSIONS.SYSTEM_AUDIT),
      },
    ];
    
    // Get system health status
    const systemHealth = await checkSystemHealth();
    
    // Get integration statuses
    const integrationStatuses = {
      lifefile: process.env.LIFEFILE_USERNAME ? 'connected' : 'not_configured',
      stripe: process.env.STRIPE_SECRET_KEY ? 'connected' : 'not_configured',
      sendgrid: process.env.SENDGRID_API_KEY ? 'connected' : 'not_configured',
      twilio: process.env.TWILIO_ACCOUNT_SID ? 'connected' : 'not_configured',
      openai: process.env.OPENAI_API_KEY ? 'connected' : 'not_configured',
    };
    
    // Quick actions based on permissions
    const quickActions = [];
    
    if (hasPermission(user.role as any, PERMISSIONS.USER_CREATE)) {
      quickActions.push({
        id: 'create_user',
        title: 'Create User',
        icon: '➕',
        path: '/settings/users/create',
      });
    }
    
    if (hasPermission(user.role as any, PERMISSIONS.INTEGRATION_CREATE)) {
      quickActions.push({
        id: 'add_integration',
        title: 'Add Integration',
        icon: '🔗',
        path: '/settings/integrations/new',
      });
      
      quickActions.push({
        id: 'create_api_key',
        title: 'Generate API Key',
        icon: '🔑',
        path: '/settings/developer/api-keys/new',
      });
    }
    
    if (hasPermission(user.role as any, PERMISSIONS.SYSTEM_CONFIG)) {
      quickActions.push({
        id: 'system_backup',
        title: 'System Backup',
        icon: '💾',
        path: '/settings/backup',
      });
    }
    
    // Prepare response
    const dashboard = {
      user: {
        email: user.email,
        role: user.role,
        permissions: getRolePermissions(user.role as any).length,
        features: getRoleFeatures(user.role as any).length,
      },
      sections: sections.filter((s: any) => s.isAvailable),
      quickActions,
      systemHealth,
      integrationStatuses,
      recentActivity: recentLogs.map((log: any) => ({
        id: log.id,
        action: log.action,
        user: log.user?.email || 'System',
        timestamp: log.createdAt,
      })),
      stats: {
        totalUsers: userCount,
        activeIntegrations: Object.values(integrationStatuses).filter((s: any) => s === 'connected').length,
        totalIntegrations: Object.keys(integrationStatuses).length,
        webhooks: webhookCount,
      },
    };
    
    logger.info(`Settings dashboard accessed by ${user.email}`);
    
    return NextResponse.json(dashboard);
    
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error fetching settings dashboard:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings dashboard' },
      { status: 500 }
    );
  }
}, { roles: ["admin", "admin", "provider", 'staff'] });

/**
 * Check system health
 */
async function checkSystemHealth() {
  const checks = {
    database: 'healthy',
    api: 'healthy',
    storage: 'healthy',
    email: 'degraded',
  };
  
  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'healthy';
  } catch {
    checks.database = 'unhealthy';
  }
  
  // Check email service
  if (!process.env.SENDGRID_API_KEY && !process.env.SMTP_HOST) {
    checks.email = 'not_configured';
  }
  
  // Calculate overall health
  const unhealthyCount = Object.values(checks).filter((s: any) => s === 'unhealthy').length;
  const degradedCount = Object.values(checks).filter((s: any) => s === 'degraded').length;
  
  let overallStatus = 'healthy';
  if (unhealthyCount > 0) {
    overallStatus = 'unhealthy';
  } else if (degradedCount > 0) {
    overallStatus = 'degraded';
  }
  
  return {
    status: overallStatus,
    checks,
    lastChecked: new Date().toISOString(),
  };
}
