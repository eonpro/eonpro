/**
 * Super Admin Email Logs API
 *
 * GET /api/super-admin/email-logs — Paginated list of all emails sent from the platform
 *
 * Filters: status, clinicId, recipientEmail, sourceType, template, from, to
 * Pagination: page, pageSize (default 25, max 100)
 *
 * @security Super Admin only (cross-clinic, unmasked emails)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { emailLogService } from '@/services/email/emailLogService';
import { logger } from '@/lib/logger';
import type { EmailLogStatus } from '@prisma/client';

const VALID_STATUSES: EmailLogStatus[] = [
  'PENDING', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED',
  'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'SUPPRESSED',
];

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      const sp = req.nextUrl.searchParams;

      const page = Math.max(1, parseInt(sp.get('page') || '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') || '25', 10) || 25));

      const statusParam = sp.get('status');
      const clinicIdParam = sp.get('clinicId');
      const recipientEmail = sp.get('recipientEmail') || undefined;
      const sourceType = sp.get('sourceType') || undefined;
      const template = sp.get('template') || undefined;
      const fromParam = sp.get('from');
      const toParam = sp.get('to');

      const statusFilter = statusParam && VALID_STATUSES.includes(statusParam as EmailLogStatus)
        ? (statusParam as EmailLogStatus)
        : undefined;

      const clinicId = clinicIdParam ? parseInt(clinicIdParam, 10) || undefined : undefined;

      const from = fromParam ? new Date(fromParam) : undefined;
      const to = toParam ? new Date(toParam) : undefined;

      const result = await emailLogService.listEmails({
        page,
        pageSize,
        status: statusFilter,
        clinicId,
        recipientEmail,
        sourceType,
        template,
        from: from && !isNaN(from.getTime()) ? from : undefined,
        to: to && !isNaN(to.getTime()) ? to : undefined,
      });

      return NextResponse.json({
        emails: result.emails.map((e: any) => ({
          id: e.id,
          createdAt: e.createdAt,
          recipientEmail: e.recipientEmail,
          subject: e.subject,
          status: e.status,
          template: e.template,
          sourceType: e.sourceType,
          sourceId: e.sourceId,
          messageId: e.messageId,
          sentAt: e.sentAt,
          deliveredAt: e.deliveredAt,
          openedAt: e.openedAt,
          clickedAt: e.clickedAt,
          bouncedAt: e.bouncedAt,
          complainedAt: e.complainedAt,
          errorMessage: e.errorMessage,
          errorCode: e.errorCode,
          bounceType: e.bounceType,
          bounceSubType: e.bounceSubType,
          complaintType: e.complaintType,
          retryCount: e.retryCount,
          clinicId: e.clinicId,
          clinicName: e.clinic?.name || null,
        })),
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / result.pageSize),
        },
      });
    } catch (error) {
      logger.error('[SuperAdmin EmailLogs] Error', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id,
      });
      return NextResponse.json({ error: 'Failed to fetch email logs' }, { status: 500 });
    }
  },
  { roles: ['super_admin'] }
);
