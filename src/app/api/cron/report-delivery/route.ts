/**
 * Scheduled Report Delivery Cron
 *
 * Runs hourly. Finds report schedules where nextRunAt <= now, executes the
 * report, exports to the configured format, emails to recipients, and
 * advances nextRunAt.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import { runReport, getDataSource } from '@/services/reporting/reportEngine';
import { exportToCsv } from '@/services/reporting/exporters/csv';
import { exportToPdf } from '@/services/reporting/exporters/pdf';
import { exportToXlsx } from '@/services/reporting/exporters/xlsx';
import type { ReportConfig } from '@/services/reporting/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function computeNextRun(schedule: {
  frequency: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeUtc: string;
}): Date {
  const now = new Date();
  const [h, m] = schedule.timeUtc.split(':').map(Number);
  const next = new Date(now);
  next.setUTCHours(h, m, 0, 0);

  switch (schedule.frequency) {
    case 'daily':
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 1);
      while (next.getUTCDay() !== (schedule.dayOfWeek ?? 1)) next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'biweekly':
      next.setUTCDate(next.getUTCDate() + 14);
      while (next.getUTCDay() !== (schedule.dayOfWeek ?? 1)) next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'monthly':
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(schedule.dayOfMonth ?? 1);
      break;
    default:
      next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

async function sendReportEmail(
  recipients: string[],
  reportName: string,
  format: string,
  data: Buffer | string | Uint8Array
) {
  try {
    const { sendEmailWithSES } = await import('@/lib/aws/ses');
    const mimeTypes: Record<string, string> = {
      csv: 'text/csv',
      pdf: 'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    const extension = format;
    const filename = `${reportName.replace(/\s/g, '-')}-${new Date().toISOString().slice(0, 10)}.${extension}`;

    const base64Data = Buffer.from(data).toString('base64');

    for (const email of recipients) {
      await sendEmailWithSES({
        to: email,
        subject: `Scheduled Report: ${reportName}`,
        html: `
          <h2>Scheduled Report: ${reportName}</h2>
          <p>Your scheduled report has been generated and is attached.</p>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <p style="color: #666; font-size: 12px;">This is an automated report from EON Pro.</p>
        `,
        attachments: [
          {
            filename,
            content: base64Data,
            contentType: mimeTypes[format] || 'application/octet-stream',
            encoding: 'base64',
          },
        ],
      });
    }
  } catch (error) {
    logger.error('[ReportDelivery] Failed to send email', {
      error: error instanceof Error ? error.message : 'Unknown',
      recipients,
      reportName,
    });
    throw error;
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  let processed = 0;
  let failed = 0;

  try {
    const dueSchedules = await withoutClinicFilter(async () =>
      prisma.reportSchedule.findMany({
        where: {
          isActive: true,
          nextRunAt: { lte: now },
        },
        include: {
          template: true,
        },
        take: 20,
      })
    );

    if (dueSchedules.length === 0) {
      return NextResponse.json({ success: true, processed: 0, message: 'No reports due' });
    }

    for (const schedule of dueSchedules) {
      try {
        const config = schedule.template.config as unknown as ReportConfig;
        const reportConfig: ReportConfig = {
          ...config,
          dataSource: schedule.template.dataSource,
          clinicId: schedule.clinicId || undefined,
          limit: 5000,
        };

        const result = await withoutClinicFilter(() => runReport(reportConfig));
        const ds = getDataSource(schedule.template.dataSource);
        const columns = ds?.columns || [];
        const name = schedule.template.name;

        let exportData: Buffer | string | Uint8Array;
        if (schedule.exportFormat === 'pdf') {
          exportData = await exportToPdf(result, columns, name);
        } else if (schedule.exportFormat === 'xlsx') {
          exportData = exportToXlsx(result, columns, name);
        } else {
          exportData = exportToCsv(result, columns, name);
        }

        await sendReportEmail(schedule.recipients, name, schedule.exportFormat, exportData);

        const nextRunAt = computeNextRun(schedule);
        await prisma.reportSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, nextRunAt, lastError: null },
        });

        await prisma.reportTemplate.update({
          where: { id: schedule.templateId },
          data: { lastRunAt: now },
        });

        processed++;
        logger.info('[ReportDelivery] Report delivered', {
          scheduleId: schedule.id,
          templateName: name,
          recipients: schedule.recipients.length,
          format: schedule.exportFormat,
        });
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await prisma.reportSchedule.update({
          where: { id: schedule.id },
          data: { lastError: errorMsg },
        });
        logger.error('[ReportDelivery] Failed to deliver report', {
          scheduleId: schedule.id,
          error: errorMsg,
        });
      }
    }

    return NextResponse.json({ success: true, processed, failed, total: dueSchedules.length });
  } catch (error) {
    logger.error('[ReportDelivery] Cron failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json({ success: false, error: 'Cron execution failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
