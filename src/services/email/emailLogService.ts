/**
 * Email Log Service
 *
 * Handles logging of all email sends and delivery status tracking.
 * Provides analytics and reporting capabilities for email operations.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { EmailLogStatus, Prisma } from '@prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface LogEmailSentParams {
  recipientEmail: string;
  recipientUserId?: number;
  clinicId?: number;
  subject: string;
  template?: string;
  templateData?: Record<string, unknown>;
  messageId?: string;
  sourceType?: 'automation' | 'manual' | 'notification' | 'digest';
  sourceId?: string;
}

export interface UpdateDeliveryStatusParams {
  messageId: string;
  status: EmailLogStatus;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  bouncedAt?: Date;
  complainedAt?: Date;
  errorMessage?: string;
  errorCode?: string;
  bounceType?: string;
  bounceSubType?: string;
  complaintType?: string;
}

export interface EmailStatsFilters {
  clinicId?: number;
  startDate?: Date;
  endDate?: Date;
  template?: string;
  status?: EmailLogStatus;
}

export interface EmailStats {
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalComplained: number;
  totalFailed: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
}

export interface EmailStatsByTemplate {
  template: string;
  count: number;
  delivered: number;
  opened: number;
  bounced: number;
}

export interface EmailStatsByDay {
  date: string;
  sent: number;
  delivered: number;
  bounced: number;
  failed: number;
}

// ============================================================================
// Email Log Service
// ============================================================================

class EmailLogService {
  /**
   * Log an email send attempt
   */
  async logEmailSent(params: LogEmailSentParams): Promise<number> {
    try {
      // Sanitize templateData to remove PHI before storing
      const sanitizedTemplateData = params.templateData
        ? this.sanitizeTemplateData(params.templateData)
        : undefined;

      const emailLog = await prisma.emailLog.create({
        data: {
          recipientEmail: params.recipientEmail,
          recipientUserId: params.recipientUserId,
          clinicId: params.clinicId,
          subject: params.subject,
          template: params.template,
          templateData: sanitizedTemplateData as Prisma.InputJsonValue,
          messageId: params.messageId,
          status: params.messageId ? 'SENT' : 'PENDING',
          sentAt: params.messageId ? new Date() : undefined,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
        },
      });

      logger.debug('Email logged', {
        emailLogId: emailLog.id,
        recipientEmail: params.recipientEmail,
        template: params.template,
        messageId: params.messageId,
      });

      return emailLog.id;
    } catch (error) {
      logger.error('Failed to log email', {
        error: error instanceof Error ? error.message : 'Unknown error',
        recipientEmail: params.recipientEmail,
      });
      throw error;
    }
  }

  /**
   * Update the delivery status of an email
   */
  async updateDeliveryStatus(params: UpdateDeliveryStatusParams): Promise<void> {
    try {
      const updateData: Prisma.EmailLogUpdateInput = {
        status: params.status,
      };

      // Add timestamp fields based on status
      if (params.deliveredAt) updateData.deliveredAt = params.deliveredAt;
      if (params.openedAt) updateData.openedAt = params.openedAt;
      if (params.clickedAt) updateData.clickedAt = params.clickedAt;
      if (params.bouncedAt) updateData.bouncedAt = params.bouncedAt;
      if (params.complainedAt) updateData.complainedAt = params.complainedAt;

      // Add error information
      if (params.errorMessage) updateData.errorMessage = params.errorMessage;
      if (params.errorCode) updateData.errorCode = params.errorCode;

      // Add bounce/complaint details
      if (params.bounceType) updateData.bounceType = params.bounceType;
      if (params.bounceSubType) updateData.bounceSubType = params.bounceSubType;
      if (params.complaintType) updateData.complaintType = params.complaintType;

      await prisma.emailLog.update({
        where: { messageId: params.messageId },
        data: updateData,
      });

      logger.info('Email delivery status updated', {
        messageId: params.messageId,
        status: params.status,
      });
    } catch (error) {
      // If email not found, log warning but don't throw
      if ((error as any)?.code === 'P2025') {
        logger.warn('Email log not found for status update', {
          messageId: params.messageId,
        });
        return;
      }

      logger.error('Failed to update email delivery status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        messageId: params.messageId,
      });
      throw error;
    }
  }

  /**
   * Mark an email as failed
   */
  async markAsFailed(
    emailLogId: number,
    errorMessage: string,
    errorCode?: string
  ): Promise<void> {
    await prisma.emailLog.update({
      where: { id: emailLogId },
      data: {
        status: 'FAILED',
        errorMessage,
        errorCode,
        retryCount: { increment: 1 },
      },
    });
  }

  /**
   * Get email statistics for analytics
   */
  async getEmailStats(filters: EmailStatsFilters = {}): Promise<EmailStats> {
    const where: Prisma.EmailLogWhereInput = {};

    if (filters.clinicId) where.clinicId = filters.clinicId;
    if (filters.template) where.template = filters.template;
    if (filters.status) where.status = filters.status;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const [
      totalSent,
      totalDelivered,
      totalOpened,
      totalClicked,
      totalBounced,
      totalComplained,
      totalFailed,
    ] = await Promise.all([
      prisma.emailLog.count({ where: { ...where, status: { in: ['SENT', 'DELIVERED', 'OPENED', 'CLICKED'] } } }),
      prisma.emailLog.count({ where: { ...where, status: { in: ['DELIVERED', 'OPENED', 'CLICKED'] } } }),
      prisma.emailLog.count({ where: { ...where, status: { in: ['OPENED', 'CLICKED'] } } }),
      prisma.emailLog.count({ where: { ...where, status: 'CLICKED' } }),
      prisma.emailLog.count({ where: { ...where, status: 'BOUNCED' } }),
      prisma.emailLog.count({ where: { ...where, status: 'COMPLAINED' } }),
      prisma.emailLog.count({ where: { ...where, status: 'FAILED' } }),
    ]);

    const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;
    const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0;
    const clickRate = totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0;
    const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;
    const complaintRate = totalDelivered > 0 ? (totalComplained / totalDelivered) * 100 : 0;

    return {
      totalSent,
      totalDelivered,
      totalOpened,
      totalClicked,
      totalBounced,
      totalComplained,
      totalFailed,
      deliveryRate: Math.round(deliveryRate * 100) / 100,
      openRate: Math.round(openRate * 100) / 100,
      clickRate: Math.round(clickRate * 100) / 100,
      bounceRate: Math.round(bounceRate * 100) / 100,
      complaintRate: Math.round(complaintRate * 100) / 100,
    };
  }

  /**
   * Get email statistics grouped by template
   */
  async getStatsByTemplate(filters: EmailStatsFilters = {}): Promise<EmailStatsByTemplate[]> {
    const where: Prisma.EmailLogWhereInput = {
      template: { not: null },
    };

    if (filters.clinicId) where.clinicId = filters.clinicId;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    const logs = await prisma.emailLog.groupBy({
      by: ['template', 'status'],
      where,
      _count: true,
    });

    // Aggregate by template
    const templateMap = new Map<string, EmailStatsByTemplate>();

    for (const log of logs) {
      if (!log.template) continue;

      const existing = templateMap.get(log.template) || {
        template: log.template,
        count: 0,
        delivered: 0,
        opened: 0,
        bounced: 0,
      };

      existing.count += log._count;
      if (['DELIVERED', 'OPENED', 'CLICKED'].includes(log.status)) {
        existing.delivered += log._count;
      }
      if (['OPENED', 'CLICKED'].includes(log.status)) {
        existing.opened += log._count;
      }
      if (log.status === 'BOUNCED') {
        existing.bounced += log._count;
      }

      templateMap.set(log.template, existing);
    }

    return Array.from(templateMap.values()).sort((a, b) => b.count - a.count);
  }

  /**
   * Get email statistics by day for charts
   */
  async getStatsByDay(
    days: number = 30,
    clinicId?: number
  ): Promise<EmailStatsByDay[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const where: Prisma.EmailLogWhereInput = {
      createdAt: { gte: startDate },
    };
    if (clinicId) where.clinicId = clinicId;

    const logs = await prisma.emailLog.findMany({
      where,
      select: {
        createdAt: true,
        status: true,
      },
    });

    // Group by day
    const dayMap = new Map<string, EmailStatsByDay>();

    for (const log of logs) {
      const dateKey = log.createdAt.toISOString().split('T')[0];

      const existing = dayMap.get(dateKey) || {
        date: dateKey,
        sent: 0,
        delivered: 0,
        bounced: 0,
        failed: 0,
      };

      existing.sent++;
      if (['DELIVERED', 'OPENED', 'CLICKED'].includes(log.status)) {
        existing.delivered++;
      }
      if (log.status === 'BOUNCED') {
        existing.bounced++;
      }
      if (log.status === 'FAILED') {
        existing.failed++;
      }

      dayMap.set(dateKey, existing);
    }

    // Fill in missing days with zeros
    const result: EmailStatsByDay[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];

      result.push(
        dayMap.get(dateKey) || {
          date: dateKey,
          sent: 0,
          delivered: 0,
          bounced: 0,
          failed: 0,
        }
      );
    }

    return result.reverse();
  }

  /**
   * Get recent bounces and complaints for admin review
   */
  async getRecentBounces(
    limit: number = 50,
    clinicId?: number
  ): Promise<Array<{
    id: number;
    recipientEmail: string;
    status: EmailLogStatus;
    bounceType: string | null;
    bounceSubType: string | null;
    complaintType: string | null;
    errorMessage: string | null;
    createdAt: Date;
  }>> {
    const where: Prisma.EmailLogWhereInput = {
      status: { in: ['BOUNCED', 'COMPLAINED'] },
    };
    if (clinicId) where.clinicId = clinicId;

    return prisma.emailLog.findMany({
      where,
      select: {
        id: true,
        recipientEmail: true,
        status: true,
        bounceType: true,
        bounceSubType: true,
        complaintType: true,
        errorMessage: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get suppressed email addresses (hard bounces and complaints)
   */
  async getSuppressedEmails(clinicId?: number): Promise<string[]> {
    const where: Prisma.EmailLogWhereInput = {
      OR: [
        { status: 'COMPLAINED' },
        { status: 'BOUNCED', bounceType: 'Permanent' },
        { status: 'SUPPRESSED' },
      ],
    };
    if (clinicId) where.clinicId = clinicId;

    const logs = await prisma.emailLog.findMany({
      where,
      select: { recipientEmail: true },
      distinct: ['recipientEmail'],
    });

    return logs.map((log) => log.recipientEmail);
  }

  /**
   * Check if an email address is suppressed
   */
  async isEmailSuppressed(email: string): Promise<boolean> {
    const suppressed = await prisma.emailLog.findFirst({
      where: {
        recipientEmail: email.toLowerCase(),
        OR: [
          { status: 'COMPLAINED' },
          { status: 'BOUNCED', bounceType: 'Permanent' },
          { status: 'SUPPRESSED' },
        ],
      },
    });

    return !!suppressed;
  }

  /**
   * Clean up old email logs (retention policy)
   */
  async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.emailLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        // Keep bounces and complaints longer for compliance
        status: { notIn: ['BOUNCED', 'COMPLAINED'] },
      },
    });

    if (result.count > 0) {
      logger.info('Cleaned up old email logs', {
        count: result.count,
        daysToKeep,
      });
    }

    return result.count;
  }

  /**
   * Sanitize template data to remove PHI before storing
   */
  private sanitizeTemplateData(data: Record<string, unknown>): Record<string, unknown> {
    const PHI_FIELDS = [
      'firstName',
      'lastName',
      'patientName',
      'customerName',
      'email',
      'phone',
      'address',
      'dob',
      'ssn',
      'diagnosis',
      'medication',
      'shippingAddress',
    ];

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (PHI_FIELDS.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeTemplateData(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

// Export singleton instance
export const emailLogService = new EmailLogService();
export default emailLogService;
