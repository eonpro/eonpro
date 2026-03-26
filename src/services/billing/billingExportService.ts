/**
 * BILLING EXPORT SERVICE
 * ======================
 * Generates exports in multiple formats:
 * - PDF invoices (HTML-based)
 * - Excel workbooks (ExcelJS)
 * - CSV reports
 * - QuickBooks IIF format
 * - Xero CSV import format
 *
 * @module services/billing/billingExportService
 */

import ExcelJS from 'exceljs';
import { prisma } from '@/lib/db';
import { clinicInvoiceService } from './clinicInvoiceService';
import { billingAnalyticsService } from './billingAnalyticsService';
import { logger } from '@/lib/logger';
import { BRAND } from '@/lib/constants/brand-assets';

const fmtCurrency = (cents: number) => (cents / 100).toFixed(2);
const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

// ============================================================================
// PDF Invoice (HTML string for server-side rendering)
// ============================================================================

export const billingExportService = {
  /**
   * Generate branded HTML invoice (for PDF rendering or email).
   */
  async generateInvoiceHTML(invoiceId: number): Promise<string> {
    const invoice = await clinicInvoiceService.getInvoiceById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    return `<!DOCTYPE html>
<html>
<head>
<style>
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:#333;margin:0;padding:40px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px}
  .logo{font-size:28px;font-weight:700;color:#4fa77e}
  .invoice-info{text-align:right}
  .invoice-number{font-size:24px;font-weight:700;color:#1a1a1a}
  .meta{color:#666;font-size:13px;margin-top:4px}
  .parties{display:flex;justify-content:space-between;margin-bottom:30px}
  .party{width:45%}
  .party h3{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:8px}
  .party p{margin:2px 0;font-size:14px}
  table{width:100%;border-collapse:collapse;margin-bottom:30px}
  thead th{background:#f9fafb;padding:12px 16px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#666;border-bottom:2px solid #e5e7eb}
  tbody td{padding:12px 16px;border-bottom:1px solid #f3f4f6;font-size:14px}
  .amount{text-align:right}
  .total-row td{font-weight:700;font-size:16px;border-top:2px solid #e5e7eb;background:#f9fafb}
  .status{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
  .status-PAID{background:#dcfce7;color:#166534}
  .status-PENDING,.status-SENT{background:#fef9c3;color:#854d0e}
  .status-OVERDUE{background:#fecaca;color:#991b1b}
  .status-DRAFT{background:#f3f4f6;color:#374151}
  .footer{margin-top:40px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:12px;color:#999;text-align:center}
  .payment-info{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:30px}
</style>
</head>
<body>
  <div class="header">
    <div class="logo">EONPRO</div>
    <div class="invoice-info">
      <div class="invoice-number">${invoice.invoiceNumber}</div>
      <div class="meta">Created: ${fmtDate(new Date(invoice.createdAt))}</div>
      <div class="meta">Due: ${fmtDate(new Date(invoice.dueDate))}</div>
      <div style="margin-top:8px"><span class="status status-${invoice.status}">${invoice.status}</span></div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>From</h3>
      <p><strong>EONPRO Platform</strong></p>
      <p>billing@eonpro.com</p>
    </div>
    <div class="party">
      <h3>Bill To</h3>
      <p><strong>${invoice.clinic.name}</strong></p>
      <p>${invoice.config.billingEmail || invoice.clinic.adminEmail}</p>
    </div>
  </div>

  <table>
    <thead><tr><th>Description</th><th>Quantity</th><th class="amount">Amount</th></tr></thead>
    <tbody>
      ${invoice.prescriptionFeeTotal > 0 ? `<tr><td>Medical Prescription Fees</td><td>${invoice.prescriptionCount}</td><td class="amount">$${fmtCurrency(invoice.prescriptionFeeTotal)}</td></tr>` : ''}
      ${invoice.transmissionFeeTotal > 0 ? `<tr><td>Prescription Transmission Fees</td><td>${invoice.transmissionCount}</td><td class="amount">$${fmtCurrency(invoice.transmissionFeeTotal)}</td></tr>` : ''}
      ${invoice.adminFeeTotal > 0 ? `<tr><td>Weekly Admin/Platform Fee</td><td>-</td><td class="amount">$${fmtCurrency(invoice.adminFeeTotal)}</td></tr>` : ''}
      <tr class="total-row"><td colspan="2">Total Due</td><td class="amount">$${fmtCurrency(invoice.totalAmountCents)}</td></tr>
      ${(invoice.paidAmountCents ?? 0) > 0 ? `<tr><td colspan="2">Amount Paid</td><td class="amount" style="color:#166534">-$${fmtCurrency(invoice.paidAmountCents ?? 0)}</td></tr><tr class="total-row"><td colspan="2">Balance Due</td><td class="amount">$${fmtCurrency(invoice.totalAmountCents - (invoice.paidAmountCents ?? 0))}</td></tr>` : ''}
    </tbody>
  </table>

  ${invoice.stripeInvoiceUrl ? `<div class="payment-info"><strong>Pay Online:</strong> <a href="${invoice.stripeInvoiceUrl}">${invoice.stripeInvoiceUrl}</a></div>` : ''}

  <div class="footer">
    <p>Period: ${fmtDate(new Date(invoice.periodStart))} - ${fmtDate(new Date(invoice.periodEnd))}</p>
    <p>EONPRO Platform &bull; billing@eonpro.com</p>
  </div>
</body>
</html>`;
  },

  // ============================================================================
  // Excel Report
  // ============================================================================

  async generateExcelReport(
    startDate: Date,
    endDate: Date,
    clinicId?: number
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EONPRO Platform';
    workbook.created = new Date();

    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4FA77E' } },
      alignment: { horizontal: 'center' },
    };

    // Sheet 1: Summary
    const summarySheet = workbook.addWorksheet('Summary');
    const feeBreakdown = await billingAnalyticsService.getFeeTypeBreakdown(startDate, endDate);
    const collection = await billingAnalyticsService.getCollectionMetrics(startDate, endDate);

    summarySheet.columns = [{ width: 30 }, { width: 20 }];
    summarySheet.addRow(['EONPRO Billing Report']).font = { bold: true, size: 16 };
    summarySheet.addRow([`Period: ${fmtDate(startDate)} - ${fmtDate(endDate)}`]);
    summarySheet.addRow([]);
    summarySheet.addRow(['Metric', 'Value']);
    summarySheet.getRow(4).eachCell((cell) => { cell.style = headerStyle; });
    summarySheet.addRow(['Prescription Fees', `$${fmtCurrency(feeBreakdown.prescriptionFees)}`]);
    summarySheet.addRow(['Transmission Fees', `$${fmtCurrency(feeBreakdown.transmissionFees)}`]);
    summarySheet.addRow(['Admin Fees', `$${fmtCurrency(feeBreakdown.adminFees)}`]);
    summarySheet.addRow(['Total Fees', `$${fmtCurrency(feeBreakdown.total)}`]);
    summarySheet.addRow([]);
    summarySheet.addRow(['Total Invoiced', `$${fmtCurrency(collection.totalInvoicedCents)}`]);
    summarySheet.addRow(['Total Collected', `$${fmtCurrency(collection.totalPaidCents)}`]);
    summarySheet.addRow(['Outstanding', `$${fmtCurrency(collection.totalOutstandingCents)}`]);
    summarySheet.addRow(['Collection Rate', `${collection.collectionRate}%`]);
    summarySheet.addRow(['Avg Days to Pay', `${collection.avgDaysToPayment}`]);

    // Sheet 2: Invoices
    const invSheet = workbook.addWorksheet('Invoices');
    const where: Record<string, unknown> = {
      createdAt: { gte: startDate, lte: endDate },
      status: { notIn: ['CANCELLED'] },
    };
    if (clinicId) where.clinicId = clinicId;

    const invoices = await prisma.clinicPlatformInvoice.findMany({
      where,
      include: { clinic: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    invSheet.columns = [
      { header: 'Invoice #', width: 18 },
      { header: 'Clinic', width: 25 },
      { header: 'Period', width: 25 },
      { header: 'Rx Fees', width: 14 },
      { header: 'Tx Fees', width: 14 },
      { header: 'Admin Fees', width: 14 },
      { header: 'Total', width: 14 },
      { header: 'Paid', width: 14 },
      { header: 'Status', width: 14 },
      { header: 'Due Date', width: 14 },
    ];
    invSheet.getRow(1).eachCell((cell) => { cell.style = headerStyle; });

    for (const inv of invoices) {
      invSheet.addRow([
        inv.invoiceNumber,
        inv.clinic.name,
        `${fmtDate(inv.periodStart)} - ${fmtDate(inv.periodEnd)}`,
        `$${fmtCurrency(inv.prescriptionFeeTotal)}`,
        `$${fmtCurrency(inv.transmissionFeeTotal)}`,
        `$${fmtCurrency(inv.adminFeeTotal)}`,
        `$${fmtCurrency(inv.totalAmountCents)}`,
        `$${fmtCurrency(inv.paidAmountCents ?? 0)}`,
        inv.status,
        fmtDate(inv.dueDate),
      ]);
    }

    // Sheet 3: AR Aging
    const arSheet = workbook.addWorksheet('AR Aging');
    const aging = await billingAnalyticsService.getARAgingReport();
    arSheet.columns = [
      { header: 'Bucket', width: 20 },
      { header: 'Description', width: 30 },
      { header: 'Invoices', width: 12 },
      { header: 'Amount', width: 16 },
    ];
    arSheet.getRow(1).eachCell((cell) => { cell.style = headerStyle; });
    for (const b of aging) {
      arSheet.addRow([b.label, b.range, b.invoiceCount, `$${fmtCurrency(b.amountCents)}`]);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  },

  // ============================================================================
  // QuickBooks IIF Format
  // ============================================================================

  async generateQuickBooksIIF(startDate: Date, endDate: Date): Promise<string> {
    const invoices = await prisma.clinicPlatformInvoice.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { notIn: ['CANCELLED'] },
      },
      include: { clinic: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 10000,
    });

    const lines: string[] = [
      '!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO',
      '!SPL\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO',
      '!ENDTRNS',
    ];

    for (const inv of invoices) {
      const dt = new Date(inv.createdAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      const total = (inv.totalAmountCents / 100).toFixed(2);

      lines.push(`TRNS\tINVOICE\t${dt}\tAccounts Receivable\t${inv.clinic.name}\t${total}\t${inv.invoiceNumber}\tPlatform fees`);

      if (inv.prescriptionFeeTotal > 0) {
        lines.push(`SPL\tINVOICE\t${dt}\tPrescription Fee Income\t${inv.clinic.name}\t-${fmtCurrency(inv.prescriptionFeeTotal)}\t${inv.invoiceNumber}\tRx fees (${inv.prescriptionCount})`);
      }
      if (inv.transmissionFeeTotal > 0) {
        lines.push(`SPL\tINVOICE\t${dt}\tTransmission Fee Income\t${inv.clinic.name}\t-${fmtCurrency(inv.transmissionFeeTotal)}\t${inv.invoiceNumber}\tTx fees (${inv.transmissionCount})`);
      }
      if (inv.adminFeeTotal > 0) {
        lines.push(`SPL\tINVOICE\t${dt}\tAdmin Fee Income\t${inv.clinic.name}\t-${fmtCurrency(inv.adminFeeTotal)}\t${inv.invoiceNumber}\tAdmin fees`);
      }

      lines.push('ENDTRNS');
    }

    return lines.join('\n');
  },

  // ============================================================================
  // Xero CSV Import Format
  // ============================================================================

  async generateXeroCSV(startDate: Date, endDate: Date): Promise<string> {
    const invoices = await prisma.clinicPlatformInvoice.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        status: { notIn: ['CANCELLED'] },
      },
      include: {
        clinic: { select: { name: true, adminEmail: true } },
        config: { select: { billingEmail: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 10000,
    });

    const escCSV = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const header = ['ContactName', 'EmailAddress', 'InvoiceNumber', 'InvoiceDate', 'DueDate', 'Description', 'Quantity', 'UnitAmount', 'AccountCode', 'TaxType', 'Currency'];
    const rows: string[] = [header.join(',')];

    for (const inv of invoices) {
      const email = inv.config.billingEmail || inv.clinic.adminEmail;
      const dt = new Date(inv.createdAt).toLocaleDateString('en-US');
      const due = new Date(inv.dueDate).toLocaleDateString('en-US');

      if (inv.prescriptionFeeTotal > 0) {
        rows.push([
          escCSV(inv.clinic.name), escCSV(email), inv.invoiceNumber, dt, due,
          escCSV(`Medical Prescription Fees (${inv.prescriptionCount})`),
          '1', fmtCurrency(inv.prescriptionFeeTotal), '200', 'Tax Exempt', 'USD',
        ].join(','));
      }
      if (inv.transmissionFeeTotal > 0) {
        rows.push([
          escCSV(inv.clinic.name), escCSV(email), inv.invoiceNumber, dt, due,
          escCSV(`Transmission Fees (${inv.transmissionCount})`),
          '1', fmtCurrency(inv.transmissionFeeTotal), '200', 'Tax Exempt', 'USD',
        ].join(','));
      }
      if (inv.adminFeeTotal > 0) {
        rows.push([
          escCSV(inv.clinic.name), escCSV(email), inv.invoiceNumber, dt, due,
          escCSV('Weekly Admin/Platform Fee'),
          '1', fmtCurrency(inv.adminFeeTotal), '200', 'Tax Exempt', 'USD',
        ].join(','));
      }
    }

    return rows.join('\n');
  },

  // ============================================================================
  // Enhanced CSV Export
  // ============================================================================

  async generateCSVReport(startDate: Date, endDate: Date, clinicId?: number): Promise<string> {
    const where: Record<string, unknown> = {
      createdAt: { gte: startDate, lte: endDate },
      status: { notIn: ['CANCELLED'] },
    };
    if (clinicId) where.clinicId = clinicId;

    const invoices = await prisma.clinicPlatformInvoice.findMany({
      where,
      include: {
        clinic: { select: { name: true } },
        config: { select: { billingEmail: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const esc = (v: string | number | null | undefined) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = ['Invoice #', 'Clinic', 'Billing Email', 'Period Start', 'Period End', 'Period Type',
      'Rx Fees', 'Rx Count', 'Tx Fees', 'Tx Count', 'Admin Fees', 'Total', 'Paid', 'Balance', 'Status', 'Due Date', 'Created'];

    const rows = invoices.map((inv) => [
      inv.invoiceNumber,
      esc(inv.clinic.name),
      esc(inv.config.billingEmail ?? ''),
      fmtDate(inv.periodStart),
      fmtDate(inv.periodEnd),
      inv.periodType,
      fmtCurrency(inv.prescriptionFeeTotal),
      inv.prescriptionCount,
      fmtCurrency(inv.transmissionFeeTotal),
      inv.transmissionCount,
      fmtCurrency(inv.adminFeeTotal),
      fmtCurrency(inv.totalAmountCents),
      fmtCurrency(inv.paidAmountCents ?? 0),
      fmtCurrency(inv.totalAmountCents - (inv.paidAmountCents ?? 0)),
      inv.status,
      fmtDate(inv.dueDate),
      fmtDate(inv.createdAt),
    ].join(','));

    return [header.join(','), ...rows].join('\n');
  },

  // ============================================================================
  // Stripe Accounting CSV Export
  // ============================================================================

  async generateStripeAccountingCSV(
    clinicId: number | undefined,
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    const { getStripeForClinic, getStripeForPlatform, withConnectedAccount } = await import('@/lib/stripe/connect');
    const Stripe = (await import('stripe')).default;

    const context = clinicId
      ? await getStripeForClinic(clinicId)
      : getStripeForPlatform();

    const { stripe } = context;
    const connOpts = context.stripeAccountId ? { stripeAccount: context.stripeAccountId } : {};
    const startTs = Math.floor(startDate.getTime() / 1000);
    const endTs = Math.floor(endDate.getTime() / 1000);

    const allTxns: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore && allTxns.length < 5000) {
      const params: any = {
        created: { gte: startTs, lte: endTs },
        limit: 100,
        expand: ['data.source'],
        ...connOpts,
      };
      if (startingAfter) params.starting_after = startingAfter;
      const response = await stripe.balanceTransactions.list(params);
      allTxns.push(...response.data);
      hasMore = response.has_more;
      if (response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }
    }

    const esc = (v: string | number | null | undefined) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = [
      'Date', 'Transaction ID', 'Type', 'Description', 'Gross Amount', 'Stripe Fee',
      'Net Amount', 'Currency', 'Source ID', 'Payout ID', 'Customer Email',
      'Fee Breakdown', 'Account Code',
    ];

    const rows = allTxns.map((tx) => {
      const source = typeof tx.source === 'object' ? tx.source : null;
      const feeDetail = (tx.fee_details || [])
        .map((fd: any) => `${fd.type}:${fmtCurrency(fd.amount)}`)
        .join('; ');

      let accountCode = '4000';
      if (tx.type === 'refund') accountCode = '4010';
      else if (tx.type === 'payout') accountCode = '1010';
      else if (tx.type === 'stripe_fee' || tx.type === 'application_fee') accountCode = '6100';

      return [
        new Date(tx.created * 1000).toISOString().slice(0, 10),
        tx.id,
        tx.type,
        esc(tx.description || ''),
        fmtCurrency(tx.amount),
        fmtCurrency(tx.fee),
        fmtCurrency(tx.net),
        (tx.currency || 'usd').toUpperCase(),
        source?.id || '',
        '',
        source?.billing_details?.email || source?.receipt_email || '',
        esc(feeDetail),
        accountCode,
      ].join(',');
    });

    return [header.join(','), ...rows].join('\n');
  },
};

export type BillingExportService = typeof billingExportService;
