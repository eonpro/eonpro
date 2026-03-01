import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import {
  prescriptionReportService,
  type PrescriptionDetailRow,
  type ProviderRxSummary,
} from '@/services/reporting/prescriptionReportService';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

const exportSchema = z.object({
  format: z.enum(['csv', 'pdf']),
  period: z.enum(['day', 'week', 'month', 'quarter', 'semester', 'year', 'custom']),
  startDate: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  endDate: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  clinicId: z.number().int().positive().optional(),
  providerId: z.number().int().positive().optional(),
});

// ============================================================================
// CSV generation
// ============================================================================

function escapeCSV(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCSV(
  details: PrescriptionDetailRow[],
  summary: ProviderRxSummary[]
): string {
  const BOM = '\uFEFF';

  // Summary section
  const summaryHeader = [
    'Provider',
    'Clinic',
    'Prescriptions',
    'Unique Patients',
  ]
    .map(escapeCSV)
    .join(',');

  const summaryRows = summary.map((s) =>
    [s.providerName, s.clinicName, s.prescriptionCount, s.uniquePatients]
      .map(escapeCSV)
      .join(',')
  );

  // Detail section
  const detailHeader = [
    'Date',
    'Order ID',
    'Patient Name',
    'Provider',
    'Clinic',
    'Medications',
    'Status',
  ]
    .map(escapeCSV)
    .join(',');

  const detailRows = details.map((d) =>
    [
      new Date(d.date).toLocaleDateString('en-US'),
      d.orderId,
      d.patientName,
      d.providerName,
      d.clinicName,
      d.medications,
      d.status ?? '',
    ]
      .map(escapeCSV)
      .join(',')
  );

  return [
    BOM,
    '=== PROVIDER SUMMARY ===',
    summaryHeader,
    ...summaryRows,
    '',
    '=== PRESCRIPTION DETAILS ===',
    detailHeader,
    ...detailRows,
  ].join('\r\n');
}

// ============================================================================
// PDF generation using pdf-lib
// ============================================================================

function sanitizeForPdf(text: string): string {
  if (!text) return text;
  return text
    .replace(/[\u02BB\u02BC\u02BD\u02BE\u02BF]/g, "'")
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2022/g, '*')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

async function generatePDF(
  details: PrescriptionDetailRow[],
  summary: ProviderRxSummary[],
  dateRange: { startDate: string; endDate: string }
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 792; // landscape letter
  const PAGE_H = 612;
  const MARGIN = 40;
  const LINE_H = 14;
  const HEADER_H = 18;

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const startLabel = new Date(dateRange.startDate).toLocaleDateString('en-US');
  const endLabel = new Date(dateRange.endDate).toLocaleDateString('en-US');

  function addNewPage() {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN) addNewPage();
  }

  function drawText(
    text: string,
    x: number,
    font = fontRegular,
    size = 9,
    color = rgb(0.1, 0.1, 0.1)
  ) {
    page.drawText(sanitizeForPdf(text), { x, y, size, font, color });
  }

  function truncate(text: string, maxLen: number): string {
    return text.length > maxLen ? text.slice(0, maxLen - 3) + '...' : text;
  }

  // Title
  drawText('Prescription Report', MARGIN, fontBold, 16, rgb(0.06, 0.45, 0.31));
  y -= 20;
  drawText(`Period: ${startLabel} - ${endLabel}`, MARGIN, fontRegular, 10);
  y -= 14;
  drawText(
    `Total Prescriptions: ${details.length}  |  Providers: ${summary.length}  |  Generated: ${new Date().toLocaleString('en-US')}`,
    MARGIN,
    fontRegular,
    9,
    rgb(0.4, 0.4, 0.4)
  );
  y -= 24;

  // ---- Provider Summary Table ----
  drawText('PROVIDER SUMMARY', MARGIN, fontBold, 11);
  y -= HEADER_H;

  // Header row
  const sumCols = [MARGIN, MARGIN + 180, MARGIN + 380, MARGIN + 490];
  page.drawRectangle({
    x: MARGIN,
    y: y - 2,
    width: PAGE_W - 2 * MARGIN,
    height: LINE_H + 2,
    color: rgb(0.93, 0.93, 0.93),
  });
  drawText('Provider', sumCols[0] + 4, fontBold, 8);
  drawText('Clinic', sumCols[1] + 4, fontBold, 8);
  drawText('Prescriptions', sumCols[2] + 4, fontBold, 8);
  drawText('Unique Patients', sumCols[3] + 4, fontBold, 8);
  y -= LINE_H + 4;

  for (const row of summary) {
    ensureSpace(LINE_H + 2);
    drawText(truncate(row.providerName, 30), sumCols[0] + 4);
    drawText(truncate(row.clinicName, 32), sumCols[1] + 4);
    drawText(String(row.prescriptionCount), sumCols[2] + 4);
    drawText(String(row.uniquePatients), sumCols[3] + 4);
    y -= LINE_H;
  }

  y -= 20;

  // ---- Detail Table ----
  ensureSpace(40);
  drawText('PRESCRIPTION DETAILS', MARGIN, fontBold, 11);
  y -= HEADER_H;

  const detCols = [MARGIN, MARGIN + 75, MARGIN + 120, MARGIN + 260, MARGIN + 380, MARGIN + 500, MARGIN + 680];

  function drawDetailHeader() {
    page.drawRectangle({
      x: MARGIN,
      y: y - 2,
      width: PAGE_W - 2 * MARGIN,
      height: LINE_H + 2,
      color: rgb(0.93, 0.93, 0.93),
    });
    drawText('Date', detCols[0] + 4, fontBold, 7);
    drawText('Order', detCols[1] + 4, fontBold, 7);
    drawText('Patient', detCols[2] + 4, fontBold, 7);
    drawText('Provider', detCols[3] + 4, fontBold, 7);
    drawText('Clinic', detCols[4] + 4, fontBold, 7);
    drawText('Medications', detCols[5] + 4, fontBold, 7);
    drawText('Status', detCols[6] + 4, fontBold, 7);
    y -= LINE_H + 4;
  }

  drawDetailHeader();

  for (let i = 0; i < details.length; i++) {
    ensureSpace(LINE_H + 2);

    if (y === PAGE_H - MARGIN) {
      drawDetailHeader();
    }

    const d = details[i];

    if (i % 2 === 0) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 2,
        width: PAGE_W - 2 * MARGIN,
        height: LINE_H,
        color: rgb(0.97, 0.97, 0.97),
      });
    }

    drawText(new Date(d.date).toLocaleDateString('en-US'), detCols[0] + 4, fontRegular, 7);
    drawText(String(d.orderId), detCols[1] + 4, fontRegular, 7);
    drawText(truncate(d.patientName, 22), detCols[2] + 4, fontRegular, 7);
    drawText(truncate(d.providerName, 20), detCols[3] + 4, fontRegular, 7);
    drawText(truncate(d.clinicName, 20), detCols[4] + 4, fontRegular, 7);
    drawText(truncate(d.medications, 30), detCols[5] + 4, fontRegular, 7);
    drawText(d.status ?? '', detCols[6] + 4, fontRegular, 7);
    y -= LINE_H;
  }

  // Footer on last page
  y = MARGIN - 5;
  page.drawText(
    sanitizeForPdf(`EONPro Platform - Confidential - Generated ${new Date().toISOString()}`),
    {
      x: MARGIN,
      y: 15,
      size: 7,
      font: fontRegular,
      color: rgb(0.6, 0.6, 0.6),
    }
  );

  return doc.save();
}

// ============================================================================
// Route handler
// ============================================================================

/**
 * POST /api/super-admin/prescription-reports/export
 * Generates a CSV or PDF prescription report and returns as download.
 */
export const POST = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const parsed = exportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { format, period, startDate, endDate, clinicId, providerId } = parsed.data;

    const { details, summary, dateRange } =
      await prescriptionReportService.getAllDetailsForExport({
        period,
        startDate,
        endDate,
        clinicId,
        providerId,
      });

    const dateSlug = `${dateRange.startDate.split('T')[0]}_${dateRange.endDate.split('T')[0]}`;

    await auditLog(req, {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      eventType: AuditEventType.PHI_EXPORT,
      resourceType: 'PrescriptionReport',
      action: `prescription_report_export_${format}`,
      outcome: 'SUCCESS',
    });

    if (format === 'csv') {
      const csv = generateCSV(details, summary.byProvider);

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="prescription-report-${dateSlug}.csv"`,
        },
      });
    }

    // PDF
    const pdfBytes = await generatePDF(details, summary.byProvider, dateRange);

    return new NextResponse(pdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="prescription-report-${dateSlug}.pdf"`,
      },
    });
  } catch (error) {
    logger.error('[SuperAdmin] Error exporting prescription report', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to export prescription report' },
      { status: 500 }
    );
  }
});
