/**
 * Export Service
 * 
 * Handles export generation for CSV, Excel, and PDF formats.
 */

import { prisma, withClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';

// Types
export interface ExportConfig {
  reportType: string;
  format: 'csv' | 'excel' | 'pdf';
  dateRange: {
    start: Date;
    end: Date;
  };
  metrics?: string[];
  filters?: Record<string, any>;
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

/**
 * Export Service for generating financial reports
 */
export class ExportService {
  /**
   * Generate an export based on configuration
   */
  static async generateExport(
    clinicId: number,
    config: ExportConfig
  ): Promise<ExportResult> {
    const { format } = config;

    switch (format) {
      case 'csv':
        return this.generateCSV(clinicId, config);
      case 'excel':
        return this.generateExcel(clinicId, config);
      case 'pdf':
        return this.generatePDF(clinicId, config);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Generate CSV export
   */
  static async generateCSV(
    clinicId: number,
    config: ExportConfig
  ): Promise<ExportResult> {
    const data = await this.fetchReportData(clinicId, config);
    
    if (data.length === 0) {
      return {
        buffer: Buffer.from('No data available for the selected criteria'),
        filename: `${config.reportType}_${format(new Date(), 'yyyy-MM-dd')}.csv`,
        mimeType: 'text/csv',
      };
    }

    // Get headers from first row
    const headers = Object.keys(data[0]);
    
    // Build CSV content
    const csvRows = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape values containing commas or quotes
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value ?? '';
        }).join(',')
      ),
    ];

    return {
      buffer: Buffer.from(csvRows.join('\n'), 'utf-8'),
      filename: `${config.reportType}_${format(new Date(), 'yyyy-MM-dd')}.csv`,
      mimeType: 'text/csv',
    };
  }

  /**
   * Generate Excel export
   */
  static async generateExcel(
    clinicId: number,
    config: ExportConfig
  ): Promise<ExportResult> {
    const data = await this.fetchReportData(clinicId, config);
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EONPro Finance';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(config.reportType);

    if (data.length > 0) {
      // Add headers
      const headers = Object.keys(data[0]);
      worksheet.columns = headers.map(header => ({
        header: this.formatHeader(header),
        key: header,
        width: 15,
      }));

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF10B981' },
      };
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

      // Add data rows
      data.forEach((row, index) => {
        const dataRow = worksheet.addRow(row);
        
        // Format currency columns
        headers.forEach((header, colIndex) => {
          const cell = dataRow.getCell(colIndex + 1);
          if (this.isCurrencyField(header)) {
            cell.numFmt = '$#,##0.00';
          } else if (this.isPercentageField(header)) {
            cell.numFmt = '0.00%';
          }
        });

        // Alternate row colors
        if (index % 2 === 1) {
          dataRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF9FAFB' },
          };
        }
      });

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell?.({ includeEmpty: true }, cell => {
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = Math.min(maxLength + 2, 50);
      });
    } else {
      worksheet.addRow(['No data available for the selected criteria']);
    }

    // Add summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Report Type', config.reportType]);
    summarySheet.addRow(['Date Range', `${format(config.dateRange.start, 'yyyy-MM-dd')} to ${format(config.dateRange.end, 'yyyy-MM-dd')}`]);
    summarySheet.addRow(['Generated At', format(new Date(), 'yyyy-MM-dd HH:mm:ss')]);
    summarySheet.addRow(['Total Records', data.length]);

    const buffer = await workbook.xlsx.writeBuffer();

    return {
      buffer: Buffer.from(buffer),
      filename: `${config.reportType}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  /**
   * Generate PDF export
   * Note: Uses a simplified approach. For production, consider @react-pdf/renderer
   */
  static async generatePDF(
    clinicId: number,
    config: ExportConfig
  ): Promise<ExportResult> {
    // For now, generate a simple text-based PDF
    // In production, use @react-pdf/renderer with proper templates
    const data = await this.fetchReportData(clinicId, config);
    
    // Create simple PDF content
    // This is a placeholder - real implementation would use react-pdf
    const pdfContent = `
%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 200 >>
stream
BT
/F1 24 Tf
50 750 Td
(${config.reportType} Report) Tj
/F1 12 Tf
0 -30 Td
(Date: ${format(new Date(), 'yyyy-MM-dd')}) Tj
0 -20 Td
(Total Records: ${data.length}) Tj
0 -20 Td
(Generated by EONPro Finance) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000518 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
595
%%EOF
    `.trim();

    return {
      buffer: Buffer.from(pdfContent, 'utf-8'),
      filename: `${config.reportType}_${format(new Date(), 'yyyy-MM-dd')}.pdf`,
      mimeType: 'application/pdf',
    };
  }

  /**
   * Fetch report data based on configuration
   */
  private static async fetchReportData(
    clinicId: number,
    config: ExportConfig
  ): Promise<Record<string, any>[]> {
    return withClinicContext(clinicId, async () => {
      const { reportType, dateRange } = config;

      switch (reportType) {
        case 'revenue':
        case 'REVENUE':
          return this.fetchRevenueData(clinicId, dateRange);
        case 'patients':
        case 'PATIENTS':
          return this.fetchPatientData(clinicId, dateRange);
        case 'payouts':
        case 'PAYOUTS':
          return this.fetchPayoutData(clinicId, dateRange);
        case 'subscriptions':
        case 'SUBSCRIPTIONS':
          return this.fetchSubscriptionData(clinicId, dateRange);
        case 'invoices':
          return this.fetchInvoiceData(clinicId, dateRange);
        default:
          return [];
      }
    });
  }

  /**
   * Fetch revenue data for export
   */
  private static async fetchRevenueData(
    clinicId: number,
    dateRange: { start: Date; end: Date }
  ): Promise<Record<string, any>[]> {
    const payments = await prisma.payment.findMany({
      where: {
        clinicId,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map(p => ({
      date: format(p.createdAt, 'yyyy-MM-dd'),
      patientName: p.patient ? `${p.patient.firstName} ${p.patient.lastName}` : 'Unknown',
      patientEmail: p.patient?.email || '',
      amount: p.amount / 100,
      fee: (p.fee || 0) / 100,
      netAmount: (p.amount - (p.fee || 0)) / 100,
      status: p.status,
      paymentMethod: p.paymentMethod || 'Unknown',
    }));
  }

  /**
   * Fetch patient data for export
   */
  private static async fetchPatientData(
    clinicId: number,
    dateRange: { start: Date; end: Date }
  ): Promise<Record<string, any>[]> {
    const patients = await prisma.patient.findMany({
      where: {
        clinicId,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      include: {
        payments: {
          where: { status: 'SUCCEEDED' },
          select: { amount: true },
        },
        subscriptions: {
          select: { status: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return patients.map(p => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      createdAt: format(p.createdAt, 'yyyy-MM-dd'),
      totalPayments: p.payments.length,
      totalRevenue: p.payments.reduce((sum, pay) => sum + pay.amount, 0) / 100,
      subscriptionStatus: p.subscriptions[0]?.status || 'None',
    }));
  }

  /**
   * Fetch payout data for export
   */
  private static async fetchPayoutData(
    clinicId: number,
    dateRange: { start: Date; end: Date }
  ): Promise<Record<string, any>[]> {
    // This would integrate with Stripe to get actual payout data
    // For now, return aggregated payment data
    const payments = await prisma.payment.findMany({
      where: {
        clinicId,
        status: 'SUCCEEDED',
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      select: {
        amount: true,
        fee: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by day
    const dailyPayouts = new Map<string, { gross: number; fees: number; net: number }>();
    
    payments.forEach(p => {
      const day = format(p.createdAt, 'yyyy-MM-dd');
      const existing = dailyPayouts.get(day) || { gross: 0, fees: 0, net: 0 };
      existing.gross += p.amount;
      existing.fees += p.fee || 0;
      existing.net += p.amount - (p.fee || 0);
      dailyPayouts.set(day, existing);
    });

    return Array.from(dailyPayouts.entries()).map(([date, data]) => ({
      date,
      grossAmount: data.gross / 100,
      fees: data.fees / 100,
      netAmount: data.net / 100,
    }));
  }

  /**
   * Fetch subscription data for export
   */
  private static async fetchSubscriptionData(
    clinicId: number,
    dateRange: { start: Date; end: Date }
  ): Promise<Record<string, any>[]> {
    const subscriptions = await prisma.subscription.findMany({
      where: {
        clinicId,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return subscriptions.map(s => ({
      id: s.id,
      patientName: s.patient ? `${s.patient.firstName} ${s.patient.lastName}` : 'Unknown',
      patientEmail: s.patient?.email || '',
      planName: s.planName || 'Unknown',
      amount: s.amount / 100,
      interval: s.interval || 'monthly',
      status: s.status,
      startDate: format(s.createdAt, 'yyyy-MM-dd'),
      canceledAt: s.canceledAt ? format(s.canceledAt, 'yyyy-MM-dd') : '',
    }));
  }

  /**
   * Fetch invoice data for export
   */
  private static async fetchInvoiceData(
    clinicId: number,
    dateRange: { start: Date; end: Date }
  ): Promise<Record<string, any>[]> {
    const invoices = await prisma.invoice.findMany({
      where: {
        clinicId,
        createdAt: {
          gte: dateRange.start,
          lte: dateRange.end,
        },
      },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return invoices.map(inv => ({
      invoiceNumber: inv.invoiceNumber || `INV-${inv.id}`,
      patientName: inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName}` : 'Unknown',
      patientEmail: inv.patient?.email || '',
      amount: inv.total / 100,
      status: inv.status,
      createdAt: format(inv.createdAt, 'yyyy-MM-dd'),
      dueDate: inv.dueDate ? format(inv.dueDate, 'yyyy-MM-dd') : '',
      paidAt: inv.paidAt ? format(inv.paidAt, 'yyyy-MM-dd') : '',
    }));
  }

  /**
   * Format header for display
   */
  private static formatHeader(header: string): string {
    return header
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Check if field is a currency field
   */
  private static isCurrencyField(field: string): boolean {
    const currencyFields = ['amount', 'fee', 'netAmount', 'grossAmount', 'totalRevenue', 'revenue'];
    return currencyFields.some(f => field.toLowerCase().includes(f.toLowerCase()));
  }

  /**
   * Check if field is a percentage field
   */
  private static isPercentageField(field: string): boolean {
    const percentageFields = ['rate', 'percentage', 'percent'];
    return percentageFields.some(f => field.toLowerCase().includes(f.toLowerCase()));
  }

  /**
   * Create an export job and track progress
   */
  static async createExportJob(
    clinicId: number,
    userId: number,
    config: ExportConfig
  ): Promise<number> {
    const exportJob = await prisma.reportExport.create({
      data: {
        clinicId,
        createdBy: userId,
        reportType: config.reportType, // ReportType enum
        format: config.format,
        config: config, // Prisma JSON field accepts ExportConfig
        dateRangeStart: config.dateRange.start,
        dateRangeEnd: config.dateRange.end,
        status: 'pending',
      },
    });

    return exportJob.id;
  }

  /**
   * Update export job status
   */
  static async updateExportJobStatus(
    jobId: number,
    status: string,
    updates: Partial<{
      progress: number;
      fileUrl: string;
      fileName: string;
      fileSize: number;
      errorMessage: string;
      completedAt: Date;
    }>
  ): Promise<void> {
    await prisma.reportExport.update({
      where: { id: jobId },
      data: {
        status,
        ...updates,
      },
    });
  }
}
