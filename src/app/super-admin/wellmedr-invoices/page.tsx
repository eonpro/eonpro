'use client';

import { instantToCalendarDate } from '@/lib/utils/platform-calendar';
import React, { useState, useCallback, useMemo } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Pill,
  Receipt,
  DollarSign,
  Package,
  Truck,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Users,
  Layers,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// ============================================================================
// Types
// ============================================================================

interface PharmacyLineItem {
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
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

interface ShippingLineItem {
  orderId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  description: string;
  feeCents: number;
}

interface AddonLineItem {
  orderId: number;
  lifefileOrderId: string | null;
  orderDate: string;
  paidAt: string | null;
  patientName: string;
  patientId: number;
  addonKey: string;
  addonName: string;
  feeCents: number;
}

interface PharmacyInvoice {
  invoiceType: 'pharmacy';
  clinicName: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: PharmacyLineItem[];
  shippingLineItems: ShippingLineItem[];
  addonLineItems?: AddonLineItem[];
  subtotalMedicationsCents: number;
  subtotalShippingCents: number;
  subtotalAddonsCents?: number;
  totalCents: number;
  orderCount: number;
  vialCount: number;
}

interface PrescriptionServiceLineItem {
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
  chargeType: 'new' | 'refill' | 'cancelled';
}

interface PrescriptionServicesInvoice {
  invoiceType: 'prescription_services';
  clinicName: string;
  invoiceDate: string;
  periodStart: string;
  periodEnd: string;
  lineItems: PrescriptionServiceLineItem[];
  feePerPrescriptionCents: number;
  newFeeCents: number;
  refillFeeCents: number;
  newPrescriptionCount: number;
  refillPrescriptionCount: number;
  cancelledPrescriptionCount: number;
  totalPrescriptions: number;
  totalCents: number;
}

interface InvoiceData {
  pharmacy: PharmacyInvoice;
  prescriptionServices: PrescriptionServicesInvoice;
}

type ActiveTab = 'pharmacy' | 'prescription_services';

// ============================================================================
// Helpers
// ============================================================================

function centsToDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Rounds to nearest cent for display (averages may be fractional). */
function roundedCentsToDisplay(cents: number): string {
  return centsToDisplay(Math.round(cents));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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

function getTodayISO(): string {
  const now = new Date();
  return instantToCalendarDate(now);
}

// ============================================================================
// Page Component
// ============================================================================

export default function WellmedrInvoicesPage() {
  const [startDate, setStartDate] = useState(getTodayISO());
  const [endDate, setEndDate] = useState(getTodayISO());
  const [useRange, setUseRange] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InvoiceData | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('pharmacy');
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const params = new URLSearchParams({ date: startDate });
      if (useRange && endDate !== startDate) {
        params.set('endDate', endDate);
      }

      const res = await apiFetch(`/api/super-admin/wellmedr-invoices?${params}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || `Failed (${res.status})`);
      }
      const json: InvoiceData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invoices');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, useRange]);

  const handleExport = async (invoiceType: ActiveTab, format: 'csv' | 'pdf') => {
    const key = `${invoiceType}_${format}`;
    setExporting(key);

    try {
      const body: Record<string, string> = { date: startDate, format, invoiceType };
      if (useRange && endDate !== startDate) {
        body.endDate = endDate;
      }

      const response = await fetch('/api/super-admin/wellmedr-invoices/export', {
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
      a.download = filenameMatch?.[1] || `wellmedr-${invoiceType}-${startDate}.${format}`;
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

  const pharmacy = data?.pharmacy;
  const rxServices = data?.prescriptionServices;

  const productBreakdown = useMemo(() => {
    if (!pharmacy) return null;

    const medBuckets = new Map<string, number>();
    for (const li of pharmacy.lineItems) {
      const raw = li.medicationName.trim();
      const family = (raw.split('/')[0] ?? raw).trim() || raw || 'Other';
      medBuckets.set(family, (medBuckets.get(family) ?? 0) + li.quantity);
    }

    const addonBuckets = new Map<string, number>();
    for (const al of pharmacy.addonLineItems ?? []) {
      addonBuckets.set(al.addonName, (addonBuckets.get(al.addonName) ?? 0) + 1);
    }

    const entries: { name: string; count: number; kind: 'med' | 'addon' }[] = [];
    for (const [name, count] of medBuckets) {
      entries.push({ name, count, kind: 'med' });
    }
    for (const [name, count] of addonBuckets) {
      entries.push({ name, count, kind: 'addon' });
    }
    entries.sort((a, b) => b.count - a.count);
    return entries;
  }, [pharmacy]);

  const insights = useMemo(() => {
    if (!pharmacy || !rxServices) return null;

    const patientIds = new Set<number>();
    for (const li of pharmacy.lineItems) patientIds.add(li.patientId);
    for (const li of rxServices.lineItems) patientIds.add(li.patientId);
    const uniquePatients = patientIds.size;

    const combinedCents = pharmacy.totalCents + rxServices.totalCents;
    const orderCount = pharmacy.orderCount;

    const avgPerPatientCents = uniquePatients > 0 ? combinedCents / uniquePatients : null;
    const avgPerOrderCents = orderCount > 0 ? combinedCents / orderCount : null;

    const medBuckets = new Map<string, number>();
    for (const li of pharmacy.lineItems) {
      const raw = li.medicationName.trim();
      const family = (raw.split('/')[0] ?? raw).trim() || raw || 'Other';
      medBuckets.set(family, (medBuckets.get(family) ?? 0) + li.quantity);
    }
    let topMedication = '';
    let topMedVials = 0;
    for (const [name, qty] of medBuckets) {
      if (qty > topMedVials) {
        topMedication = name;
        topMedVials = qty;
      }
    }
    const vialsDen = pharmacy.vialCount > 0 ? pharmacy.vialCount : topMedVials;
    const topMedSharePct =
      topMedication && vialsDen > 0 ? Math.round((topMedVials / vialsDen) * 100) : null;

    const rxNew = rxServices.newPrescriptionCount;
    const rxRefill = rxServices.refillPrescriptionCount;
    const rxTotal = rxServices.totalPrescriptions || rxNew + rxRefill;
    const newRxSharePct = rxTotal > 0 ? Math.round((rxNew / rxTotal) * 100) : null;

    return {
      uniquePatients,
      combinedCents,
      avgPerPatientCents,
      avgPerOrderCents,
      topMedication,
      topMedSharePct,
      rxNew,
      rxRefill,
      rxTotal,
      newRxSharePct,
    };
  }, [pharmacy, rxServices]);

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">WellMedR Invoices</h1>
        <p className="mt-1 text-gray-500">
          Generate daily pharmacy product and prescription service invoices for WellMedR
        </p>
      </div>

      {/* Date Selection */}
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
            onClick={fetchInvoices}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-[#4fa77e] px-5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#3d8a65] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Generate Invoices
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      {data && (
        <>
          {/* Summary Cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <SummaryCard
              icon={<Package className="h-5 w-5 text-blue-600" />}
              label="Total Orders"
              value={String(pharmacy?.orderCount ?? 0)}
              bg="bg-blue-50"
            />
            <SummaryCard
              icon={<Pill className="h-5 w-5 text-purple-600" />}
              label="Total Vials"
              value={String(pharmacy?.vialCount ?? 0)}
              bg="bg-purple-50"
            />
            <SummaryCard
              icon={<DollarSign className="h-5 w-5 text-emerald-600" />}
              label="Pharmacy Total"
              value={centsToDisplay(pharmacy?.totalCents ?? 0)}
              bg="bg-emerald-50"
            />
            <SummaryCard
              icon={<Receipt className="h-5 w-5 text-amber-600" />}
              label="Rx Services Total"
              value={centsToDisplay(rxServices?.totalCents ?? 0)}
              bg="bg-amber-50"
            />
            <SummaryCard
              icon={<DollarSign className="h-5 w-5 text-red-600" />}
              label="Combined Total"
              value={centsToDisplay((pharmacy?.totalCents ?? 0) + (rxServices?.totalCents ?? 0))}
              bg="bg-red-50"
            />
          </div>

          {productBreakdown && productBreakdown.length > 0 && (
            <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#4fa77e]/20 to-emerald-100">
                  <BarChart3 className="h-4 w-4 text-[#4fa77e]" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Product Breakdown</h3>
                <span className="ml-auto text-xs text-gray-400">
                  {productBreakdown.reduce((s, e) => s + e.count, 0)} total items
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {productBreakdown.map((entry) => (
                  <div
                    key={entry.name}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                      entry.kind === 'addon'
                        ? 'border-violet-200 bg-violet-50'
                        : 'border-emerald-200 bg-emerald-50'
                    }`}
                  >
                    <span
                      className={`text-sm font-medium ${
                        entry.kind === 'addon' ? 'text-violet-800' : 'text-emerald-800'
                      }`}
                    >
                      {entry.name}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        entry.kind === 'addon'
                          ? 'bg-violet-200 text-violet-900'
                          : 'bg-emerald-200 text-emerald-900'
                      }`}
                    >
                      {entry.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {insights && (
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              <SummaryCard
                icon={<Users className="h-5 w-5 text-sky-600" />}
                label="Avg. cost / patient"
                value={
                  insights.avgPerPatientCents != null
                    ? roundedCentsToDisplay(insights.avgPerPatientCents)
                    : '—'
                }
                subvalue={`${insights.uniquePatients} unique patients`}
                bg="bg-sky-50"
              />
              <SummaryCard
                icon={<Layers className="h-5 w-5 text-indigo-600" />}
                label="Avg. cost / order"
                value={
                  insights.avgPerOrderCents != null
                    ? roundedCentsToDisplay(insights.avgPerOrderCents)
                    : '—'
                }
                subvalue={`÷ ${pharmacy?.orderCount ?? 0} pharmacy orders`}
                bg="bg-indigo-50"
              />
              <SummaryCard
                icon={<BarChart3 className="h-5 w-5 text-teal-600" />}
                label="Top product (vials)"
                value={
                  insights.topMedication
                    ? insights.topMedication.length > 28
                      ? `${insights.topMedication.slice(0, 26)}…`
                      : insights.topMedication
                    : '—'
                }
                valueTitle={insights.topMedication || undefined}
                subvalue={
                  insights.topMedSharePct != null
                    ? `${insights.topMedSharePct}% of vials this period`
                    : undefined
                }
                bg="bg-teal-50"
              />
              <SummaryCard
                icon={<Sparkles className="h-5 w-5 text-rose-600" />}
                label="Rx services mix"
                value={insights.newRxSharePct != null ? `${insights.newRxSharePct}% new` : '—'}
                subvalue={
                  insights.rxTotal > 0
                    ? `${insights.rxNew} new · ${insights.rxRefill} refill · ${insights.rxTotal} total`
                    : undefined
                }
                bg="bg-rose-50"
              />
            </div>
          )}

          {/* Tab Selector */}
          <div className="mb-4 flex flex-wrap gap-2">
            <TabButton
              active={activeTab === 'pharmacy'}
              onClick={() => setActiveTab('pharmacy')}
              icon={<Pill className="h-4 w-4" />}
              label="Pharmacy Products"
              badge={centsToDisplay(pharmacy?.totalCents ?? 0)}
            />
            <TabButton
              active={activeTab === 'prescription_services'}
              onClick={() => setActiveTab('prescription_services')}
              icon={<Receipt className="h-4 w-4" />}
              label="Prescription Services"
              badge={centsToDisplay(rxServices?.totalCents ?? 0)}
            />
          </div>

          {/* Export Buttons */}
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => handleExport(activeTab, 'csv')}
              disabled={exporting !== null}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting === `${activeTab}_csv` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export CSV
            </button>
            <button
              onClick={() => handleExport(activeTab, 'pdf')}
              disabled={exporting !== null}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting === `${activeTab}_pdf` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export PDF
            </button>
          </div>

          {/* Invoice Content */}
          {activeTab === 'pharmacy' && pharmacy && <PharmacyInvoiceView invoice={pharmacy} />}

          {activeTab === 'prescription_services' && rxServices && (
            <PrescriptionServicesView invoice={rxServices} />
          )}
        </>
      )}

      {/* Empty State */}
      {!loading && !data && !error && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <FileText className="mb-4 h-12 w-12 text-gray-300" />
          <p className="text-lg font-medium text-gray-500">Select a date and generate invoices</p>
          <p className="mt-1 text-sm text-gray-400">
            Two separate invoices will be generated: pharmacy products and prescription services
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-Components
// ============================================================================

function SummaryCard({
  icon,
  label,
  value,
  valueTitle,
  subvalue,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueTitle?: string;
  subvalue?: string;
  bg: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500">{label}</p>
          <p className="truncate text-lg font-bold text-gray-900" title={valueTitle ?? value}>
            {value}
          </p>
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

function PharmacyInvoiceView({ invoice }: { invoice: PharmacyInvoice }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  interface OrderGroup {
    orderId: number;
    items: PharmacyLineItem[];
    shipping: ShippingLineItem[];
    addons: AddonLineItem[];
    medTotalCents: number;
    shippingTotalCents: number;
    addonsTotalCents: number;
    orderTotalCents: number;
  }

  const orderGroups = useMemo(() => {
    const medMap = new Map<number, PharmacyLineItem[]>();
    for (const li of invoice.lineItems) {
      const arr = medMap.get(li.orderId) ?? [];
      arr.push(li);
      medMap.set(li.orderId, arr);
    }

    const shipMap = new Map<number, ShippingLineItem[]>();
    for (const sl of invoice.shippingLineItems) {
      const arr = shipMap.get(sl.orderId) ?? [];
      arr.push(sl);
      shipMap.set(sl.orderId, arr);
    }

    const addonMap = new Map<number, AddonLineItem[]>();
    for (const al of invoice.addonLineItems ?? []) {
      const arr = addonMap.get(al.orderId) ?? [];
      arr.push(al);
      addonMap.set(al.orderId, arr);
    }

    const orderIdOrder: number[] = [];
    const pushOid = (id: number) => {
      if (!orderIdOrder.includes(id)) orderIdOrder.push(id);
    };
    for (const li of invoice.lineItems) pushOid(li.orderId);
    for (const sl of invoice.shippingLineItems) pushOid(sl.orderId);
    for (const al of invoice.addonLineItems ?? []) pushOid(al.orderId);

    const groups: OrderGroup[] = [];
    for (const orderId of orderIdOrder) {
      const items = medMap.get(orderId) ?? [];
      const shipping = shipMap.get(orderId) ?? [];
      const addons = addonMap.get(orderId) ?? [];
      const medTotalCents = items.reduce((s, i) => s + i.lineTotalCents, 0);
      const shippingTotalCents = shipping.reduce((s, i) => s + i.feeCents, 0);
      const addonsTotalCents = addons.reduce((s, a) => s + a.feeCents, 0);
      groups.push({
        orderId,
        items,
        shipping,
        addons,
        medTotalCents,
        shippingTotalCents,
        addonsTotalCents,
        orderTotalCents: medTotalCents + shippingTotalCents + addonsTotalCents,
      });
    }
    return groups;
  }, [invoice.lineItems, invoice.shippingLineItems, invoice.addonLineItems]);

  const hasDetails = (g: OrderGroup) =>
    g.items.length + g.shipping.length + g.addons.length > 1 ||
    g.shipping.length > 0 ||
    g.addons.length > 0;

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="flex items-center gap-2 font-semibold text-gray-900">
            <Pill className="h-5 w-5 text-[#4fa77e]" />
            Orders
            <span className="ml-auto text-sm font-normal text-gray-500">
              {orderGroups.length} orders &middot; {invoice.lineItems.length} vials
              {invoice.shippingLineItems.length > 0 &&
                ` · ${invoice.shippingLineItems.length} shipping charges`}
              {(invoice.addonLineItems?.length ?? 0) > 0 &&
                ` · ${invoice.addonLineItems?.length ?? 0} add-on fee(s)`}
            </span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3">Paid (ET)</th>
                <th className="px-4 py-3">Sent (ET)</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">LF Order ID</th>
                <th className="px-4 py-3">Medication</th>
                <th className="px-4 py-3">Strength</th>
                <th className="px-4 py-3">Vial</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit Price</th>
                <th className="px-4 py-3 text-right">Order Total</th>
              </tr>
            </thead>
            <tbody>
              {orderGroups.map((group) => {
                const expandable = hasDetails(group);
                const isOpen = expanded.has(group.orderId);
                const first = group.items[0] ?? group.shipping[0] ?? group.addons[0];
                if (!first) return null;

                // Single vial, no shipping — flat row
                if (!expandable) {
                  return (
                    <tr key={group.orderId} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-2 py-2.5" />
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-emerald-700">
                        {first.paidAt ? formatDateTime(first.paidAt) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-600">
                        {formatDateTime(first.orderDate)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-gray-500">
                        {first.orderId}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{first.patientName}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-gray-400">
                        {first.lifefileOrderId ?? '-'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-900">
                        {'medicationName' in first ? first.medicationName : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {'strength' in first ? first.strength : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {'vialSize' in first ? first.vialSize : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        {'quantity' in first ? first.quantity : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        {'unitPriceCents' in first ? centsToDisplay(first.unitPriceCents) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                        {centsToDisplay(group.orderTotalCents)}
                      </td>
                    </tr>
                  );
                }

                // Multi-vial or has shipping — expandable
                const badges: string[] = [];
                if (group.items.length > 1) badges.push(`${group.items.length} vials`);
                if (group.shipping.length > 0)
                  badges.push(
                    group.shipping.map((s) => s.description.replace(' surcharge', '')).join(' + ')
                  );
                if (group.addons.length > 0)
                  badges.push(
                    group.addons.length === 1
                      ? group.addons[0].addonName
                      : `${group.addons.length} add-ons`
                  );

                return (
                  <React.Fragment key={group.orderId}>
                    <tr
                      className="cursor-pointer border-b border-gray-200 bg-[#4fa77e]/5 transition-colors hover:bg-[#4fa77e]/10"
                      onClick={() => toggle(group.orderId)}
                    >
                      <td className="px-2 py-2.5 text-center">
                        {isOpen ? (
                          <ChevronDown className="mx-auto h-4 w-4 text-[#4fa77e]" />
                        ) : (
                          <ChevronRight className="mx-auto h-4 w-4 text-gray-400" />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-emerald-700">
                        {first.paidAt ? formatDateTime(first.paidAt) : '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-600">
                        {formatDateTime(first.orderDate)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-gray-500">
                        {first.orderId}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-gray-900">
                        {first.patientName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-gray-400">
                        {first.lifefileOrderId ?? '-'}
                      </td>
                      <td className="px-4 py-2.5" colSpan={5}>
                        <div className="flex flex-wrap gap-1.5">
                          {badges.map((b, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center rounded-full bg-[#4fa77e]/10 px-2.5 py-0.5 text-xs font-medium text-[#4fa77e]"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-[#4fa77e]">
                        {centsToDisplay(group.orderTotalCents)}
                      </td>
                    </tr>
                    {isOpen && (
                      <>
                        {group.items.map((li, idx) => (
                          <tr
                            key={`med-${group.orderId}-${idx}`}
                            className="border-b border-gray-50 bg-gray-50/50"
                          >
                            <td className="px-2 py-2">
                              <div className="mx-auto h-4 w-px bg-[#4fa77e]/30" />
                            </td>
                            <td />
                            <td />
                            <td />
                            <td />
                            <td />
                            <td className="px-4 py-2 text-gray-900">{li.medicationName}</td>
                            <td className="px-4 py-2 text-gray-600">{li.strength}</td>
                            <td className="px-4 py-2 text-gray-600">{li.vialSize}</td>
                            <td className="px-4 py-2 text-right text-gray-600">{li.quantity}</td>
                            <td className="px-4 py-2 text-right text-gray-600">
                              {centsToDisplay(li.unitPriceCents)}
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-gray-800">
                              {centsToDisplay(li.lineTotalCents)}
                            </td>
                          </tr>
                        ))}
                        {group.shipping.map((sl, idx) => (
                          <tr
                            key={`ship-${group.orderId}-${idx}`}
                            className="border-b border-gray-50 bg-amber-50/40"
                          >
                            <td className="px-2 py-2">
                              <div className="mx-auto h-4 w-px bg-amber-300/50" />
                            </td>
                            <td />
                            <td />
                            <td />
                            <td />
                            <td />
                            <td className="px-4 py-2 text-amber-700" colSpan={4}>
                              <Truck className="mr-1 inline h-3 w-3" />
                              {sl.description}
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-amber-700">
                              {centsToDisplay(sl.feeCents)}
                            </td>
                          </tr>
                        ))}
                        {group.addons.map((ad, idx) => (
                          <tr
                            key={`addon-${group.orderId}-${idx}`}
                            className="border-b border-gray-50 bg-violet-50/50"
                          >
                            <td className="px-2 py-2">
                              <div className="mx-auto h-4 w-px bg-violet-300/50" />
                            </td>
                            <td />
                            <td />
                            <td />
                            <td />
                            <td />
                            <td className="px-4 py-2 text-violet-800" colSpan={4}>
                              <Sparkles className="mr-1 inline h-3 w-3" />
                              Add-on: {ad.addonName}
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-violet-800">
                              {centsToDisplay(ad.feeCents)}
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </React.Fragment>
                );
              })}

              {invoice.lineItems.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-400">
                    No orders for this period
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={11} className="px-4 py-3 text-right font-semibold text-gray-700">
                  Invoice Total
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">
                  {centsToDisplay(invoice.totalCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Grand Total */}
      <div className="rounded-2xl border border-[#4fa77e]/30 bg-[#4fa77e]/5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Pharmacy Products Invoice Total</p>
            <p className="text-xs text-gray-400">
              Medications: {centsToDisplay(invoice.subtotalMedicationsCents)}
              {invoice.subtotalShippingCents > 0 &&
                ` + Shipping: ${centsToDisplay(invoice.subtotalShippingCents)}`}
              {(invoice.subtotalAddonsCents ?? 0) > 0 &&
                ` + Add-ons (Elite Bundle / subscription COGS): ${centsToDisplay(invoice.subtotalAddonsCents ?? 0)}`}
            </p>
          </div>
          <p className="text-3xl font-bold text-[#4fa77e]">{centsToDisplay(invoice.totalCents)}</p>
        </div>
      </div>
    </div>
  );
}

function PrescriptionServicesView({ invoice }: { invoice: PrescriptionServicesInvoice }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="flex items-center gap-2 font-semibold text-gray-900">
            <Receipt className="h-5 w-5 text-[#4fa77e]" />
            Prescription Service Line Items
            <span className="ml-auto flex items-center gap-3 text-sm font-normal text-gray-500">
              <span>{invoice.totalPrescriptions} total</span>
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                {invoice.newPrescriptionCount} new @ {centsToDisplay(invoice.newFeeCents)}
              </span>
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {invoice.refillPrescriptionCount} refill @ {centsToDisplay(invoice.refillFeeCents)}
              </span>
              {invoice.cancelledPrescriptionCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                  {invoice.cancelledPrescriptionCount} cancelled
                </span>
              )}
            </span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">Paid (ET)</th>
                <th className="px-4 py-3">Sent (ET)</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">LF Order ID</th>
                <th className="px-4 py-3">Medications</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Service Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoice.lineItems.map((li, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-emerald-700">
                    {li.paidAt ? formatDateTime(li.paidAt) : '-'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-600">
                    {formatDateTime(li.orderDate)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-gray-500">
                    {li.orderId}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{li.patientName}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-gray-400">
                    {li.lifefileOrderId ?? '-'}
                  </td>
                  <td
                    className="max-w-xs truncate px-4 py-2.5 text-gray-600"
                    title={li.medications}
                  >
                    {li.medications}
                  </td>
                  <td className="px-4 py-2.5">
                    {li.chargeType === 'cancelled' ? (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        Cancelled
                      </span>
                    ) : li.chargeType === 'new' ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        New
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Refill
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                    {centsToDisplay(li.feeCents)}
                  </td>
                </tr>
              ))}

              {invoice.lineItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No prescriptions for this period
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={7} className="px-4 py-3 text-right font-semibold text-gray-700">
                  Total ({invoice.totalPrescriptions} prescriptions)
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">
                  {centsToDisplay(invoice.totalCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Grand Total */}
      <div className="rounded-2xl border border-amber-300/30 bg-amber-50/50 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">
              Prescription Medical Services Invoice Total
            </p>
            <p className="text-xs text-gray-400">
              {invoice.newPrescriptionCount} new x {centsToDisplay(invoice.newFeeCents)}
              {invoice.refillPrescriptionCount > 0 && (
                <>
                  {' '}
                  + {invoice.refillPrescriptionCount} refill x{' '}
                  {centsToDisplay(invoice.refillFeeCents)}
                </>
              )}
              {invoice.cancelledPrescriptionCount > 0 && (
                <> + {invoice.cancelledPrescriptionCount} cancelled @ $0.00</>
              )}
            </p>
          </div>
          <p className="text-3xl font-bold text-amber-600">{centsToDisplay(invoice.totalCents)}</p>
        </div>
      </div>
    </div>
  );
}
