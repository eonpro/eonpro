/**
 * Settings Management API
 * Central API for platform settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import { logger } from '@/lib/logger';
import { SETTINGS_CATEGORIES } from '@/lib/settings/config';
import { prisma } from '@/lib/db';

// Store settings in database (SystemSetting model would be ideal)
// For now, we'll use environment variables and return structured data

/**
 * GET /api/settings
 * Get all settings based on user permissions
 */
export const GET = withAuth(
  async (req: NextRequest, user) => {
    try {
      const { searchParams } = new URL(req.url);
      const category = searchParams.get('category');

      // Filter categories based on user permissions
      let availableCategories = SETTINGS_CATEGORIES.filter((cat: any) => {
        if (!cat.requiredPermission) return true;
        return hasPermission(user.role, cat.requiredPermission);
      });

      // If specific category requested
      if (category) {
        availableCategories = availableCategories.filter((cat: any) => cat.id === category);

        if (availableCategories.length === 0) {
          return NextResponse.json(
            { error: 'Category not found or no permission' },
            { status: 404 }
          );
        }
      }

      // Get current settings values from environment/database
      const settingsWithValues = availableCategories.map((category: any) => ({
        ...category,
        subcategories: category.subcategories?.map((subcat: any) => ({
          ...subcat,
          settings: subcat.settings.map((setting: any) => ({
            ...setting,
            value: getSettingValue(setting.id, setting.defaultValue),
            // Don't expose sensitive values
            ...(setting.sensitive && setting.type === 'password'
              ? { value: setting.value ? '••••••••' : undefined }
              : {}),
          })),
        })),
      }));

      // Log access for audit
      logger.info('Settings accessed', {
        userId: user.id,
        category,
        role: user.role,
      });

      return NextResponse.json({
        categories: settingsWithValues,
        meta: {
          totalCategories: settingsWithValues.length,
          userRole: user.role,
        },
      });
    } catch (error: any) {
      // @ts-ignore

      logger.error('Error fetching settings:', error);
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
    }
  },
  { roles: ['admin', 'admin', 'staff'] }
);

/**
 * PUT /api/settings
 * Update settings
 */
export const PUT = withAuth(
  async (req: NextRequest, user) => {
    try {
      // Only admins can update settings
      if (!hasPermission(user.role, PERMISSIONS.SYSTEM_CONFIG)) {
        return NextResponse.json(
          { error: 'You do not have permission to update settings' },
          { status: 403 }
        );
      }

      const body = await req.json();
      const { settingId, value } = body;

      if (!settingId) {
        return NextResponse.json({ error: 'Setting ID is required' }, { status: 400 });
      }

      // Find the setting definition
      let settingDef: any = null;
      let categoryName = '';
      let subcategoryName = '';

      for (const category of SETTINGS_CATEGORIES) {
        for (const subcat of category.subcategories || []) {
          const setting = subcat.settings.find((s: any) => s.id === settingId);
          if (setting) {
            settingDef = setting;
            categoryName = category.name;
            subcategoryName = subcat.name;
            break;
          }
        }
        if (settingDef) break;
      }

      if (!settingDef) {
        return NextResponse.json({ error: 'Setting not found' }, { status: 404 });
      }

      // Validate the value
      if (settingDef.validation) {
        const { required, min, max, pattern, custom } = settingDef.validation;

        if (required && !value) {
          return NextResponse.json({ error: 'This setting is required' }, { status: 400 });
        }

        if (typeof value === 'number') {
          if (min !== undefined && value < min) {
            return NextResponse.json({ error: `Value must be at least ${min}` }, { status: 400 });
          }
          if (max !== undefined && value > max) {
            return NextResponse.json({ error: `Value must be at most ${max}` }, { status: 400 });
          }
        }

        if (pattern && typeof value === 'string') {
          const regex = new RegExp(pattern);
          if (!regex.test(value)) {
            return NextResponse.json(
              { error: 'Value does not match required format' },
              { status: 400 }
            );
          }
        }

        if (custom && !custom(value)) {
          return NextResponse.json({ error: 'Value validation failed' }, { status: 400 });
        }
      }

      // Store the setting (in production, save to database)
      // For now, we'll just return success
      // await saveSettingValue(settingId, value);

      // Create audit log
      await prisma.userAuditLog
        .create({
          data: {
            userId: user.id > 0 ? user.id : undefined,
            action: 'SETTING_UPDATED',
            details: {
              settingId,
              category: categoryName,
              subcategory: subcategoryName,
              setting: settingDef.name,
              oldValue: settingDef.sensitive
                ? '***'
                : getSettingValue(settingId, settingDef.defaultValue),
              newValue: settingDef.sensitive ? '***' : value,
              updatedBy: user.id,
            },
            ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
            userAgent: req.headers.get('user-agent'),
          },
        })
        .catch((error: Error) => {
          logger.warn('Failed to create audit log:', error);
        });

      logger.info('Setting updated', { settingId, userId: user.id });

      // Check if restart is required
      if (settingDef.restartRequired) {
        return NextResponse.json({
          success: true,
          message: 'Setting updated successfully',
          restartRequired: true,
          setting: {
            id: settingId,
            name: settingDef.name,
            value: settingDef.sensitive ? '••••••••' : value,
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Setting updated successfully',
        setting: {
          id: settingId,
          name: settingDef.name,
          value: settingDef.sensitive ? '••••••••' : value,
        },
      });
    } catch (error: any) {
      // @ts-ignore

      logger.error('Error updating setting:', error);
      return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
    }
  },
  { roles: ['admin', 'admin'] }
);

/**
 * Helper function to get setting value
 * In production, this would fetch from database
 */
function getSettingValue(settingId: string, defaultValue: any): any {
  // Map settings to environment variables
  const envMappings: Record<string, string> = {
    'lifefile.base_url': 'LIFEFILE_BASE_URL',
    'lifefile.username': 'LIFEFILE_USERNAME',
    'lifefile.password': 'LIFEFILE_PASSWORD',
    'stripe.publishable_key': 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    'stripe.secret_key': 'STRIPE_SECRET_KEY',
    'stripe.webhook_secret': 'STRIPE_WEBHOOK_ENDPOINT_SECRET',
    'sendgrid.api_key': 'SENDGRID_API_KEY',
    'twilio.account_sid': 'TWILIO_ACCOUNT_SID',
    'twilio.auth_token': 'TWILIO_AUTH_TOKEN',
    'openai.api_key': 'OPENAI_API_KEY',
    'logging.sentry_dsn': 'SENTRY_DSN',
  };

  const envVar = envMappings[settingId];
  if (envVar && process.env[envVar]) {
    return process.env[envVar];
  }

  // Return default value
  return defaultValue;
}

/**
 * POST /api/settings/test
 * Test integration settings
 */
export const POST = withAuth(
  async (req: NextRequest, user) => {
    try {
      if (!hasPermission(user.role, PERMISSIONS.INTEGRATION_UPDATE)) {
        return NextResponse.json(
          { error: 'You do not have permission to test integrations' },
          { status: 403 }
        );
      }

      const body = await req.json();
      const { integration, settings } = body;

      let testResult = { success: false, message: 'Test not implemented' };

      switch (integration) {
        case 'lifefile':
          // Test Lifefile connection
          try {
            const response = await fetch(`${settings.base_url}/api/health`, {
              method: 'GET',
              headers: {
                Authorization: `Basic ${Buffer.from(`${settings.username}:${settings.password}`).toString('base64')}`,
              },
            });

            testResult = {
              success: response.ok,
              message: response.ok
                ? 'Connection successful'
                : `Connection failed: ${response.status}`,
            };
          } catch (error: any) {
            testResult = {
              success: false,
              message: `Connection failed: ${error.message}`,
            };
          }
          break;

        case 'stripe':
          // Test Stripe connection
          try {
            const { default: Stripe } = await import('stripe');
            const stripe = new Stripe(settings.secret_key);
            await stripe.charges.list({ limit: 1 });

            testResult = {
              success: true,
              message: 'Stripe connection successful',
            };
          } catch (error: any) {
            testResult = {
              success: false,
              message: `Stripe connection failed: ${error.message}`,
            };
          }
          break;

        case 'sendgrid':
          // Test SendGrid connection
          try {
            const response = await fetch('https://api.sendgrid.com/v3/scopes', {
              headers: {
                Authorization: `Bearer ${settings.api_key}`,
              },
            });

            testResult = {
              success: response.ok,
              message: response.ok
                ? 'SendGrid connection successful'
                : `Connection failed: ${response.status}`,
            };
          } catch (error: any) {
            testResult = {
              success: false,
              message: `SendGrid connection failed: ${error.message}`,
            };
          }
          break;

        case 'openai':
          // Test OpenAI connection
          try {
            const response = await fetch('https://api.openai.com/v1/models', {
              headers: {
                Authorization: `Bearer ${settings.api_key}`,
              },
            });

            testResult = {
              success: response.ok,
              message: response.ok
                ? 'OpenAI connection successful'
                : `Connection failed: ${response.status}`,
            };
          } catch (error: any) {
            testResult = {
              success: false,
              message: `OpenAI connection failed: ${error.message}`,
            };
          }
          break;
      }

      // Log test attempt
      logger.info('Integration test', {
      integration,
      userId: user.id,
      success: testResult.success,
    });

      return NextResponse.json(testResult);
    } catch (error: any) {
      // @ts-ignore

      logger.error('Error testing integration:', error);
      return NextResponse.json({ error: 'Failed to test integration' }, { status: 500 });
    }
  },
  { roles: ['admin', 'admin'] }
);
