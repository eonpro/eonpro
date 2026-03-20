'use client';

import React, { useState, useCallback, useMemo } from 'react';
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
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

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
  pricingStatus: 'priced' | 'missing';
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
  subtotalMedicationsCents: number;
  subtotalShippingCents: number;
  totalCents: number;
  orderCount: number;
  vialCount: number;
  missingPriceCount: number;
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

interface OtPlatformCompensation {
  grossSalesCents: number;
  rateBps: number;
  feeCents: number;
  invoiceCount: number;
}

interface OtInvoiceData {
  pharmacy: OtPharmacyInvoice;
  doctorApprovals: OtDoctorApprovalsInvoice;
  fulfillment: OtFulfillmentInvoice;
  platformCompensation: OtPlatformCompensation;
  grandTotalCents: number;
}

type ActiveTab = 'pharmacy' | 'doctor_approvals' | 'fulfillment';

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

function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export default function OtInvoicesPage() {
  const [startDate, setStartDate] = useState(getTodayISO());
  const [endDate, setEndDate] = useState(getTodayISO());
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
    invoiceType: ActiveTab | 'combined' | 'summary',
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

  const insights = useMemo(() => {
    if (!data) return null;
    return {
      platformPct: data.platformCompensation.rateBps / 100,
    };
  }, [data]);

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">OT (Overtime) Invoices</h1>
        <p className="mt-1 text-gray-500">
          Internal billing for ot.eonpro.io — pharmacy costs, doctor approvals (async vs sync), other
          Stripe line fulfillment fees, and {insights ? `${insights.platformPct}%` : '10%'} platform
          compensation on gross patient payments.
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
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-7">
            <SummaryCard
              icon={<Package className="h-5 w-5 text-blue-600" />}
              label="Orders"
              value={String(data.pharmacy.orderCount)}
              bg="bg-blue-50"
            />
            <SummaryCard
              icon={<Pill className="h-5 w-5 text-purple-600" />}
              label="Vials"
              value={String(data.pharmacy.vialCount)}
              bg="bg-purple-50"
            />
            <SummaryCard
              icon={<Truck className="h-5 w-5 text-emerald-700" />}
              label="Pharmacy"
              value={centsToDisplay(data.pharmacy.totalCents)}
              subvalue={
                data.pharmacy.missingPriceCount > 0
                  ? `${data.pharmacy.missingPriceCount} unpriced qty`
                  : undefined
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
              icon={<Percent className="h-5 w-5 text-rose-600" />}
              label="Platform fee"
              value={centsToDisplay(data.platformCompensation.feeCents)}
              subvalue={`on ${centsToDisplay(data.platformCompensation.grossSalesCents)} gross`}
              bg="bg-rose-50"
            />
            <SummaryCard
              icon={<DollarSign className="h-5 w-5 text-red-600" />}
              label="Grand total"
              value={centsToDisplay(data.grandTotalCents)}
              bg="bg-red-50"
            />
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <TabButton
              active={activeTab === 'pharmacy'}
              onClick={() => setActiveTab('pharmacy')}
              icon={<Pill className="h-4 w-4" />}
              label="Pharmacy"
              badge={centsToDisplay(data.pharmacy.totalCents)}
            />
            <TabButton
              active={activeTab === 'doctor_approvals'}
              onClick={() => setActiveTab('doctor_approvals')}
              icon={<Receipt className="h-4 w-4" />}
              label="Doctor approvals"
              badge={centsToDisplay(data.doctorApprovals.totalCents)}
            />
            <TabButton
              active={activeTab === 'fulfillment'}
              onClick={() => setActiveTab('fulfillment')}
              icon={<Layers className="h-4 w-4" />}
              label="Fulfillment"
              badge={centsToDisplay(data.fulfillment.totalCents)}
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
              Combined CSV
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
          {activeTab === 'doctor_approvals' && <DoctorTable invoice={data.doctorApprovals} />}
          {activeTab === 'fulfillment' && <FulfillmentTable invoice={data.fulfillment} />}
        </>
      )}

      {!loading && !data && !error && (
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

function PharmacyTable({ invoice }: { invoice: OtPharmacyInvoice }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
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
          Shipping surcharges
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
        Async (queue): {centsToDisplay(invoice.asyncFeeCents)} · Sync: {centsToDisplay(invoice.syncFeeCents)}
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
