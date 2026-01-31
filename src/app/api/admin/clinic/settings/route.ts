/**
 * Admin Clinic Settings API
 *
 * Manages general clinic settings stored in the clinic.settings JSON field.
 * Settings include timezone, date format, language, and other preferences.
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface ClinicSettings {
  // General
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  language: string;
  currency: string;

  // Security
  sessionTimeout: number; // minutes
  requireTwoFactor: boolean;
  passwordMinLength: number;
  passwordRequireSpecial: boolean;
  passwordRequireNumbers: boolean;
  maxLoginAttempts: number;
  lockoutDuration: number; // minutes

  // Notifications
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  notifyOnNewPatient: boolean;
  notifyOnNewOrder: boolean;
  notifyOnPrescriptionReady: boolean;
  notifyOnRefillRequest: boolean;
  notifyOnTicketCreated: boolean;
  notifyOnPaymentReceived: boolean;

  // Display
  showPatientPhotos: boolean;
  compactView: boolean;
  defaultDashboardView: string;

  // HIPAA
  auditLoggingEnabled: boolean;
  autoLogoutEnabled: boolean;
  maskSensitiveData: boolean;
}

const DEFAULT_SETTINGS: ClinicSettings = {
  // General
  timezone: 'America/New_York',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  language: 'en',
  currency: 'USD',

  // Security
  sessionTimeout: 30,
  requireTwoFactor: false,
  passwordMinLength: 8,
  passwordRequireSpecial: true,
  passwordRequireNumbers: true,
  maxLoginAttempts: 5,
  lockoutDuration: 15,

  // Notifications
  emailNotificationsEnabled: true,
  smsNotificationsEnabled: false,
  notifyOnNewPatient: true,
  notifyOnNewOrder: true,
  notifyOnPrescriptionReady: true,
  notifyOnRefillRequest: true,
  notifyOnTicketCreated: true,
  notifyOnPaymentReceived: true,

  // Display
  showPatientPhotos: true,
  compactView: false,
  defaultDashboardView: 'overview',

  // HIPAA
  auditLoggingEnabled: true,
  autoLogoutEnabled: true,
  maskSensitiveData: true,
};

/**
 * GET /api/admin/clinic/settings
 * Get the current clinic's settings
 */
export const GET = withAuth(async (request: NextRequest, user: AuthUser) => {
  try {
    if (!user.clinicId) {
      return NextResponse.json(
        { error: 'User is not associated with a clinic' },
        { status: 400 }
      );
    }

    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: {
        id: true,
        name: true,
        settings: true,
        timezone: true,
      },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Merge stored settings with defaults
    const storedSettings = (clinic.settings as Partial<ClinicSettings>) || {};
    const settings: ClinicSettings = {
      ...DEFAULT_SETTINGS,
      ...storedSettings,
      timezone: clinic.timezone || DEFAULT_SETTINGS.timezone,
    };

    return NextResponse.json({ settings });
  } catch (error) {
    logger.error('Error fetching clinic settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}, { roles: ['admin', 'super_admin'] });

/**
 * PATCH /api/admin/clinic/settings
 * Update the current clinic's settings
 */
export const PATCH = withAuth(async (request: NextRequest, user: AuthUser) => {
  try {
    if (!user.clinicId) {
      return NextResponse.json(
        { error: 'User is not associated with a clinic' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Get current clinic
    const clinic = await prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { id: true, settings: true, timezone: true },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Merge new settings with existing
    const currentSettings = (clinic.settings as Partial<ClinicSettings>) || {};
    const updatedSettings = {
      ...currentSettings,
      ...body,
    };

    // Extract timezone to update the dedicated field
    const { timezone, ...otherSettings } = updatedSettings;

    // Update clinic
    const updated = await prisma.clinic.update({
      where: { id: user.clinicId },
      data: {
        settings: otherSettings,
        ...(timezone && { timezone }),
      },
      select: {
        id: true,
        settings: true,
        timezone: true,
      },
    });

    // Create audit log
    try {
      await prisma.clinicAuditLog.create({
        data: {
          clinicId: user.clinicId,
          action: 'UPDATE_SETTINGS',
          userId: user.id,
          details: {
            updatedBy: user.email,
            changes: body,
          },
        },
      });
    } catch (auditError) {
      logger.warn('Failed to create audit log:', auditError);
    }

    // Return merged settings
    const finalSettings: ClinicSettings = {
      ...DEFAULT_SETTINGS,
      ...(updated.settings as Partial<ClinicSettings>),
      timezone: updated.timezone || DEFAULT_SETTINGS.timezone,
    };

    logger.info(`[CLINIC-SETTINGS] Admin ${user.email} updated settings for clinic ${user.clinicId}`);

    return NextResponse.json({
      settings: finalSettings,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    logger.error('Error updating clinic settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}, { roles: ['admin', 'super_admin'] });
