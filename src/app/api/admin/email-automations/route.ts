/**
 * Email Automations API
 *
 * Manage email automation settings from the admin panel
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import {
  getAllAutomations,
  updateAutomation,
  getAutomationStats,
  AutomationTrigger,
} from '@/lib/email/automations';
import { getEmailServiceStatus } from '@/lib/email';

/**
 * GET /api/admin/email-automations
 * Get all automation configurations and stats
 */
const getHandler = withAuth(
  async (_request: NextRequest) => {
    try {
      const [automations, stats, serviceStatus] = await Promise.all([
        getAllAutomations(),
        getAutomationStats(30),
        Promise.resolve(getEmailServiceStatus()),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          automations,
          stats,
          serviceStatus,
          availableTriggers: Object.values(AutomationTrigger),
        },
      });
    } catch (error) {
      logger.error('Failed to get email automations', { error });
      return NextResponse.json(
        { success: false, error: 'Failed to get automations' },
        { status: 500 }
      );
    }
  },
  { roles: ['admin', 'super_admin'] }
);

export { getHandler as GET };

/**
 * PATCH /api/admin/email-automations
 * Update an automation configuration
 */
const patchHandler = withAuth(
  async (request: NextRequest) => {
    try {
      const body = await request.json();
      const { trigger, ...config } = body;

      if (!trigger || !Object.values(AutomationTrigger).includes(trigger)) {
        return NextResponse.json(
          { success: false, error: 'Invalid trigger type' },
          { status: 400 }
        );
      }

      const updated = await updateAutomation(trigger as AutomationTrigger, config);

      logger.info('Email automation updated', { trigger, config });

      return NextResponse.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error('Failed to update email automation', { error });
      return NextResponse.json(
        { success: false, error: 'Failed to update automation' },
        { status: 500 }
      );
    }
  },
  { roles: ['admin', 'super_admin'] }
);

export { patchHandler as PATCH };
