/**
 * Email Analytics API
 *
 * Provides email statistics and analytics for the admin dashboard.
 * Requires admin or super_admin role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { emailLogService } from '@/services/email/emailLogService';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// ============================================================================
// Validation Schemas
// ============================================================================

const querySchema = z.object({
  days: z.coerce.number().min(1).max(365).default(30),
  clinicId: z.coerce.number().optional(),
  template: z.string().optional(),
});

// ============================================================================
// Handlers
// ============================================================================

/**
 * GET /api/admin/email-analytics
 * Get email statistics and analytics
 *
 * Query params:
 * - days: Number of days to analyze (default 30, max 365)
 * - clinicId: Filter by clinic (admin only sees their clinic, super_admin can see all)
 * - template: Filter by email template
 */
async function getAnalyticsHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const parsed = querySchema.safeParse(searchParams);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { days, clinicId, template } = parsed.data;

    // Non-super-admin can only see their own clinic
    const effectiveClinicId =
      user.role === 'super_admin' ? clinicId : user.clinicId || undefined;

    // Calculate date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch all analytics data in parallel
    const [stats, byTemplate, byDay, recentBounces] = await Promise.all([
      emailLogService.getEmailStats({
        clinicId: effectiveClinicId,
        startDate,
        template,
      }),
      emailLogService.getStatsByTemplate({
        clinicId: effectiveClinicId,
        startDate,
      }),
      emailLogService.getStatsByDay(days, effectiveClinicId),
      emailLogService.getRecentBounces(20, effectiveClinicId),
    ]);

    logger.info('[Email Analytics] Stats fetched', {
      userId: user.id,
      days,
      clinicId: effectiveClinicId,
    });

    return NextResponse.json({
      success: true,
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      overview: stats,
      byTemplate,
      byDay,
      recentBounces: recentBounces.map((b) => ({
        id: b.id,
        email: b.recipientEmail.replace(
          /(.{2})(.*)(@.*)/,
          '$1***$3' // Mask email for privacy
        ),
        status: b.status,
        bounceType: b.bounceType,
        bounceSubType: b.bounceSubType,
        complaintType: b.complaintType,
        error: b.errorMessage,
        date: b.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error('[Email Analytics] Error fetching stats', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });

    return NextResponse.json(
      {
        error: 'Failed to fetch email analytics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/email-analytics/suppressed
 * Get list of suppressed email addresses
 */
async function getSuppressedHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    // Non-super-admin can only see their own clinic
    const effectiveClinicId =
      user.role === 'super_admin' ? undefined : user.clinicId || undefined;

    const suppressed = await emailLogService.getSuppressedEmails(effectiveClinicId);

    return NextResponse.json({
      success: true,
      count: suppressed.length,
      emails: suppressed.map((email) =>
        email.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Mask for privacy
      ),
    });
  } catch (error) {
    logger.error('[Email Analytics] Error fetching suppressed emails', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });

    return NextResponse.json(
      {
        error: 'Failed to fetch suppressed emails',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Exports
// ============================================================================

export const GET = withAdminAuth(getAnalyticsHandler);
