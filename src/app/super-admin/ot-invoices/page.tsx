'use client';

import React, { useState, useCallback } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Pill,
  Receipt,
  DollarSign,
  Package,
  Loader2,
  AlertCircle,
  Layers,
  Percent,
  Truck,
  BookOpen,
  CreditCard,
  Landmark,
  LayoutList,
  UserCircle,
  Users,
  Banknote,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { OtMedicationPricingCatalog } from '@/components/invoices/OtMedicationPricingCatalog';
import { todayET } from '@/lib/utils/timezone';

interface OtPharmacyLineItem {
  orderId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  patientId: number;
  providerName: string;
  providerId: number;
  medicationName: string;
  strength: string;
  vialSize: string;
  medicationKey: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  pricingStatus: 'priced' | 'estimated' | 'missing';
}

interface OtShippingLineItem {
  orderId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  description: string;
  feeCents: number;
}

interface OtPharmacyInvoice {
  invoiceType: 'pharmacy';
  clinicName: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: OtPharmacyLineItem[];
  shippingLineItems: OtShippingLineItem[];
  prescriptionFeeLineItems: OtShippingLineItem[];
  trtTelehealthLineItems: OtShippingLineItem[];
  subtotalMedicationsCents: number;
  subtotalShippingCents: number;
  subtotalPrescriptionFeesCents: number;
  subtotalTrtTelehealthCents: number;
  totalCents: number;
  orderCount: number;
  vialCount: number;
  missingPriceCount: number;
  estimatedPriceCount: number;
}

interface OtDoctorApprovalLineItem {
  orderId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  patientId: number;
  providerName: string;
  providerId: number;
  medications: string;
  feeCents: number;
  approvalMode: 'async' | 'sync';
  doctorFeeWaivedReason?: string | null;
}

interface OtDoctorApprovalsInvoice {
  invoiceType: 'doctor_approvals';
  clinicName: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: OtDoctorApprovalLineItem[];
  asyncFeeCents: number;
  syncFeeCents: number;
  asyncCount: number;
  syncCount: number;
  totalCents: number;
}

interface OtFulfillmentLineItem {
  orderId: number;
  invoiceDbId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  description: string;
  patientLineAmountCents: number;
  feeCents: number;
}

interface OtFulfillmentInvoice {
  invoiceType: 'fulfillment';
  clinicName: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: OtFulfillmentLineItem[];
  totalCents: number;
}

interface OtMerchantProcessingFee {
  grossSalesCents: number;
  rateBps: number;
  feeCents: number;
}

interface OtPlatformCompensation {
  grossSalesCents: number;
  rateBps: number;
  feeCents: number;
  invoiceCount: number;
}

interface OtPerSaleReconciliationLine {
  orderId: number;
  invoiceDbId: number | null;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  patientGrossCents: number;
  patientGrossSource?: 'stripe_payments' | 'invoice_sync';
  stripeBillingNameMatch?: 'match' | 'mismatch' | 'unknown';
  invoicePatientMatchesOrder?: boolean;
  medicationsCostCents: number;
  shippingCents: number;
  trtTelehealthCents: number;
  pharmacyTotalCents: number;
  doctorApprovalCents: number;
  doctorRxFeeNominalCents?: number;
  doctorRxFeeWaivedCents?: number;
  doctorRxFeeDaysSincePrior?: number | null;
  doctorRxFeeNote?: string | null;
  fulfillmentFeesCents: number;
  merchantProcessingCents: number;
  platformCompensationCents: number;
  salesRepCommissionCents?: number;
  salesRepId?: number | null;
  salesRepName?: string | null;
  managerOverrideTotalCents?: number;
  managerOverrideSummary?: string | null;
  totalDeductionsCents: number;
  clinicNetPayoutCents: number;
}

interface OtPaymentCollectionRow {
  paymentId: number;
  paidAt: string | null;
  recordedAt: string;
  amountCents: number;
  netCollectedCents: number;
  patientId: number;
  patientName: string;
  description: string | null;
  invoiceId: number | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
}

interface OtInvoiceData {
  pharmacy: OtPharmacyInvoice;
  doctorApprovals: OtDoctorApprovalsInvoice;
  fulfillment: OtFulfillmentInvoice;
  merchantProcessing: OtMerchantProcessingFee;
  platformCompensation: OtPlatformCompensation;
  grandTotalCents: number;
  clinicNetPayoutCents: number;
  salesRepCommissionTotalCents?: number;
  managerOverrideTotalCents?: number;
  /** Present after API deploy; empty array when missing. */
  perSaleReconciliation?: OtPerSaleReconciliationLine[];
  /** Every succeeded / partial / full-refund Payment for OT patients in the date window (cash ledger). */
  paymentCollections?: OtPaymentCollectionRow[];
  paymentsCollectedNetCents?: number;
  matchedPrescriptionInvoiceGrossCents?: number;
  feesUseCashCollectedBasis?: boolean;
}

type ActiveTab =
  | 'pharmacy'
  | 'all_payments'
  | 'doctor_approvals'
  | 'fulfillment'
  | 'per_sale'
  | 'pricing_catalog';

function centsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });
}

/** Invoice days are US/Eastern; never use UTC calendar from `toISOString()` (evening ET can be “tomorrow” in UTC). */
function getDefaultInvoiceDateET(): string {
  return todayET();
}

export default function OtInvoicesPage() {
  const [startDate, setStartDate] = useState(() => getDefaultInvoiceDateET());
  const [endDate, setEndDate] = useState(() => getDefaultInvoiceDateET());
  const [useRange, setUseRange] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OtInvoiceData | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('pharmacy');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const params = new URLSearchParams({ date: startDate });
      if (useRange && endDate !== startDate) params.set('endDate', endDate);
      const res = await apiFetch(`/api/super-admin/ot-invoices?${params}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Failed (${res.status})`);
      }
      setData((await res.json()) as OtInvoiceData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invoices');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, useRange]);

  const handleExport = async (
    invoiceType:
      | 'pharmacy'
      | 'doctor_approvals'
      | 'fulfillment'
      | 'per_sale'
      | 'all_payments'
      | 'combined'
      | 'summary',
    format: 'csv' | 'pdf',
  ) => {
    const key = `${invoiceType}_${format}`;
    setExporting(key);
    try {
      const body: Record<string, string> = { date: startDate, format, invoiceType };
      if (useRange && endDate !== startDate) body.endDate = endDate;
      if (format === 'pdf') body.invoiceType = 'summary';

      const response = await fetch('/api/super-admin/ot-invoices/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        throw new Error(errJson?.error || `Export failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      const ext = format === 'pdf' ? 'pdf' : 'csv';
      a.download = filenameMatch?.[1] || `ot-invoice-${invoiceType}-${startDate}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">OT (Overtime) Invoices</h1>
        <p className="mt-1 text-gray-500">
          EONPro collects patient payments (Stripe); this report is a reconciliation statement: it lists
          cost and fee allocations so you can see what remains as the OT clinic payout. Line items include
          pharmacy costs,{' '}
          <strong className="font-medium text-gray-700">$20 shipping per prescription</strong> ($30 if the
          order includes NAD+, glutathione, sermorelin, semaglutide, or tirzepatide),{' '}
          <strong className="font-medium text-gray-700">$30 doctor / Rx fee</strong> on new sales or if the last paid
          Rx was ≥90 days ago; <strong className="font-medium text-gray-700">$0</strong> for refills within 90 days,{' '}
          <strong className="font-medium text-gray-700">$50 TRT telehealth</strong> for testosterone replacement
          therapy orders only, other Stripe lines, plus{' '}
          <strong className="font-medium text-gray-700">4% merchant processing</strong> and{' '}
          <strong className="font-medium text-gray-700">10% EONPro</strong> on gross patient payments, plus{' '}
          <strong className="font-medium text-gray-700">sales rep commission</strong> and{' '}
          <strong className="font-medium text-gray-700">manager oversight</strong> from the commission ledger when
          present.
        </p>
      </div>

      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {useRange ? 'Start Date' : 'Invoice Date'}
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
              />
            </div>
          </div>
          {useRange && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">End Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-1 focus:ring-[#4fa77e]"
                />
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={useRange}
              onChange={(e) => {
                setUseRange(e.target.checked);
                if (!e.target.checked) setEndDate(startDate);
              }}
              className="rounded border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]"
            />
            Date range
          </label>
          <button
            type="button"
            onClick={fetchInvoices}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#3d8a65] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Generate
          </button>
        </div>
        <p className="mt-3 text-sm text-gray-500">
          The <strong>All payments</strong> tab lists every <code className="rounded bg-gray-100 px-1 text-xs">Payment</code>{' '}
          row for OT patients with <strong>paidAt</strong> (or <strong>createdAt</strong> if paidAt is empty) in the
          Eastern window — that is the cash ledger to compare to Stripe. Pharmacy / per-sale tabs still use matched
          prescription invoices and orders. A single day with no rows in All payments means nothing hit the DB for that
          calendar day in that window; use <strong>Date range</strong> to match your payout batch.
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <TabButton
          active={activeTab === 'pharmacy'}
          onClick={() => setActiveTab('pharmacy')}
          icon={<Pill className="h-4 w-4" />}
          label="Pharmacy"
          badge={data ? centsToDisplay(data.pharmacy.totalCents) : '—'}
        />
        <TabButton
          active={activeTab === 'all_payments'}
          onClick={() => setActiveTab('all_payments')}
          icon={<Banknote className="h-4 w-4" />}
          label="All payments"
          badge={data ? String(data.paymentCollections?.length ?? 0) : '—'}
        />
        <TabButton
          active={activeTab === 'doctor_approvals'}
          onClick={() => setActiveTab('doctor_approvals')}
          icon={<Receipt className="h-4 w-4" />}
          label="Doctor approvals"
          badge={data ? centsToDisplay(data.doctorApprovals.totalCents) : '—'}
        />
        <TabButton
          active={activeTab === 'fulfillment'}
          onClick={() => setActiveTab('fulfillment')}
          icon={<Layers className="h-4 w-4" />}
          label="Fulfillment"
          badge={data ? centsToDisplay(data.fulfillment.totalCents) : '—'}
        />
        <TabButton
          active={activeTab === 'per_sale'}
          onClick={() => setActiveTab('per_sale')}
          icon={<LayoutList className="h-4 w-4" />}
          label="Per-sale reconciliation"
          badge={data ? String(data.perSaleReconciliation?.length ?? 0) : '—'}
        />
        <TabButton
          active={activeTab === 'pricing_catalog'}
          onClick={() => setActiveTab('pricing_catalog')}
          icon={<BookOpen className="h-4 w-4" />}
          label="OT medication pricing"
          badge="Ref"
        />
      </div>

      {activeTab === 'pricing_catalog' && (
        <div className="mb-8 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:p-6">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">OT.EONPRO.IO medication pricing</h2>
          <p className="mb-4 text-sm text-gray-500">
            Official 1-month and quarterly options — select rows to copy quotes for reps and admins.
          </p>
          <OtMedicationPricingCatalog embedded />
        </div>
      )}

      {data && activeTab !== 'pricing_catalog' && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            <SummaryCard
              icon={<Package className="h-5 w-5 text-blue-600" />}
              label="Orders"
              value={String(data.pharmacy.orderCount)}
              bg="bg-blue-50"
            />
            <SummaryCard
              icon={<Banknote className="h-5 w-5 text-teal-700" />}
              label="Cash collected (net)"
              value={centsToDisplay(data.paymentsCollectedNetCents ?? 0)}
              subvalue={`${data.paymentCollections?.length ?? 0} Payment rows · All payments tab`}
              bg="bg-teal-50"
            />
            <SummaryCard
              icon={<Pill className="h-5 w-5 text-purple-600" />}
              label="Pharm. COGS qty"
              value={String(data.pharmacy.vialCount)}
              bg="bg-purple-50"
            />
            <SummaryCard
              icon={<Truck className="h-5 w-5 text-emerald-700" />}
              label="Pharmacy"
              value={centsToDisplay(data.pharmacy.totalCents)}
              subvalue={
                [
                  data.pharmacy.missingPriceCount > 0 && `${data.pharmacy.missingPriceCount} unpriced qty`,
                  data.pharmacy.estimatedPriceCount > 0 &&
                    `${data.pharmacy.estimatedPriceCount} est. (name match)`,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
              bg="bg-emerald-50"
            />
            <SummaryCard
              icon={<Receipt className="h-5 w-5 text-amber-600" />}
              label="Doctor approvals"
              value={centsToDisplay(data.doctorApprovals.totalCents)}
              subvalue={`${data.doctorApprovals.asyncCount} async · ${data.doctorApprovals.syncCount} sync`}
              bg="bg-amber-50"
            />
            <SummaryCard
              icon={<Layers className="h-5 w-5 text-indigo-600" />}
              label="Fulfillment (other)"
              value={centsToDisplay(data.fulfillment.totalCents)}
              bg="bg-indigo-50"
            />
            <SummaryCard
              icon={<CreditCard className="h-5 w-5 text-slate-600" />}
              label="Merchant processing (4%)"
              value={centsToDisplay(data.merchantProcessing.feeCents)}
              subvalue={
                data.feesUseCashCollectedBasis
                  ? `on ${centsToDisplay(data.merchantProcessing.grossSalesCents)} cash (net)`
                  : `on ${centsToDisplay(data.merchantProcessing.grossSalesCents)} gross`
              }
              bg="bg-slate-50"
            />
            <SummaryCard
              icon={<Percent className="h-5 w-5 text-rose-600" />}
              label="EONPro platform (10%)"
              value={centsToDisplay(data.platformCompensation.feeCents)}
              subvalue={
                data.feesUseCashCollectedBasis
                  ? `on ${centsToDisplay(data.platformCompensation.grossSalesCents)} cash (net)`
                  : `on ${centsToDisplay(data.platformCompensation.grossSalesCents)} gross`
              }
              bg="bg-rose-50"
            />
            <SummaryCard
              icon={<UserCircle className="h-5 w-5 text-cyan-700" />}
              label="Sales rep commission"
              value={centsToDisplay(data.salesRepCommissionTotalCents ?? 0)}
              subvalue="from ledger"
              bg="bg-cyan-50"
            />
            <SummaryCard
              icon={<Users className="h-5 w-5 text-orange-700" />}
              label="Manager oversight"
              value={centsToDisplay(data.managerOverrideTotalCents ?? 0)}
              subvalue="override / % of subordinate gross"
              bg="bg-orange-50"
            />
            <SummaryCard
              icon={<DollarSign className="h-5 w-5 text-red-600" />}
              label="Total deductions"
              value={centsToDisplay(data.grandTotalCents)}
              subvalue={data.feesUseCashCollectedBasis ? 'from cash collected (net)' : 'from matched invoice gross'}
              bg="bg-red-50"
            />
            <SummaryCard
              icon={<Landmark className="h-5 w-5 text-[#4fa77e]" />}
              label="Net to OT clinic"
              value={centsToDisplay(data.clinicNetPayoutCents)}
              subvalue="payout from EONPro"
              bg="bg-emerald-50/80"
            />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleExport(activeTab, 'csv')}
              disabled={exporting !== null}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting === `${activeTab}_csv` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export tab CSV
            </button>
            <button
              type="button"
              onClick={() => handleExport('combined', 'csv')}
              disabled={exporting !== null}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting === `combined_csv` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Combined CSV (includes per-sale)
            </button>
            <button
              type="button"
              onClick={() => handleExport('per_sale', 'csv')}
              disabled={exporting !== null}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting === `per_sale_csv` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Per-sale CSV only
            </button>
            <button
              type="button"
              onClick={() => handleExport('summary', 'pdf')}
              disabled={exporting !== null}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting === `summary_pdf` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Summary PDF
            </button>
          </div>

            {activeTab === 'pharmacy' && <PharmacyTable invoice={data.pharmacy} />}
            {activeTab === 'all_payments' && (
              <PaymentCollectionsTable
                rows={data.paymentCollections ?? []}
                matchedRxGrossCents={data.matchedPrescriptionInvoiceGrossCents ?? 0}
                feesUseCashCollectedBasis={data.feesUseCashCollectedBasis ?? false}
              />
            )}
            {activeTab === 'doctor_approvals' && <DoctorTable invoice={data.doctorApprovals} />}
            {activeTab === 'fulfillment' && <FulfillmentTable invoice={data.fulfillment} />}
            {activeTab === 'per_sale' && (
              <PerSaleReconciliationTable rows={data.perSaleReconciliation ?? []} />
            )}
        </>
      )}

      {!loading && !data && !error && activeTab !== 'pricing_catalog' && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <FileText className="mb-4 h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-500">Select a date and generate</p>
          <p className="mt-1 max-w-md text-sm text-gray-400">
            Async approvals use orders that went through the provider queue (
            <code className="rounded bg-gray-200 px-1 text-xs">queuedForProviderAt</code>
            ). Expand shipping SKUs and medication keys in <code className="rounded bg-gray-200 px-1 text-xs">ot-pricing.ts</code>.
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  subvalue,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subvalue?: string;
  bg: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500">{label}</p>
          <p className="truncate text-lg font-bold text-gray-900">{value}</p>
          {subvalue ? <p className="text-xs leading-snug text-gray-500">{subvalue}</p> : null}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-[#4fa77e]/10 text-[#4fa77e]' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {icon}
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
          active ? 'bg-[#4fa77e]/20 text-[#4fa77e]' : 'bg-gray-100 text-gray-500'
        }`}
      >
        {badge}
      </span>
    </button>
  );
}

function PaymentCollectionsTable({
  rows,
  matchedRxGrossCents,
  feesUseCashCollectedBasis,
}: {
  rows: OtPaymentCollectionRow[];
  matchedRxGrossCents: number;
  feesUseCashCollectedBasis: boolean;
}) {
  const totalNet = rows.reduce((s, r) => s + r.netCollectedCents, 0);
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <p className="border-b border-gray-100 px-4 py-3 text-sm text-gray-600">
        Every <strong>Payment</strong> record for OT clinic patients in this Eastern window (not limited to prescription
        invoices). <strong>Net</strong> is amount minus refunds. Summary <strong>4% / 10%</strong> fees use this net total
        when it is greater than zero{feesUseCashCollectedBasis ? ' (active for this period)' : ''}. Matched Rx-invoice
        gross for the same period is{' '}
        <span className="font-semibold text-gray-800">{centsToDisplay(matchedRxGrossCents)}</span> (subset used for
        pharmacy / per-sale breakdowns).
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            <th className="px-4 py-3">Paid (ET)</th>
            <th className="px-4 py-3">Recorded (ET)</th>
            <th className="px-4 py-3 font-mono">Pay #</th>
            <th className="px-4 py-3">Patient</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3 text-right">Net</th>
            <th className="px-4 py-3 font-mono">Invoice</th>
            <th className="px-4 py-3 font-mono">Stripe PI</th>
            <th className="px-4 py-3">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                No Payment rows in this window. If Stripe shows charges, check another day or use <strong>Date range</strong>
                ; confirm patients are on the OT clinic and that webhooks recorded <code className="rounded bg-gray-100 px-1 text-xs">paidAt</code>.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.paymentId} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-2 text-xs text-emerald-700">
                  {r.paidAt ? formatDateTime(r.paidAt) : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-600">{formatDateTime(r.recordedAt)}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.paymentId}</td>
                <td className="max-w-[160px] truncate px-4 py-2 font-medium" title={r.patientName}>
                  {r.patientName}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">{centsToDisplay(r.amountCents)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-semibold">{centsToDisplay(r.netCollectedCents)}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.invoiceId ?? '—'}</td>
                <td className="max-w-[140px] truncate px-4 py-2 font-mono text-xs text-violet-800" title={r.stripePaymentIntentId ?? ''}>
                  {r.stripePaymentIntentId ?? '—'}
                </td>
                <td className="max-w-md truncate px-4 py-2 text-gray-700" title={r.description ?? ''}>
                  {r.description ?? '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {rows.length > 0 && (
        <div className="flex justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 font-semibold">
          <span>Net collected ({rows.length} payments)</span>
          <span>{centsToDisplay(totalNet)}</span>
        </div>
      )}
    </div>
  );
}

function PharmacyTable({ invoice }: { invoice: OtPharmacyInvoice }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <p className="border-b border-gray-100 px-4 py-3 text-sm text-gray-600">
        Pharmacy <strong>Qty</strong> is internal COGS units (one dispensed package for typical oral lines), not Lifefile
        tablet/day counts. Patient totals in Stripe stay on the <strong>Per-sale</strong> tab as gross.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            <th className="px-4 py-3">Paid (ET)</th>
            <th className="px-4 py-3">Order</th>
            <th className="px-4 py-3">Patient</th>
            <th className="px-4 py-3">LF Order</th>
            <th className="px-4 py-3">Medication</th>
            <th className="px-4 py-3">Strength</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Unit</th>
            <th className="px-4 py-3 text-right">Line</th>
            <th className="px-4 py-3">Priced</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {invoice.lineItems.map((li, idx) => (
            <tr key={`${li.orderId}-${idx}`} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-2 text-xs text-emerald-700">
                {li.paidAt ? formatDateTime(li.paidAt) : '—'}
              </td>
              <td className="px-4 py-2 font-mono text-xs">{li.orderId}</td>
              <td className="px-4 py-2 font-medium">{li.patientName}</td>
              <td className="px-4 py-2 font-mono text-xs text-gray-400">{li.lifefileOrderId ?? '—'}</td>
              <td className="px-4 py-2">{li.medicationName}</td>
              <td className="px-4 py-2 text-gray-600">{li.strength}</td>
              <td className="px-4 py-2 text-right">{li.quantity}</td>
              <td className="px-4 py-2 text-right">{centsToDisplay(li.unitPriceCents)}</td>
              <td className="px-4 py-2 text-right font-semibold">{centsToDisplay(li.lineTotalCents)}</td>
              <td className="px-4 py-2">
                {li.pricingStatus === 'missing' ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">missing</span>
                ) : li.pricingStatus === 'estimated' ? (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-900" title="COGS from medication name — add Lifefile id to catalog when known">
                    est.
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">priced</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {invoice.shippingLineItems.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 text-xs font-semibold uppercase text-gray-500">
          Prescription shipping (per order)
        </div>
      )}
      {invoice.shippingLineItems.map((s, i) => (
        <div key={i} className="flex justify-between border-t border-amber-50 bg-amber-50/40 px-4 py-2 text-sm">
          <span className="text-amber-900">
            Order {s.orderId} · {s.description}
          </span>
          <span className="font-medium text-amber-900">{centsToDisplay(s.feeCents)}</span>
        </div>
      ))}
      {invoice.trtTelehealthLineItems.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 text-xs font-semibold uppercase text-gray-500">
          TRT telehealth ($50)
        </div>
      )}
      {invoice.trtTelehealthLineItems.map((s, i) => (
        <div key={`trt-${i}`} className="flex justify-between border-t border-violet-50 bg-violet-50/50 px-4 py-2 text-sm">
          <span className="text-violet-900">
            Order {s.orderId} · {s.description}
          </span>
          <span className="font-medium text-violet-900">{centsToDisplay(s.feeCents)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 font-semibold">
        <span>Pharmacy total</span>
        <span>{centsToDisplay(invoice.totalCents)}</span>
      </div>
    </div>
  );
}

function DoctorTable({ invoice }: { invoice: OtDoctorApprovalsInvoice }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <p className="border-b border-gray-100 px-4 py-3 text-sm text-gray-600">
        Doctor / Rx rate {centsToDisplay(invoice.asyncFeeCents)} (async) · {centsToDisplay(invoice.syncFeeCents)} (sync).
        No fee when the patient had another paid prescription invoice at this clinic within the last 90 days.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            <th className="px-4 py-3">Paid (ET)</th>
            <th className="px-4 py-3">Order</th>
            <th className="px-4 py-3">Patient</th>
            <th className="px-4 py-3">Medications</th>
            <th className="px-4 py-3">Mode</th>
            <th className="px-4 py-3 text-right">Fee</th>
            <th className="px-4 py-3">Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {invoice.lineItems.map((li, idx) => (
            <tr key={idx} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-4 py-2 text-xs text-emerald-700">
                {li.paidAt ? formatDateTime(li.paidAt) : '—'}
              </td>
              <td className="px-4 py-2 font-mono text-xs">{li.orderId}</td>
              <td className="px-4 py-2 font-medium">{li.patientName}</td>
              <td className="max-w-xs truncate px-4 py-2 text-gray-600" title={li.medications}>
                {li.medications}
              </td>
              <td className="px-4 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    li.approvalMode === 'async' ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'
                  }`}
                >
                  {li.approvalMode}
                </span>
              </td>
              <td className="px-4 py-2 text-right font-semibold">{centsToDisplay(li.feeCents)}</td>
              <td className="max-w-xs px-4 py-2 text-xs text-gray-500" title={li.doctorFeeWaivedReason ?? ''}>
                {li.doctorFeeWaivedReason ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 font-semibold">
        <span>Approvals total</span>
        <span>{centsToDisplay(invoice.totalCents)}</span>
      </div>
    </div>
  );
}

function FulfillmentTable({ invoice }: { invoice: OtFulfillmentInvoice }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <p className="border-b border-gray-100 px-4 py-3 text-sm text-gray-600">
        Non-pharmacy Stripe invoice lines (heuristic). Set per-line fees in{' '}
        <code className="rounded bg-gray-100 px-1 text-xs">ot-pricing.ts</code>.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            <th className="px-4 py-3">Paid (ET)</th>
            <th className="px-4 py-3">Order</th>
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3">Patient</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3 text-right">Patient line</th>
            <th className="px-4 py-3 text-right">Fee</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {invoice.lineItems.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                No other line items in this period (or all lines matched pharmacy / shipping heuristics).
              </td>
            </tr>
          ) : (
            invoice.lineItems.map((li, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-2 text-xs text-emerald-700">
                  {li.paidAt ? formatDateTime(li.paidAt) : '—'}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{li.orderId}</td>
                <td className="px-4 py-2 font-mono text-xs">{li.invoiceDbId}</td>
                <td className="px-4 py-2 font-medium">{li.patientName}</td>
                <td className="max-w-md px-4 py-2 text-gray-700">{li.description}</td>
                <td className="px-4 py-2 text-right">{centsToDisplay(li.patientLineAmountCents)}</td>
                <td className="px-4 py-2 text-right font-semibold">{centsToDisplay(li.feeCents)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="flex justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 font-semibold">
        <span>Fulfillment total</span>
        <span>{centsToDisplay(invoice.totalCents)}</span>
      </div>
    </div>
  );
}

function PerSaleReconciliationTable({ rows }: { rows: OtPerSaleReconciliationLine[] }) {
  const sum = (pick: (r: OtPerSaleReconciliationLine) => number) =>
    rows.reduce((s, r) => s + pick(r), 0);
  const repCents = (r: OtPerSaleReconciliationLine) => r.salesRepCommissionCents ?? 0;
  const mgrCents = (r: OtPerSaleReconciliationLine) => r.managerOverrideTotalCents ?? 0;

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
        No paid sales in this period.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <p className="border-b border-gray-100 px-4 py-3 text-sm text-gray-600">
        Each row is one order / sale. Patient gross uses net succeeded <strong>Payment</strong> rows when present
        (Stripe-settled); otherwise the prescription <strong>Invoice</strong> amounts synced from Stripe. Pharmacy
        breakdown comes from the Lifefile order / Rx on that sale. Doctor / Rx: $30 nominal (async/sync); charged
        amount is $0 when the patient had another paid prescription invoice at this clinic within the last 90 days. Rep
        commission and manager oversight come from the commission ledger (Stripe invoice id match).
      </p>
      <table className="w-full min-w-[1960px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            <th className="whitespace-nowrap px-3 py-3">Paid (ET)</th>
            <th className="px-3 py-3">Order</th>
            <th className="px-3 py-3">Inv</th>
            <th className="px-3 py-3">Patient</th>
            <th className="px-3 py-3 text-right">Gross</th>
            <th className="px-3 py-3 text-right">Meds</th>
            <th className="px-3 py-3 text-right">Ship</th>
            <th className="px-3 py-3 text-right">TRT</th>
            <th className="px-3 py-3 text-right">Pharmacy</th>
            <th className="px-3 py-3 text-right">Dr/Rx charged</th>
            <th className="px-3 py-3 text-right">Dr/Rx nominal</th>
            <th className="px-3 py-3 text-right">Dr/Rx waived</th>
            <th className="px-3 py-3 text-right">Days</th>
            <th className="px-3 py-3">Dr/Rx note</th>
            <th className="px-3 py-3 text-right">Fulfill</th>
            <th className="px-3 py-3 text-right">4%</th>
            <th className="px-3 py-3 text-right">10%</th>
            <th className="px-3 py-3">Rep</th>
            <th className="px-3 py-3 text-right">Rep $</th>
            <th className="px-3 py-3 text-right">Mgr OS</th>
            <th className="px-3 py-3">Mgr detail</th>
            <th className="px-3 py-3 text-right">Deduct</th>
            <th className="px-3 py-3 text-right">Net OT</th>
            <th className="px-3 py-3 text-center text-xs normal-case">Gross src</th>
            <th className="px-3 py-3 text-center text-xs normal-case">Stripe name</th>
            <th className="px-3 py-3 text-center text-xs normal-case">Inv=Pt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r) => (
            <tr key={`${r.orderId}-${r.invoiceDbId ?? 'x'}`} className="hover:bg-gray-50">
              <td className="whitespace-nowrap px-3 py-2 text-xs text-emerald-700">
                {r.paidAt ? formatDateTime(r.paidAt) : '—'}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.orderId}</td>
              <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.invoiceDbId ?? '—'}</td>
              <td className="max-w-[140px] truncate px-3 py-2 font-medium" title={r.patientName}>
                {r.patientName}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{centsToDisplay(r.patientGrossCents)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-gray-700">
                {centsToDisplay(r.medicationsCostCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{centsToDisplay(r.shippingCents)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{centsToDisplay(r.trtTelehealthCents)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-medium">{centsToDisplay(r.pharmacyTotalCents)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{centsToDisplay(r.doctorApprovalCents)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-gray-600">
                {centsToDisplay(r.doctorRxFeeNominalCents ?? r.doctorApprovalCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-amber-800">
                {centsToDisplay(r.doctorRxFeeWaivedCents ?? 0)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-gray-600">
                {r.doctorRxFeeDaysSincePrior != null ? r.doctorRxFeeDaysSincePrior : '—'}
              </td>
              <td className="max-w-[200px] truncate px-3 py-2 text-xs text-gray-600" title={r.doctorRxFeeNote ?? ''}>
                {r.doctorRxFeeNote ?? '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{centsToDisplay(r.fulfillmentFeesCents)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">
                {centsToDisplay(r.merchantProcessingCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-rose-700">
                {centsToDisplay(r.platformCompensationCents)}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2 text-xs text-gray-700" title={r.salesRepName ?? ''}>
                {r.salesRepName ?? '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-cyan-800">{centsToDisplay(repCents(r))}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-orange-800">{centsToDisplay(mgrCents(r))}</td>
              <td className="max-w-[180px] truncate px-3 py-2 text-xs text-gray-600" title={r.managerOverrideSummary ?? ''}>
                {r.managerOverrideSummary ?? '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-gray-800">
                {centsToDisplay(r.totalDeductionsCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-[#2d6b4f]">
                {centsToDisplay(r.clinicNetPayoutCents)}
              </td>
              <td className="px-2 py-2 text-center text-xs">
                {r.patientGrossSource === 'stripe_payments' ? (
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-900" title="Gross from Payment rows">
                    txn
                  </span>
                ) : r.patientGrossSource === 'invoice_sync' ? (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700" title="Gross from Invoice (Stripe sync)">
                    inv
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-2 py-2 text-center text-xs">
                {r.stripeBillingNameMatch === 'match' ? (
                  <span className="text-emerald-700" title="Stripe billing name matches profile">
                    ✓
                  </span>
                ) : r.stripeBillingNameMatch === 'mismatch' ? (
                  <span className="font-medium text-amber-800" title="Stripe billing name differs from profile">
                    ⚠
                  </span>
                ) : (
                  <span className="text-gray-400" title="No Stripe billing name on file">
                    —
                  </span>
                )}
              </td>
              <td className="px-2 py-2 text-center text-xs">
                {r.invoicePatientMatchesOrder === false ? (
                  <span className="font-medium text-red-700" title="Invoice patient ≠ order patient">
                    ✗
                  </span>
                ) : (
                  <span className="text-emerald-700" title="Invoice patient matches order (or not checked)">
                    ✓
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
            <td className="px-3 py-3" colSpan={4}>
              Column totals ({rows.length} sales)
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{centsToDisplay(sum((x) => x.patientGrossCents))}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{centsToDisplay(sum((x) => x.medicationsCostCents))}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{centsToDisplay(sum((x) => x.shippingCents))}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{centsToDisplay(sum((x) => x.trtTelehealthCents))}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{centsToDisplay(sum((x) => x.pharmacyTotalCents))}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{centsToDisplay(sum((x) => x.doctorApprovalCents))}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right text-gray-600">
              {centsToDisplay(
                sum((x) => x.doctorRxFeeNominalCents ?? x.doctorApprovalCents),
              )}
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right text-amber-800">
              {centsToDisplay(sum((x) => x.doctorRxFeeWaivedCents ?? 0))}
            </td>
            <td className="px-3 py-3 text-gray-400">—</td>
            <td className="px-3 py-3 text-gray-400">—</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{centsToDisplay(sum((x) => x.fulfillmentFeesCents))}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{centsToDisplay(sum((x) => x.merchantProcessingCents))}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{centsToDisplay(sum((x) => x.platformCompensationCents))}</td>
            <td className="px-3 py-3 text-gray-400">—</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{centsToDisplay(sum(repCents))}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{centsToDisplay(sum(mgrCents))}</td>
            <td className="px-3 py-3 text-gray-400">—</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">{centsToDisplay(sum((x) => x.totalDeductionsCents))}</td>
            <td className="whitespace-nowrap px-3 py-3 text-right text-[#2d6b4f]">
              {centsToDisplay(sum((x) => x.clinicNetPayoutCents))}
            </td>
            <td className="px-3 py-3 text-center text-gray-400">—</td>
            <td className="px-3 py-3 text-center text-gray-400">—</td>
            <td className="px-3 py-3 text-center text-gray-400">—</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
