/**
 * Invoice Reminder Cron Job
 * =========================
 *
 * Sends email reminders for upcoming and overdue invoices.
 * - 7 days before due: first reminder
 * - 3 days before due: second reminder
 * - Overdue: every 7 days (max 3 reminders)
 *
 * Vercel Cron: 0 9 * * * (Daily at 09:00 UTC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  let sentCount = 0;
  let errorCount = 0;

  try {
    const upcomingInvoices = await prisma.clinicPlatformInvoice.findMany({
      where: {
        status: { in: ['PENDING', 'SENT'] },
        dueDate: {
          gte: now,
          lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
        remindersSent: { lt: 2 },
      },
      include: {
        clinic: { select: { id: true, name: true, adminEmail: true } },
        config: { select: { billingEmail: true } },
      },
    });

    for (const invoice of upcomingInvoices) {
      const daysUntilDue = Math.ceil(
        (new Date(invoice.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const shouldSend =
        (invoice.remindersSent === 0 && daysUntilDue <= 7) ||
        (invoice.remindersSent === 1 && daysUntilDue <= 3);

      if (!shouldSend) continue;

      const email = invoice.config.billingEmail || invoice.clinic.adminEmail;

      try {
        await sendEmail({
          to: email,
          subject: `Payment Reminder: Invoice ${invoice.invoiceNumber} due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`,
          html: buildReminderEmail(invoice, daysUntilDue, 'upcoming'),
        });

        await prisma.clinicPlatformInvoice.update({
          where: { id: invoice.id },
          data: {
            remindersSent: { increment: 1 },
            lastReminderAt: now,
          },
        });
        sentCount++;
      } catch (err) {
        errorCount++;
        logger.warn('[InvoiceReminders] Failed to send reminder', {
          invoiceId: invoice.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    // Overdue reminders (every 7 days, max 3 after overdue)
    const overdueInvoices = await prisma.clinicPlatformInvoice.findMany({
      where: {
        status: 'OVERDUE',
        remindersSent: { lt: 5 },
        OR: [
          { lastReminderAt: null },
          { lastReminderAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
        ],
      },
      include: {
        clinic: { select: { id: true, name: true, adminEmail: true } },
        config: { select: { billingEmail: true } },
      },
    });

    for (const invoice of overdueInvoices) {
      const daysOverdue = Math.ceil(
        (now.getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      const email = invoice.config.billingEmail || invoice.clinic.adminEmail;

      try {
        await sendEmail({
          to: email,
          subject: `OVERDUE: Invoice ${invoice.invoiceNumber} is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} past due`,
          html: buildReminderEmail(invoice, daysOverdue, 'overdue'),
        });

        await prisma.clinicPlatformInvoice.update({
          where: { id: invoice.id },
          data: {
            remindersSent: { increment: 1 },
            lastReminderAt: now,
          },
        });
        sentCount++;
      } catch (err) {
        errorCount++;
        logger.warn('[InvoiceReminders] Failed to send overdue reminder', {
          invoiceId: invoice.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    logger.info('[InvoiceReminders] Cron completed', { sentCount, errorCount });

    return NextResponse.json({
      success: true,
      sentCount,
      errorCount,
      upcoming: upcomingInvoices.length,
      overdue: overdueInvoices.length,
    });
  } catch (error) {
    logger.error('[InvoiceReminders] Cron failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}

function buildReminderEmail(
  invoice: {
    invoiceNumber: string;
    totalAmountCents: number;
    paidAmountCents: number | null;
    dueDate: Date;
    stripeInvoiceUrl: string | null;
    clinic: { name: string };
  },
  days: number,
  type: 'upcoming' | 'overdue'
): string {
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const remaining = invoice.totalAmountCents - (invoice.paidAmountCents ?? 0);
  const dueStr = new Date(invoice.dueDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const urgencyColor = type === 'overdue' ? '#EF4444' : '#F59E0B';
  const heading =
    type === 'overdue'
      ? `Invoice ${invoice.invoiceNumber} is ${days} day${days === 1 ? '' : 's'} overdue`
      : `Invoice ${invoice.invoiceNumber} is due in ${days} day${days === 1 ? '' : 's'}`;

  return `
    <!DOCTYPE html>
    <html>
    <head><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.header{background:${urgencyColor};color:#fff;padding:20px}.content{padding:20px}.button{display:inline-block;background:#3B82F6;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px}</style></head>
    <body>
      <div class="header"><h2>${heading}</h2></div>
      <div class="content">
        <p>Dear ${invoice.clinic.name},</p>
        <p><strong>Invoice:</strong> ${invoice.invoiceNumber}<br/>
        <strong>Amount Due:</strong> ${fmt(remaining)}<br/>
        <strong>Due Date:</strong> ${dueStr}</p>
        ${invoice.stripeInvoiceUrl ? `<p><a href="${invoice.stripeInvoiceUrl}" class="button">Pay Now</a></p>` : ''}
        <p>If you have already made payment, please disregard this reminder.</p>
        <p>Thank you,<br/>EONPRO Billing</p>
      </div>
    </body>
    </html>
  `;
}
