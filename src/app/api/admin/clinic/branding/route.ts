/**
 * Admin Clinic Branding API
 *
 * Allows admins to view (and optionally update) their clinic's branding.
 * Note: Major branding changes may require super-admin approval.
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';

interface ClinicBranding {
  logoUrl: string | null;
  iconUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  buttonTextColor: string;
  customCss: string | null;
}

/**
 * GET /api/admin/clinic/branding
 * Get the current clinic's branding settings
 */
export const GET = withAuth(
  async (request: NextRequest, user: AuthUser) => {
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
          logoUrl: true,
          iconUrl: true,
          faviconUrl: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
          customCss: true,
        },
      });

      if (!clinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      const branding: ClinicBranding = {
        logoUrl: clinic.logoUrl,
        iconUrl: clinic.iconUrl,
        faviconUrl: clinic.faviconUrl,
        primaryColor: clinic.primaryColor,
        secondaryColor: clinic.secondaryColor,
        accentColor: (clinic as any).accentColor || '#d3f931',
        backgroundColor: (clinic as any).backgroundColor || '#F9FAFB',
        buttonTextColor: (clinic as any).buttonTextColor || 'auto',
        customCss: clinic.customCss,
      };

      return NextResponse.json({
        branding,
        clinicName: clinic.name,
      });
    } catch (error) {
      return handleApiError(error, { route: 'GET /api/admin/clinic/branding' });
    }
  },
  { roles: ['admin', 'super_admin'] }
);

/**
 * PATCH /api/admin/clinic/branding
 * Update the current clinic's branding settings
 *
 * Admins can update colors but logo changes may require file upload.
 */
export const PATCH = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      if (!user.clinicId) {
        return NextResponse.json(
          { error: 'User is not associated with a clinic' },
          { status: 400 }
        );
      }

      const body = await request.json();
      const {
        primaryColor,
        secondaryColor,
        accentColor,
        backgroundColor,
        buttonTextColor,
        customCss,
        logoUrl,
        iconUrl,
        faviconUrl,
      } = body;

      // Validate color formats
      const colorRegex = /^#[0-9A-Fa-f]{6}$/;
      if (primaryColor && !colorRegex.test(primaryColor)) {
        return NextResponse.json(
          { error: 'Invalid primary color format. Use hex format (e.g., #3B82F6)' },
          { status: 400 }
        );
      }
      if (secondaryColor && !colorRegex.test(secondaryColor)) {
        return NextResponse.json(
          { error: 'Invalid secondary color format. Use hex format (e.g., #10B981)' },
          { status: 400 }
        );
      }
      if (accentColor && !colorRegex.test(accentColor)) {
        return NextResponse.json(
          { error: 'Invalid accent color format. Use hex format (e.g., #d3f931)' },
          { status: 400 }
        );
      }
      if (backgroundColor && !colorRegex.test(backgroundColor)) {
        return NextResponse.json(
          { error: 'Invalid background color format. Use hex format (e.g., #F9FAFB)' },
          { status: 400 }
        );
      }

      // Validate buttonTextColor
      const validTextColors = ['auto', 'light', 'dark'];
      if (buttonTextColor && !validTextColors.includes(buttonTextColor)) {
        return NextResponse.json(
          { error: 'Invalid button text color. Must be auto, light, or dark' },
          { status: 400 }
        );
      }

      // Build update data
      const updateData: any = {};
      if (primaryColor !== undefined) updateData.primaryColor = primaryColor;
      if (secondaryColor !== undefined) updateData.secondaryColor = secondaryColor;
      if (accentColor !== undefined) updateData.accentColor = accentColor;
      if (backgroundColor !== undefined) updateData.backgroundColor = backgroundColor;
      if (buttonTextColor !== undefined) updateData.buttonTextColor = buttonTextColor;
      if (customCss !== undefined) updateData.customCss = customCss || null;
      if (logoUrl !== undefined) updateData.logoUrl = logoUrl || null;
      if (iconUrl !== undefined) updateData.iconUrl = iconUrl || null;
      if (faviconUrl !== undefined) updateData.faviconUrl = faviconUrl || null;

      // Update clinic
      const updated = await prisma.clinic.update({
        where: { id: user.clinicId },
        data: updateData,
        select: {
          id: true,
          logoUrl: true,
          iconUrl: true,
          faviconUrl: true,
          primaryColor: true,
          secondaryColor: true,
          accentColor: true,
          customCss: true,
        },
      });

      // Create audit log
      try {
        await prisma.clinicAuditLog.create({
          data: {
            clinicId: user.clinicId,
            action: 'UPDATE_BRANDING',
            userId: user.id,
            details: {
              updatedBy: user.id,
              changes: body,
            },
          },
        });
      } catch (auditError) {
        logger.warn('Failed to create audit log for branding update');
      }

      logger.info(
        `[CLINIC-BRANDING] Admin ${user.email} updated branding for clinic ${user.clinicId}`
      );

      return NextResponse.json({
        branding: updated,
        message: 'Branding updated successfully',
      });
    } catch (error) {
      return handleApiError(error, { route: 'PATCH /api/admin/clinic/branding' });
    }
  },
  { roles: ['admin', 'super_admin'] }
);
