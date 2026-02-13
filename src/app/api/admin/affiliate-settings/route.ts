/**
 * Affiliate Program Settings API
 * Manages global affiliate program configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// Settings schema for validation
const affiliateSettingsSchema = z.object({
  // Attribution
  newPatientModel: z.enum(['FIRST_CLICK', 'LAST_CLICK', 'LINEAR']).optional(),
  returningPatientModel: z.enum(['FIRST_CLICK', 'LAST_CLICK', 'LINEAR']).optional(),
  cookieWindowDays: z.number().min(1).max(365).optional(),
  enableFingerprinting: z.boolean().optional(),
  enableSubIds: z.boolean().optional(),

  // Commission
  defaultCommissionType: z.enum(['PERCENT', 'FLAT']).optional(),
  defaultCommissionValue: z.number().min(0).max(100).optional(),
  holdDays: z.number().min(0).max(90).optional(),
  clawbackEnabled: z.boolean().optional(),

  // Payout
  minimumPayoutCents: z.number().min(0).optional(),
  payoutFrequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']).optional(),

  // Fraud
  fraudEnabled: z.boolean().optional(),
  maxConversionsPerDay: z.number().min(1).optional(),
  maxConversionsPerIp: z.number().min(1).optional(),
  blockProxyVpn: z.boolean().optional(),
  blockTor: z.boolean().optional(),
  autoHoldOnHighRisk: z.boolean().optional(),
});

const SETTINGS_KEY = 'affiliate_program';
const SETTINGS_CATEGORY = 'affiliate';

// Default settings
const defaultSettings = {
  newPatientModel: 'FIRST_CLICK',
  returningPatientModel: 'LAST_CLICK',
  cookieWindowDays: 30,
  enableFingerprinting: true,
  enableSubIds: true,
  defaultCommissionType: 'PERCENT',
  defaultCommissionValue: 10,
  holdDays: 7,
  clawbackEnabled: true,
  minimumPayoutCents: 5000,
  payoutFrequency: 'MONTHLY',
  fraudEnabled: true,
  maxConversionsPerDay: 50,
  maxConversionsPerIp: 3,
  blockProxyVpn: false,
  blockTor: true,
  autoHoldOnHighRisk: true,
};

/**
 * GET /api/admin/affiliate-settings
 * Get affiliate program settings
 */
export const GET = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Only admin and super_admin can view settings
      const role = (user.role as string).toLowerCase();
      if (role !== 'admin' && role !== 'super_admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      // Fetch settings from database
      const settingsRecord = await prisma.systemSettings.findUnique({
        where: {
          category_key: {
            category: SETTINGS_CATEGORY,
            key: SETTINGS_KEY,
          },
        },
      });

      // Return stored settings or defaults
      const settings = settingsRecord?.value
        ? { ...defaultSettings, ...(settingsRecord.value as object) }
        : defaultSettings;

      return NextResponse.json({
        success: true,
        settings,
      });
    } catch (error) {
      logger.error('[AffiliateSettings] Error fetching settings', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return NextResponse.json({ error: 'Failed to fetch affiliate settings' }, { status: 500 });
    }
  },
  { roles: ['admin', 'super_admin'] }
);

/**
 * PUT /api/admin/affiliate-settings
 * Update affiliate program settings
 */
export const PUT = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Only admin and super_admin can update settings
      const role = (user.role as string).toLowerCase();
      if (role !== 'admin' && role !== 'super_admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      const body = await req.json();

      // Validate input
      const validationResult = affiliateSettingsSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'Invalid settings', details: validationResult.error.flatten() },
          { status: 400 }
        );
      }

      const newSettings = validationResult.data;

      // Upsert settings
      const updatedSettings = await prisma.systemSettings.upsert({
        where: {
          category_key: {
            category: SETTINGS_CATEGORY,
            key: SETTINGS_KEY,
          },
        },
        update: {
          value: { ...defaultSettings, ...newSettings },
          updatedById: user.id,
        },
        create: {
          category: SETTINGS_CATEGORY,
          key: SETTINGS_KEY,
          value: { ...defaultSettings, ...newSettings },
          description: 'Affiliate program configuration settings',
          isPublic: false,
          updatedById: user.id,
        },
      });

      logger.info('[AffiliateSettings] Settings updated', {
        userId: user.id,
        changes: Object.keys(newSettings),
      });

      return NextResponse.json({
        success: true,
        settings: updatedSettings.value,
      });
    } catch (error) {
      logger.error('[AffiliateSettings] Error updating settings', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return NextResponse.json({ error: 'Failed to update affiliate settings' }, { status: 500 });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
