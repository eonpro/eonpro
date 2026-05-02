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
  ChevronDown,
  ChevronRight,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { OtMedicationPricingCatalog } from '@/components/invoices/OtMedicationPricingCatalog';
import { todayET } from '@/lib/utils/timezone';
import {
  OtAllocationEditor,
  type OtAllocationEditorPerSaleSeed,
} from '@/app/super-admin/ot-invoices/components/OtAllocationEditor';
import {
  OtNonRxAllocationEditor,
  type OtNonRxAllocationEditorSeed,
} from '@/app/super-admin/ot-invoices/components/OtNonRxAllocationEditor';
import type { OtAllocationOverridePayload } from '@/services/invoices/otAllocationOverrideTypes';
import {
  findOtPackageMatchByPatientGross,
  OT_PACKAGE_TIER_LABELS,
} from '@/lib/invoices/ot-package-catalog';

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
  /** Schedule rate before refill waiver ($30 async · $50 sync). */
  nominalFeeCents?: number;
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
  productDescription?: string | null;
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
  /** Server-derived: patient had a prior paid Rx within 30 days. Drives auto commission rate (1% rebill / 8% new). */
  isRebill?: boolean;
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
  /** Cumulative cents refunded against this payment (0 when none). */
  refundedAmountCents?: number;
  isFullyRefunded?: boolean;
  patientId: number;
  patientName: string;
  description: string | null;
  invoiceId: number | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
}

interface OtRefundLineItem {
  paymentId: number;
  paidAt: string | null;
  refundedAt: string | null;
  patientId: number;
  patientName: string;
  amountCents: number;
  refundedAmountCents: number;
  isFullyRefunded: boolean;
  description: string | null;
  invoiceId: number | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
}

type OtNonPharmacyChargeKind = 'bloodwork' | 'consult' | 'other';

interface OtNonRxChargeLineItem {
  invoiceDbId: number;
  patientId: number;
  patientName: string;
  paidAt: string | null;
  description: string;
  lineAmountCents: number;
  chargeKind: OtNonPharmacyChargeKind;
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
  /** Sum of `amountCents` (gross, before refund subtraction). Present after API deploy. */
  paymentsCollectedGrossCents?: number;
  /** Sum of `refundedAmountCents` across the period. Present after API deploy. */
  refundsTotalCents?: number;
  /** One row per refunded payment in the period. Present after API deploy. */
  refundLineItems?: OtRefundLineItem[];
  matchedPrescriptionInvoiceGrossCents?: number;
  feesUseCashCollectedBasis?: boolean;
  /** Payments whose invoice did not map to a loaded pharmacy line (subset for debugging). */
  paymentsWithoutPharmacyCogs?: OtPaymentCollectionRow[];
  /** Non-prescription Stripe invoice lines tied to those unmapped payments (e.g. bloodwork $180). */
  nonRxChargeLineItems?: OtNonRxChargeLineItem[];
  nonRxExplainedPaymentCount?: number;
  /**
   * Editable disposition rows for non-Rx charges (one per invoice or per
   * standalone payment). Empty when the API hasn't rolled out yet.
   */
  nonRxReconciliation?: OtNonRxReconciliationLine[];
}

interface OtNonRxReconciliationLine {
  dispositionKey: string;
  dispositionType: 'invoice' | 'payment';
  invoiceDbId: number | null;
  paymentId: number | null;
  chargeKind: OtNonPharmacyChargeKind;
  paidAt: string | null;
  patientId: number;
  patientName: string;
  productDescription: string;
  patientGrossCents: number;
  medicationsCostCents: number;
  shippingCents: number;
  trtTelehealthCents: number;
  pharmacyTotalCents: number;
  doctorApprovalCents: number;
  fulfillmentFeesCents: number;
  merchantProcessingCents: number;
  platformCompensationCents: number;
  salesRepCommissionCents: number;
  salesRepId: number | null;
  salesRepName: string | null;
  managerOverrideTotalCents: number;
  managerOverrideSummary: string | null;
  totalDeductionsCents: number;
  clinicNetPayoutCents: number;
  /** Patient had a prior paid Rx within 30 days. Drives auto commission rate (1% rebill / 8% new). */
  isRebill?: boolean;
}

type ActiveTab =
  | 'pharmacy'
  | 'all_payments'
  | 'refunds'
  | 'doctor_approvals'
  | 'fulfillment'
  | 'per_sale'
  | 'manual_reconciliation'
  | 'pricing_catalog';

function centsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Convert the page's `OtInvoiceData` into seeds the allocation editor needs.
 * Mirrors `buildDefaultOverridePayload` server-side — kept inline so the
 * editor doesn't have to round-trip through the server for the initial state.
 */
function buildAllocationSeedsFromData(data: OtInvoiceData): OtAllocationEditorPerSaleSeed[] {
  const sales = data.perSaleReconciliation ?? [];
  const pharmacyByOrderId = new Map<number, OtPharmacyLineItem[]>();
  for (const li of data.pharmacy.lineItems) {
    const arr = pharmacyByOrderId.get(li.orderId) ?? [];
    arr.push(li);
    pharmacyByOrderId.set(li.orderId, arr);
  }
  return sales.map((sale) => {
    /**
     * Tier-aware default: prefer matching the patient's gross to a known
     * OT package retail tier, then use that tier's pharmacy COST as the
     * pre-fill. Falls back to the per-SKU pharmacy line items when no match.
     * Mirrors buildDefaultOverridePayload server-side so the editor and the
     * server agree on initial state.
     */
    const tierMatch = findOtPackageMatchByPatientGross(
      sale.patientGrossCents,
      sale.productDescription
    );
    const meds = tierMatch
      ? [
          {
            medicationKey: null,
            name: tierMatch.pkg.name,
            strength: tierMatch.pkg.subtitle ?? '',
            vialSize: OT_PACKAGE_TIER_LABELS[tierMatch.tier],
            quantity: 1,
            unitPriceCents: tierMatch.quote.costCents,
            lineTotalCents: tierMatch.quote.costCents,
            source: 'catalog' as const,
            commissionRateBps: null,
          },
        ]
      : (pharmacyByOrderId.get(sale.orderId) ?? []).map((p) => ({
          medicationKey: p.medicationKey || null,
          name: p.medicationName,
          strength: p.strength,
          vialSize: p.vialSize,
          quantity: Math.max(1, p.quantity || 1),
          unitPriceCents: Math.max(0, p.unitPriceCents),
          lineTotalCents: Math.max(0, p.lineTotalCents),
          source: (p.pricingStatus === 'priced' ? 'catalog' : 'custom') as 'catalog' | 'custom',
          commissionRateBps: null,
        }));
    const isRebill = !!sale.isRebill;
    const defaultPayload: OtAllocationOverridePayload = {
      meds,
      shippingCents: tierMatch ? tierMatch.pkg.defaultShippingCents : sale.shippingCents,
      trtTelehealthCents: sale.trtTelehealthCents,
      doctorRxFeeCents: tierMatch ? tierMatch.pkg.defaultConsultCents : sale.doctorApprovalCents,
      fulfillmentFeesCents: sale.fulfillmentFeesCents,
      customLineItems: [],
      notes: null,
      patientGrossCents: sale.patientGrossCents,
      salesRepId: sale.salesRepId ?? null,
      salesRepName: sale.salesRepName ?? null,
      /**
       * Default to auto-rate (1% rebill / 8% new on gross-minus-COGS).
       * Admin can type a manual $ override per row if they need a different
       * value for this specific sale.
       */
      salesRepCommissionCentsOverride: null,
      /** Auto rate by saleType: 1% rebill / 8% new. */
      commissionRateBps: isRebill ? 100 : 800,
      /** Rx seeds always carry chargeKind=null; non-Rx seeds set their own. */
      chargeKind: null,
    };
    return {
      orderId: sale.orderId,
      invoiceDbId: sale.invoiceDbId,
      paidAt: sale.paidAt,
      patientName: sale.patientName,
      productDescription: sale.productDescription ?? null,
      /** Page already loads patient ids via per-sale; not strictly needed by editor but kept for future link-outs. */
      patientId: 0,
      isRebill,
      defaultPayload,
    };
  });
}

/**
 * Build seeds for the non-Rx editor from `data.nonRxReconciliation`. Mirrors
 * `buildOtNonRxReconciliation` shape on the server. Empty when the API hasn't
 * deployed the field yet.
 */
function buildNonRxSeedsFromData(data: OtInvoiceData): OtNonRxAllocationEditorSeed[] {
  const rows = data.nonRxReconciliation ?? [];
  return rows.map((r) => {
    const isRebill = !!r.isRebill;
    const defaultPayload: OtAllocationOverridePayload = {
      meds: [],
      shippingCents: r.shippingCents,
      trtTelehealthCents: r.trtTelehealthCents,
      doctorRxFeeCents: r.doctorApprovalCents,
      fulfillmentFeesCents: r.fulfillmentFeesCents,
      customLineItems: [],
      notes: null,
      patientGrossCents: r.patientGrossCents,
      salesRepId: r.salesRepId ?? null,
      salesRepName: r.salesRepName ?? null,
      /** Default to auto-rate; admin can type a manual $ override per row. */
      salesRepCommissionCentsOverride: null,
      commissionRateBps: isRebill ? 100 : 800,
      chargeKind: r.chargeKind,
    };
    return {
      dispositionKey: r.dispositionKey,
      dispositionType: r.dispositionType,
      invoiceId: r.invoiceDbId,
      paymentId: r.paymentId,
      chargeKind: r.chargeKind,
      paidAt: r.paidAt,
      patientName: r.patientName,
      productDescription: r.productDescription,
      isRebill,
      defaultPayload,
    };
  });
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

/**
 * Combined Rx + Non-Rx reconciliation panel — both editors stack into a
 * single tab because the branded PDF (`/api/super-admin/ot-overrides/export`)
 * already merges Rx and non-Rx rows into one document, so admins should
 * review and finalize them in one place. Each editor still owns its own
 * load / save / draft / finalize cycle against its own override table; the
 * Rx editor's "Download PDF" button produces the combined PDF.
 */
function ReconciliationCombined({
  startDate,
  endDate,
  useRange,
  rxSeeds,
  nonRxSeeds,
}: {
  startDate: string;
  endDate: string;
  useRange: boolean;
  rxSeeds: OtAllocationEditorPerSaleSeed[];
  nonRxSeeds: OtNonRxAllocationEditorSeed[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 pb-2">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Prescription sales (Rx)</h3>
            <p className="text-xs text-gray-500">
              {rxSeeds.length} {rxSeeds.length === 1 ? 'sale' : 'sales'} · per-sale allocation,
              packages, fees, and rep commission.
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
            {rxSeeds.length} Rx
          </span>
        </header>
        <OtAllocationEditor
          startDate={startDate}
          endDate={endDate}
          useRange={useRange}
          seeds={rxSeeds}
        />
      </section>

      <section>
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 pb-2">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Non-prescription dispositions
            </h3>
            <p className="text-xs text-gray-500">
              {nonRxSeeds.length} {nonRxSeeds.length === 1 ? 'row' : 'rows'} · bloodwork,
              consults, packages, balance-dues. Included in the same branded PDF.
            </p>
          </div>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900">
            {nonRxSeeds.length} non-Rx
          </span>
        </header>
        <OtNonRxAllocationEditor
          startDate={startDate}
          endDate={endDate}
          useRange={useRange}
          seeds={nonRxSeeds}
        />
      </section>
    </div>
  );
}

export default function OtInvoicesPage() {
  /** OT reconciliation windows are defined in US/Eastern (not UTC midnight / not the browser calendar). */
  const [startDate, setStartDate] = useState(() => todayET());
  const [endDate, setEndDate] = useState(() => todayET());
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
      | 'refunds'
      | 'combined'
      | 'summary',
    format: 'csv' | 'pdf'
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
        <p className="mt-1 text-sm text-gray-500">
          Reconciliation statement — cost and fee allocations for OT clinic payout.
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
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Generate
          </button>
        </div>
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
          active={activeTab === 'refunds'}
          onClick={() => setActiveTab('refunds')}
          icon={<RotateCcw className="h-4 w-4" />}
          label="Refunds"
          badge={data ? String(data.refundLineItems?.length ?? 0) : '—'}
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
          active={activeTab === 'manual_reconciliation'}
          onClick={() => setActiveTab('manual_reconciliation')}
          icon={<SlidersHorizontal className="h-4 w-4" />}
          label="Reconciliation"
          /**
           * Combined badge: Rx + non-Rx rows since both flow into the same
           * branded PDF (`applyOtAllocationOverrides` returns both, and
           * `/api/super-admin/ot-overrides/export` loads both override
           * tables). Format: "119 Rx + 125 non-Rx" so admins can see at a
           * glance how many rows of each kind exist in the period.
           */
          badge={
            data
              ? (data.nonRxReconciliation?.length ?? 0) > 0
                ? `${data.perSaleReconciliation?.length ?? 0} Rx + ${data.nonRxReconciliation?.length ?? 0} non-Rx`
                : String(data.perSaleReconciliation?.length ?? 0)
              : '—'
          }
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
          <h2 className="mb-1 text-lg font-semibold text-gray-900">
            OT.EONPRO.IO medication pricing
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            Official 1-month and quarterly options — select rows to copy quotes for reps and admins.
          </p>
          <OtMedicationPricingCatalog embedded />
        </div>
      )}

      {data && activeTab !== 'pricing_catalog' && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-3">
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
              subvalue={
                /**
                 * Show the disposition breakdown when we have non-Rx rows so admins
                 * can sanity-check why "All payments" doesn't match "Orders":
                 *   N Rx + M non-Rx + R refunds = total Payment rows
                 */
                (data.nonRxReconciliation?.length ?? 0) > 0
                  ? `${data.pharmacy.orderCount} Rx + ${data.nonRxReconciliation?.length ?? 0} non-Rx + ${data.refundLineItems?.length ?? 0} refunds`
                  : (data.refundsTotalCents ?? 0) > 0
                    ? `${centsToDisplay(data.paymentsCollectedGrossCents ?? 0)} gross − ${centsToDisplay(data.refundsTotalCents ?? 0)} refunds`
                    : `${data.paymentCollections?.length ?? 0} Payment rows · All payments tab`
              }
              bg="bg-teal-50"
            />
            <SummaryCard
              icon={<RotateCcw className="h-5 w-5 text-rose-700" />}
              label="Refunds"
              value={centsToDisplay(data.refundsTotalCents ?? 0)}
              subvalue={
                (data.refundLineItems?.length ?? 0) > 0
                  ? `${data.refundLineItems?.length} refunded payments · already netted out`
                  : 'No refunds in period'
              }
              bg="bg-rose-50"
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
                  data.pharmacy.missingPriceCount > 0 &&
                    `${data.pharmacy.missingPriceCount} unpriced qty`,
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
              subvalue={
                data.feesUseCashCollectedBasis
                  ? 'from cash collected (net)'
                  : 'from matched invoice gross'
              }
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
            {/**
             * "Export tab CSV" only applies to tabs that have a backing CSV generator.
             * Manual reconciliation has its own branded PDF download in the editor itself.
             */}
            {activeTab !== 'manual_reconciliation' && (
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
            )}
            <button
              type="button"
              onClick={() => handleExport('combined', 'csv')}
              disabled={exporting !== null}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting === `combined_csv` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Combined CSV (includes per-sale)
            </button>
            <button
              type="button"
              onClick={() => handleExport('per_sale', 'csv')}
              disabled={exporting !== null}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting === `per_sale_csv` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Per-sale CSV only
            </button>
            <button
              type="button"
              onClick={() => handleExport('summary', 'pdf')}
              disabled={exporting !== null}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting === `summary_pdf` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Summary PDF
            </button>
          </div>

          {activeTab === 'pharmacy' && (
            <div className="flex flex-col gap-8">
              <PharmacyTable
                invoice={data.pharmacy}
                doctorLineItems={data.doctorApprovals?.lineItems ?? []}
              />
              {(data.nonRxChargeLineItems?.length ?? 0) > 0 && (
                <NonRxChargesTable rows={data.nonRxChargeLineItems ?? []} />
              )}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-900">
                  Cash collected — every payment
                </h3>
                <PaymentCollectionsTable
                  rows={data.paymentCollections ?? []}
                  matchedRxGrossCents={data.matchedPrescriptionInvoiceGrossCents ?? 0}
                  feesUseCashCollectedBasis={data.feesUseCashCollectedBasis ?? false}
                  patientAdminLinks
                />
              </div>
            </div>
          )}
          {activeTab === 'all_payments' && (
            <PaymentCollectionsTable
              rows={data.paymentCollections ?? []}
              matchedRxGrossCents={data.matchedPrescriptionInvoiceGrossCents ?? 0}
              feesUseCashCollectedBasis={data.feesUseCashCollectedBasis ?? false}
            />
          )}
          {activeTab === 'refunds' && (
            <RefundsTable
              rows={data.refundLineItems ?? []}
              grossCents={data.paymentsCollectedGrossCents ?? 0}
              refundsTotalCents={data.refundsTotalCents ?? 0}
              netCents={data.paymentsCollectedNetCents ?? 0}
            />
          )}
          {activeTab === 'doctor_approvals' && <DoctorTable invoice={data.doctorApprovals} />}
          {activeTab === 'fulfillment' && <FulfillmentTable invoice={data.fulfillment} />}
          {activeTab === 'per_sale' && (
            <PerSaleReconciliationTable rows={data.perSaleReconciliation ?? []} />
          )}
          {activeTab === 'manual_reconciliation' && (
            <ReconciliationCombined
              startDate={startDate}
              endDate={endDate}
              useRange={useRange}
              rxSeeds={buildAllocationSeedsFromData(data)}
              nonRxSeeds={buildNonRxSeedsFromData(data)}
            />
          )}
        </>
      )}

      {!loading && !data && !error && activeTab !== 'pricing_catalog' && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <FileText className="mb-4 h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-500">Select a date and generate</p>
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
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1 overflow-visible">
          <p className="text-xs font-medium text-gray-500">{label}</p>
          <p className="break-words text-lg font-bold tabular-nums leading-snug text-gray-900">
            {value}
          </p>
          {subvalue ? (
            <p className="mt-0.5 text-xs leading-snug text-gray-500">{subvalue}</p>
          ) : null}
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

function nonRxKindLabel(kind: OtNonPharmacyChargeKind): string {
  if (kind === 'bloodwork') return 'Bloodwork / labs';
  if (kind === 'consult') return 'Consult / visit';
  return 'Other';
}

function NonRxChargesTable({ rows }: { rows: OtNonRxChargeLineItem[] }) {
  return (
    <div className="max-w-full overflow-x-auto rounded-2xl border border-indigo-100 bg-white shadow-sm">
      <p className="border-b border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm font-medium text-gray-700">
        Non-Rx charges
      </p>
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            <th className="px-4 py-3">Paid (ET)</th>
            <th className="px-4 py-3 font-mono">Invoice</th>
            <th className="px-4 py-3">Patient</th>
            <th className="px-4 py-3">Kind</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3 text-right">Line</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((r, idx) => (
            <tr key={`${r.invoiceDbId}-${idx}`} className="hover:bg-gray-50/80">
              <td className="whitespace-nowrap px-4 py-2 text-xs text-indigo-900">
                {r.paidAt ? formatDateTime(r.paidAt) : '—'}
              </td>
              <td className="px-4 py-2 font-mono text-xs">{r.invoiceDbId}</td>
              <td className="px-4 py-2 font-medium">
                <a
                  href={`/admin/patients/${r.patientId}`}
                  className="text-[#4fa77e] hover:underline"
                >
                  {r.patientName}
                </a>
              </td>
              <td className="px-4 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.chargeKind === 'bloodwork'
                      ? 'bg-rose-100 text-rose-900'
                      : r.chargeKind === 'consult'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {nonRxKindLabel(r.chargeKind)}
                </span>
              </td>
              <td className="max-w-md break-words px-4 py-2 text-gray-800">{r.description}</td>
              <td className="whitespace-nowrap px-4 py-2 text-right font-semibold text-gray-900">
                {centsToDisplay(r.lineAmountCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentCollectionsTable({
  rows,
  matchedRxGrossCents,
  feesUseCashCollectedBasis,
  patientAdminLinks = false,
}: {
  rows: OtPaymentCollectionRow[];
  matchedRxGrossCents: number;
  feesUseCashCollectedBasis: boolean;
  /** Plain admin hrefs (full navigation) for super-admin investigation. */
  patientAdminLinks?: boolean;
}) {
  const totalNet = rows.reduce((s, r) => s + r.netCollectedCents, 0);
  return (
    <div className="max-w-full overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <table className="w-full min-w-[1380px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            <th className="whitespace-nowrap px-4 py-3">Paid (ET)</th>
            <th className="whitespace-nowrap px-4 py-3">Recorded (ET)</th>
            <th className="whitespace-nowrap px-4 py-3 font-mono">Pay #</th>
            <th className="whitespace-nowrap px-4 py-3">Patient</th>
            <th className="whitespace-nowrap px-4 py-3 text-right">Amount</th>
            <th className="whitespace-nowrap px-4 py-3 text-right">Refunded</th>
            <th className="whitespace-nowrap px-4 py-3 text-right">Net</th>
            <th className="whitespace-nowrap px-4 py-3 font-mono">Invoice</th>
            <th className="whitespace-nowrap px-4 py-3 font-mono">Stripe PI</th>
            <th className="whitespace-nowrap px-4 py-3">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={10} className="px-4 py-10 text-center text-gray-500">
                No payments found for this period.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.paymentId} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-2 text-xs text-emerald-700">
                  {r.paidAt ? formatDateTime(r.paidAt) : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-600">
                  {formatDateTime(r.recordedAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.paymentId}</td>
                <td
                  className="max-w-[200px] truncate whitespace-nowrap px-4 py-2 font-medium"
                  title={r.patientName}
                >
                  {patientAdminLinks ? (
                    <a
                      href={`/admin/patients/${r.patientId}`}
                      className="text-[#4fa77e] hover:underline"
                    >
                      {r.patientName}
                    </a>
                  ) : (
                    r.patientName
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                  {centsToDisplay(r.amountCents)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                  {(r.refundedAmountCents ?? 0) > 0 ? (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                        r.isFullyRefunded
                          ? 'bg-rose-100 text-rose-900'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      −{centsToDisplay(r.refundedAmountCents ?? 0)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums">
                  {centsToDisplay(r.netCollectedCents)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-gray-500">
                  {r.invoiceId ?? '—'}
                </td>
                <td
                  className="whitespace-nowrap px-4 py-2 font-mono text-xs text-violet-800"
                  title={r.stripePaymentIntentId ?? ''}
                >
                  {r.stripePaymentIntentId ?? '—'}
                </td>
                <td
                  className="max-w-[420px] truncate px-4 py-2 text-gray-700"
                  title={r.description ?? ''}
                >
                  {r.description ?? '—'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {rows.length > 0 && (
        <div className="sticky bottom-0 left-0 flex justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 font-semibold tabular-nums">
          <span>Net collected ({rows.length} payments)</span>
          <span>{centsToDisplay(totalNet)}</span>
        </div>
      )}
    </div>
  );
}

function RefundsTable({
  rows,
  grossCents,
  refundsTotalCents,
  netCents,
}: {
  rows: OtRefundLineItem[];
  grossCents: number;
  refundsTotalCents: number;
  netCents: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <RefundsHeaderTile
          label="Gross collected"
          value={centsToDisplay(grossCents)}
          tone="neutral"
        />
        <RefundsHeaderTile
          label={`Refunds (${rows.length})`}
          value={`−${centsToDisplay(refundsTotalCents)}`}
          tone="negative"
        />
        <RefundsHeaderTile
          label="Cash collected (net)"
          value={centsToDisplay(netCents)}
          tone="positive"
        />
      </div>
      <p className="text-xs text-gray-500">
        Refunds are subtracted from gross to produce{' '}
        <span className="font-semibold">Cash collected (net)</span>, which feeds the 4% merchant and
        10% EONPro fees and the OT clinic payout.
      </p>
      <div className="max-w-full overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full min-w-[1280px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="whitespace-nowrap px-4 py-3">Refunded (ET)</th>
              <th className="whitespace-nowrap px-4 py-3">Originally paid (ET)</th>
              <th className="whitespace-nowrap px-4 py-3 font-mono">Pay #</th>
              <th className="whitespace-nowrap px-4 py-3">Patient</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Original</th>
              <th className="whitespace-nowrap px-4 py-3 text-right">Refunded</th>
              <th className="whitespace-nowrap px-4 py-3">Type</th>
              <th className="whitespace-nowrap px-4 py-3 font-mono">Invoice</th>
              <th className="whitespace-nowrap px-4 py-3 font-mono">Stripe PI</th>
              <th className="whitespace-nowrap px-4 py-3">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-gray-500">
                  No refunds in this period.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.paymentId} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-rose-700">
                    {r.refundedAt ? formatDateTime(r.refundedAt) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-600">
                    {r.paidAt ? formatDateTime(r.paidAt) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.paymentId}</td>
                  <td
                    className="max-w-[200px] truncate whitespace-nowrap px-4 py-2 font-medium"
                    title={r.patientName}
                  >
                    <a
                      href={`/admin/patients/${r.patientId}`}
                      className="text-[#4fa77e] hover:underline"
                    >
                      {r.patientName}
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-gray-600">
                    {centsToDisplay(r.amountCents)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums text-rose-700">
                    −{centsToDisplay(r.refundedAmountCents)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.isFullyRefunded
                          ? 'bg-rose-100 text-rose-900'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {r.isFullyRefunded ? 'Full' : 'Partial'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-gray-500">
                    {r.invoiceId ?? '—'}
                  </td>
                  <td
                    className="whitespace-nowrap px-4 py-2 font-mono text-xs text-violet-800"
                    title={r.stripePaymentIntentId ?? ''}
                  >
                    {r.stripePaymentIntentId ?? '—'}
                  </td>
                  <td
                    className="max-w-[420px] truncate px-4 py-2 text-gray-700"
                    title={r.description ?? ''}
                  >
                    {r.description ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {rows.length > 0 && (
          <div className="sticky bottom-0 left-0 flex justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 font-semibold tabular-nums text-rose-700">
            <span>
              Refunds total ({rows.length} {rows.length === 1 ? 'payment' : 'payments'})
            </span>
            <span>−{centsToDisplay(refundsTotalCents)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RefundsHeaderTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'negative' | 'positive';
}) {
  const valueColor =
    tone === 'negative'
      ? 'text-rose-700'
      : tone === 'positive'
        ? 'text-[#4fa77e]'
        : 'text-gray-900';
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}

function groupPharmacyMedsByOrderId(items: OtPharmacyLineItem[]): OtPharmacyLineItem[][] {
  const byId = new Map<number, OtPharmacyLineItem[]>();
  const order: number[] = [];
  for (const li of items) {
    let g = byId.get(li.orderId);
    if (!g) {
      g = [];
      byId.set(li.orderId, g);
      order.push(li.orderId);
    }
    g.push(li);
  }
  return order.map((id) => byId.get(id)!);
}

const PHARMACY_FALLBACK_ASYNC_DOCTOR_CENTS = 3000;
const PHARMACY_FALLBACK_SYNC_DOCTOR_CENTS = 5000;

function doctorNominalFeeCents(doc: OtDoctorApprovalLineItem): number {
  if (typeof doc.nominalFeeCents === 'number') return doc.nominalFeeCents;
  return doc.approvalMode === 'sync'
    ? PHARMACY_FALLBACK_SYNC_DOCTOR_CENTS
    : PHARMACY_FALLBACK_ASYNC_DOCTOR_CENTS;
}

function PharmacyTable({
  invoice,
  doctorLineItems = [],
}: {
  invoice: OtPharmacyInvoice;
  doctorLineItems?: OtDoctorApprovalLineItem[];
}) {
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<number>>(new Set());

  const toggleOrderExpanded = useCallback((orderId: number) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  const shippingByOrder = new Map(invoice.shippingLineItems.map((s) => [s.orderId, s]));
  const trtByOrder = new Map(invoice.trtTelehealthLineItems.map((s) => [s.orderId, s]));
  const prescFeeByOrder = new Map(invoice.prescriptionFeeLineItems.map((s) => [s.orderId, s]));
  const doctorByOrder = new Map(doctorLineItems.map((d) => [d.orderId, d]));

  const medGroups = groupPharmacyMedsByOrderId(invoice.lineItems);
  const medOrderIds = new Set(invoice.lineItems.map((li) => li.orderId));
  const feeOnlyOrderIds = [
    ...new Set([
      ...invoice.shippingLineItems.map((s) => s.orderId),
      ...invoice.trtTelehealthLineItems.map((s) => s.orderId),
      ...invoice.prescriptionFeeLineItems.map((s) => s.orderId),
      ...doctorLineItems.map((d) => d.orderId),
    ]),
  ].filter((id) => !medOrderIds.has(id));

  const medOrderIdList = medGroups.map((lines) => lines[0].orderId);
  const allOrderIds = [...new Set([...medOrderIdList, ...feeOnlyOrderIds])];

  function feeContext(orderId: number): {
    paidAt: string | null;
    patientId: number | null;
    patientName: string;
    lifefileOrderId: string | null;
  } {
    const firstMed = invoice.lineItems.find((li) => li.orderId === orderId);
    if (firstMed) {
      return {
        paidAt: firstMed.paidAt,
        patientId: firstMed.patientId,
        patientName: firstMed.patientName,
        lifefileOrderId: firstMed.lifefileOrderId,
      };
    }
    const doc = doctorByOrder.get(orderId);
    if (doc) {
      return {
        paidAt: doc.paidAt,
        patientId: doc.patientId,
        patientName: doc.patientName,
        lifefileOrderId: doc.lifefileOrderId,
      };
    }
    const ship =
      shippingByOrder.get(orderId) ?? trtByOrder.get(orderId) ?? prescFeeByOrder.get(orderId);
    if (ship) {
      return {
        paidAt: ship.paidAt,
        patientId: null,
        patientName: ship.patientName,
        lifefileOrderId: ship.lifefileOrderId,
      };
    }
    return { paidAt: null, patientId: null, patientName: '—', lifefileOrderId: null };
  }

  function bundleTotalForOrder(orderId: number): number {
    const meds = invoice.lineItems.filter((li) => li.orderId === orderId);
    const ship = shippingByOrder.get(orderId);
    const presc = prescFeeByOrder.get(orderId);
    const doc = doctorByOrder.get(orderId);
    const trt = trtByOrder.get(orderId);
    let sum = meds.reduce((s, li) => s + li.lineTotalCents, 0);
    if (ship) sum += ship.feeCents;
    if (presc) sum += presc.feeCents;
    if (doc) sum += doc.feeCents;
    if (trt) sum += trt.feeCents;
    return sum;
  }

  function summaryBreakdownLabel(orderId: number): string {
    const meds = invoice.lineItems.filter((li) => li.orderId === orderId);
    const parts: string[] = [];
    if (meds.length) parts.push(`${meds.length} Rx ${meds.length === 1 ? 'line' : 'lines'}`);
    if (shippingByOrder.has(orderId)) parts.push('shipping');
    if (prescFeeByOrder.has(orderId)) parts.push('dispensing fee');
    if (doctorByOrder.has(orderId)) parts.push('doctor / Rx');
    if (trtByOrder.has(orderId)) parts.push('TRT');
    return parts.length ? parts.join(' · ') : 'Fees only';
  }

  function renderDoctorPricedCell(doc: OtDoctorApprovalLineItem) {
    const nominal = doctorNominalFeeCents(doc);
    const showScheduleWaived = doc.feeCents === 0 && nominal > 0;
    return (
      <td className="max-w-[min(280px,40vw)] px-4 py-2 text-xs text-sky-900">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            doc.approvalMode === 'async'
              ? 'bg-sky-200/80 text-sky-900'
              : 'bg-violet-200/80 text-violet-900'
          }`}
        >
          {doc.approvalMode}
        </span>
        {showScheduleWaived ? (
          <span className="mt-1 block break-words text-[11px] leading-snug text-sky-800/90">
            Schedule {centsToDisplay(nominal)} · waived
            {doc.doctorFeeWaivedReason ? <> — {doc.doctorFeeWaivedReason}</> : null}
          </span>
        ) : doc.doctorFeeWaivedReason ? (
          <span className="mt-1 block break-words text-[11px] leading-snug text-sky-800/90">
            {doc.doctorFeeWaivedReason}
          </span>
        ) : null}
      </td>
    );
  }

  return (
    <div className="max-w-full overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <table className="w-full min-w-[1280px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
            <th className="w-10 px-2 py-3" aria-label="Expand row" />
            <th className="px-4 py-3">Paid (ET)</th>
            <th className="px-4 py-3">Order</th>
            <th className="px-4 py-3">Patient</th>
            <th className="px-4 py-3">LF Order</th>
            <th className="px-4 py-3">Medication / fee</th>
            <th className="px-4 py-3">Strength</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Unit</th>
            <th className="px-4 py-3 text-right">Line</th>
            <th className="px-4 py-3">Priced</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {allOrderIds.map((orderId) => {
            const ctx = feeContext(orderId);
            const expanded = expandedOrderIds.has(orderId);
            const medLines = invoice.lineItems.filter((li) => li.orderId === orderId);
            const ship = shippingByOrder.get(orderId);
            const presc = prescFeeByOrder.get(orderId);
            const doc = doctorByOrder.get(orderId);
            const trt = trtByOrder.get(orderId);
            const bundleTotal = bundleTotalForOrder(orderId);

            return (
              <React.Fragment key={`order-${orderId}`}>
                <tr className="bg-slate-50/90 hover:bg-slate-100/90">
                  <td className="px-2 py-2 align-middle">
                    <button
                      type="button"
                      onClick={() => toggleOrderExpanded(orderId)}
                      className="rounded-lg p-1 text-gray-600 hover:bg-white hover:text-[#4fa77e]"
                      aria-expanded={expanded}
                      title={expanded ? 'Collapse breakdown' : 'Expand breakdown'}
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs font-medium text-emerald-700">
                    {ctx.paidAt ? formatDateTime(ctx.paidAt) : '—'}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs font-medium">{orderId}</td>
                  <td className="px-4 py-2 font-medium">
                    {ctx.patientId != null ? (
                      <a
                        href={`/admin/patients/${ctx.patientId}`}
                        className="text-[#4fa77e] hover:underline"
                      >
                        {ctx.patientName}
                      </a>
                    ) : (
                      ctx.patientName
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    {ctx.lifefileOrderId ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-800">
                    <span className="font-medium">Order total</span>
                    <span className="mt-0.5 block text-xs font-normal text-gray-500">
                      {summaryBreakdownLabel(orderId)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-400">—</td>
                  <td className="px-4 py-2 text-right text-gray-400">—</td>
                  <td className="px-4 py-2 text-right text-gray-400">—</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-900">
                    {centsToDisplay(bundleTotal)}
                  </td>
                  <td className="px-4 py-2 text-gray-400">—</td>
                </tr>
                {expanded ? (
                  <>
                    {medLines.map((li, idx) => (
                      <tr key={`${orderId}-med-${idx}`} className="bg-white hover:bg-gray-50/80">
                        <td className="bg-gray-50/50" />
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-emerald-700">
                          {li.paidAt ? formatDateTime(li.paidAt) : '—'}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-400">{li.orderId}</td>
                        <td className="px-4 py-2 font-medium">
                          <a
                            href={`/admin/patients/${li.patientId}`}
                            className="text-[#4fa77e] hover:underline"
                          >
                            {li.patientName}
                          </a>
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-400">
                          {li.lifefileOrderId ?? '—'}
                        </td>
                        <td className="border-l-2 border-[#4fa77e]/25 py-2 pl-3 pr-4">
                          {li.medicationName}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{li.strength}</td>
                        <td className="px-4 py-2 text-right">{li.quantity}</td>
                        <td className="px-4 py-2 text-right">
                          {centsToDisplay(li.unitPriceCents)}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold">
                          {centsToDisplay(li.lineTotalCents)}
                        </td>
                        <td className="px-4 py-2">
                          {li.pricingStatus === 'missing' ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                              missing
                            </span>
                          ) : li.pricingStatus === 'estimated' ? (
                            <span
                              className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-900"
                              title="COGS from medication name — add Lifefile id to catalog when known"
                            >
                              est.
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                              priced
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {ship ? (
                      <tr key={`${orderId}-ship`} className="bg-amber-50/50 hover:bg-amber-50/80">
                        <td className="bg-gray-50/50" />
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-emerald-700">
                          {ctx.paidAt ? formatDateTime(ctx.paidAt) : '—'}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-400">{orderId}</td>
                        <td className="px-4 py-2 text-gray-500">—</td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-300">—</td>
                        <td className="border-l-2 border-amber-300/80 py-2 pl-3 pr-4 text-amber-950">
                          {ship.description}
                        </td>
                        <td className="px-4 py-2 text-gray-400">—</td>
                        <td className="px-4 py-2 text-right text-gray-400">—</td>
                        <td className="px-4 py-2 text-right text-gray-400">—</td>
                        <td className="px-4 py-2 text-right font-semibold text-amber-950">
                          {centsToDisplay(ship.feeCents)}
                        </td>
                        <td className="px-4 py-2">
                          <span className="rounded-full bg-amber-200/80 px-2 py-0.5 text-xs text-amber-950">
                            shipping
                          </span>
                        </td>
                      </tr>
                    ) : null}
                    {presc ? (
                      <tr key={`${orderId}-presc`} className="bg-slate-50/80 hover:bg-slate-50">
                        <td className="bg-gray-50/50" />
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-emerald-700">
                          {ctx.paidAt ? formatDateTime(ctx.paidAt) : '—'}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-400">{orderId}</td>
                        <td className="px-4 py-2 text-gray-500">—</td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-300">—</td>
                        <td className="border-l-2 border-slate-300 py-2 pl-3 pr-4 text-slate-800">
                          {presc.description}
                        </td>
                        <td className="px-4 py-2 text-gray-400">—</td>
                        <td className="px-4 py-2 text-right text-gray-400">—</td>
                        <td className="px-4 py-2 text-right text-gray-400">—</td>
                        <td className="px-4 py-2 text-right font-semibold text-slate-900">
                          {centsToDisplay(presc.feeCents)}
                        </td>
                        <td className="px-4 py-2">
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-800">
                            rx fee
                          </span>
                        </td>
                      </tr>
                    ) : null}
                    {doc ? (
                      <tr key={`${orderId}-doc`} className="bg-sky-50/40 hover:bg-sky-50/70">
                        <td className="bg-gray-50/50" />
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-emerald-700">
                          {doc.paidAt ? formatDateTime(doc.paidAt) : '—'}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-400">{orderId}</td>
                        <td className="px-4 py-2 text-gray-500">—</td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-300">—</td>
                        <td className="max-w-xs border-l-2 border-sky-300/70 py-2 pl-3 pr-4 text-sky-950">
                          Doctor / Rx fee ({doc.approvalMode}) — {doc.medications}
                        </td>
                        <td className="px-4 py-2 text-gray-400">—</td>
                        <td className="px-4 py-2 text-right text-gray-400">—</td>
                        <td className="px-4 py-2 text-right text-gray-400">—</td>
                        <td className="px-4 py-2 text-right font-semibold text-sky-950">
                          {centsToDisplay(doc.feeCents)}
                        </td>
                        {renderDoctorPricedCell(doc)}
                      </tr>
                    ) : null}
                    {trt ? (
                      <tr key={`${orderId}-trt`} className="bg-violet-50/40 hover:bg-violet-50/70">
                        <td className="bg-gray-50/50" />
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-emerald-700">
                          {ctx.paidAt ? formatDateTime(ctx.paidAt) : '—'}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-400">{orderId}</td>
                        <td className="px-4 py-2 text-gray-500">—</td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-300">—</td>
                        <td className="border-l-2 border-violet-300/70 py-2 pl-3 pr-4 text-violet-950">
                          {trt.description}
                        </td>
                        <td className="px-4 py-2 text-gray-400">—</td>
                        <td className="px-4 py-2 text-right text-gray-400">—</td>
                        <td className="px-4 py-2 text-right text-gray-400">—</td>
                        <td className="px-4 py-2 text-right font-semibold text-violet-950">
                          {centsToDisplay(trt.feeCents)}
                        </td>
                        <td className="px-4 py-2">
                          <span className="rounded-full bg-violet-200/80 px-2 py-0.5 text-xs text-violet-950">
                            TRT visit
                          </span>
                        </td>
                      </tr>
                    ) : null}
                  </>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="sticky bottom-0 left-0 flex justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 font-semibold tabular-nums">
        <span>Pharmacy total</span>
        <span>{centsToDisplay(invoice.totalCents)}</span>
      </div>
    </div>
  );
}

function DoctorTable({ invoice }: { invoice: OtDoctorApprovalsInvoice }) {
  return (
    <div className="max-w-full overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <table className="w-full min-w-[1100px] text-sm">
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
                    li.approvalMode === 'async'
                      ? 'bg-sky-100 text-sky-800'
                      : 'bg-violet-100 text-violet-800'
                  }`}
                >
                  {li.approvalMode}
                </span>
              </td>
              <td className="px-4 py-2 text-right align-top">
                <span className="font-semibold">{centsToDisplay(li.feeCents)}</span>
                {li.feeCents === 0 && doctorNominalFeeCents(li) > 0 ? (
                  <span className="mt-1 block text-left text-[11px] font-normal leading-snug text-gray-600">
                    Schedule {centsToDisplay(doctorNominalFeeCents(li))} · waived
                  </span>
                ) : null}
              </td>
              <td className="max-w-[min(320px,45vw)] break-words px-4 py-2 text-xs leading-snug text-gray-600">
                {li.doctorFeeWaivedReason ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sticky bottom-0 left-0 flex justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 font-semibold tabular-nums">
        <span>Approvals total</span>
        <span>{centsToDisplay(invoice.totalCents)}</span>
      </div>
    </div>
  );
}

function FulfillmentTable({ invoice }: { invoice: OtFulfillmentInvoice }) {
  return (
    <div className="max-w-full overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <table className="w-full min-w-[1100px] text-sm">
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
                No fulfillment line items in this period.
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
                <td className="px-4 py-2 text-right">
                  {centsToDisplay(li.patientLineAmountCents)}
                </td>
                <td className="px-4 py-2 text-right font-semibold">
                  {centsToDisplay(li.feeCents)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="sticky bottom-0 left-0 flex justify-between border-t border-gray-200 bg-gray-50 px-4 py-3 font-semibold tabular-nums">
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
    <div className="max-w-full overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
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
              <td className="whitespace-nowrap px-3 py-2 text-right">
                {centsToDisplay(r.patientGrossCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-gray-700">
                {centsToDisplay(r.medicationsCostCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                {centsToDisplay(r.shippingCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                {centsToDisplay(r.trtTelehealthCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                {centsToDisplay(r.pharmacyTotalCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                {centsToDisplay(r.doctorApprovalCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-gray-600">
                {centsToDisplay(r.doctorRxFeeNominalCents ?? r.doctorApprovalCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-amber-800">
                {centsToDisplay(r.doctorRxFeeWaivedCents ?? 0)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-gray-600">
                {r.doctorRxFeeDaysSincePrior != null ? r.doctorRxFeeDaysSincePrior : '—'}
              </td>
              <td
                className="max-w-[200px] truncate px-3 py-2 text-xs text-gray-600"
                title={r.doctorRxFeeNote ?? ''}
              >
                {r.doctorRxFeeNote ?? '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right">
                {centsToDisplay(r.fulfillmentFeesCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-slate-600">
                {centsToDisplay(r.merchantProcessingCents)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-rose-700">
                {centsToDisplay(r.platformCompensationCents)}
              </td>
              <td
                className="max-w-[120px] truncate px-3 py-2 text-xs text-gray-700"
                title={r.salesRepName ?? ''}
              >
                {r.salesRepName ?? '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-cyan-800">
                {centsToDisplay(repCents(r))}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-orange-800">
                {centsToDisplay(mgrCents(r))}
              </td>
              <td
                className="max-w-[180px] truncate px-3 py-2 text-xs text-gray-600"
                title={r.managerOverrideSummary ?? ''}
              >
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
                  <span
                    className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-900"
                    title="Gross from Payment rows"
                  >
                    txn
                  </span>
                ) : r.patientGrossSource === 'invoice_sync' ? (
                  <span
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700"
                    title="Gross from Invoice (Stripe sync)"
                  >
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
                  <span
                    className="font-medium text-amber-800"
                    title="Stripe billing name differs from profile"
                  >
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
                  <span
                    className="font-medium text-red-700"
                    title="Invoice patient ≠ order patient"
                  >
                    ✗
                  </span>
                ) : (
                  <span
                    className="text-emerald-700"
                    title="Invoice patient matches order (or not checked)"
                  >
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
            <td className="whitespace-nowrap px-3 py-3 text-right">
              {centsToDisplay(sum((x) => x.patientGrossCents))}
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right">
              {centsToDisplay(sum((x) => x.medicationsCostCents))}
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right">
              {centsToDisplay(sum((x) => x.shippingCents))}
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right">
              {centsToDisplay(sum((x) => x.trtTelehealthCents))}
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right">
              {centsToDisplay(sum((x) => x.pharmacyTotalCents))}
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right">
              {centsToDisplay(sum((x) => x.doctorApprovalCents))}
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right text-gray-600">
              {centsToDisplay(sum((x) => x.doctorRxFeeNominalCents ?? x.doctorApprovalCents))}
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right text-amber-800">
              {centsToDisplay(sum((x) => x.doctorRxFeeWaivedCents ?? 0))}
            </td>
            <td className="px-3 py-3 text-gray-400">—</td>
            <td className="px-3 py-3 text-gray-400">—</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">
              {centsToDisplay(sum((x) => x.fulfillmentFeesCents))}
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right">
              {centsToDisplay(sum((x) => x.merchantProcessingCents))}
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right">
              {centsToDisplay(sum((x) => x.platformCompensationCents))}
            </td>
            <td className="px-3 py-3 text-gray-400">—</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">
              {centsToDisplay(sum(repCents))}
            </td>
            <td className="whitespace-nowrap px-3 py-3 text-right">
              {centsToDisplay(sum(mgrCents))}
            </td>
            <td className="px-3 py-3 text-gray-400">—</td>
            <td className="whitespace-nowrap px-3 py-3 text-right">
              {centsToDisplay(sum((x) => x.totalDeductionsCents))}
            </td>
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
