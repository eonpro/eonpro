/**
 * Ticket CSAT Service
 * ===================
 *
 * Sends satisfaction surveys after ticket resolution and processes responses.
 * Uses the existing notification + email infrastructure.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import NotificationService from '@/services/notification/notificationService';

const SURVEY_EXPIRY_DAYS = 7;

class TicketCsatService {
  async sendSurvey(ticketId: number): Promise<void> {
    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          clinicId: true,
          createdById: true,
          patientId: true,
          createdBy: { select: { id: true, email: true, firstName: true } },
          patient: { select: { id: true, email: true, firstName: true } },
        },
      });

      if (!ticket) return;

      const existing = await prisma.ticketCsat.findUnique({ where: { ticketId } });
      if (existing) return;

      const expiresAt = new Date(Date.now() + SURVEY_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      const csat = await prisma.ticketCsat.create({
        data: {
          ticketId,
          score: 0,
          sentAt: new Date(),
          expiresAt,
        },
      });

      const surveyUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/csat/${csat.surveyToken}`;
      const recipientEmail = ticket.patient?.email || ticket.createdBy.email;
      const recipientName = ticket.patient?.firstName || ticket.createdBy.firstName;

      if (recipientEmail) {
        const recipientUserId = ticket.patient?.id || ticket.createdById;
        await NotificationService.createNotification({
          userId: recipientUserId,
          clinicId: ticket.clinicId ?? undefined,
          category: 'SYSTEM',
          priority: 'LOW',
          title: 'How did we do?',
          message: `Your ticket ${ticket.ticketNumber} has been resolved. Please rate your experience.`,
          actionUrl: surveyUrl,
          sourceType: 'ticket_csat',
          sourceId: `csat-${ticketId}`,
          sendEmail: true,
          emailSubject: `How was your experience? - Ticket ${ticket.ticketNumber}`,
        });
      }

      logger.info('[CSAT] Survey sent', {
        ticketId,
        csatId: csat.id,
        recipientEmail: recipientEmail ? '[REDACTED]' : null,
      });
    } catch (error) {
      logger.error('[CSAT] Failed to send survey', {
        ticketId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getSurvey(token: string) {
    const csat = await prisma.ticketCsat.findUnique({
      where: { surveyToken: token },
      include: {
        ticket: { select: { ticketNumber: true, title: true } },
      },
    });

    if (!csat) return null;

    return {
      id: csat.id,
      ticketNumber: csat.ticket.ticketNumber,
      ticketTitle: csat.ticket.title,
      hasResponded: csat.respondedAt !== null,
      isExpired: csat.expiresAt < new Date(),
      score: csat.score,
      feedback: csat.feedback,
    };
  }

  async submitResponse(token: string, score: number, feedback?: string) {
    const csat = await prisma.ticketCsat.findUnique({
      where: { surveyToken: token },
    });

    if (!csat) throw new Error('Survey not found');
    if (csat.respondedAt) throw new Error('Survey already submitted');
    if (csat.expiresAt < new Date()) throw new Error('Survey has expired');
    if (score < 1 || score > 5) throw new Error('Score must be between 1 and 5');

    await prisma.ticketCsat.update({
      where: { id: csat.id },
      data: {
        score,
        feedback: feedback?.trim() || null,
        respondedAt: new Date(),
      },
    });

    logger.info('[CSAT] Response submitted', {
      csatId: csat.id,
      ticketId: csat.ticketId,
      score,
    });
  }

  async getAverageCsat(clinicId: number): Promise<{ avgScore: number; totalResponses: number }> {
    const results = await prisma.ticketCsat.findMany({
      where: {
        respondedAt: { not: null },
        score: { gt: 0 },
        ticket: { clinicId },
      },
      select: { score: true },
    });

    if (results.length === 0) return { avgScore: 0, totalResponses: 0 };

    const total = results.reduce((s, r) => s + r.score, 0);
    return {
      avgScore: Math.round((total / results.length) * 10) / 10,
      totalResponses: results.length,
    };
  }
}

export const ticketCsatService = new TicketCsatService();
