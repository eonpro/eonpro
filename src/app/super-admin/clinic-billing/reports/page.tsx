'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Download,
  Calendar,
  Building2,
  DollarSign,
  ChevronLeft,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

type PeriodType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';

interface FeeEvent {
  id: number;
  feeType: string;
  amountCents: number;
  status: string;
  createdAt: string;
  clinic?: { id: number; name: string };
  order?: {
    id: number;
    patientId: number;
    patient?: { id: number; firstName: string; lastName: string };
  } | null;
  provider?: { id: number; firstName: string; lastName: string; isEonproProvider: boolean } | null;
  invoice?: { id: number; invoiceNumber: string; status: string } | null;
}

interface ReportResponse {
  events: FeeEvent[];
  total: number;
  summary: {
    totalPrescriptionFees: number;
    totalTransmissionFees: number;
    totalAdminFees: number;
    totalFees: number;
    prescriptionCount: number;
    transmissionCount: number;
    adminCount: number;
  };
  pagination: { limit: number; offset: number; total: number; hasMore: boolean };
  dateRange: { startDate: string; endDate: string };
}

interface ClinicOption {
  id: number;
  name: string;
}

function getPresetRange(preset: string): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      return { start, end };
    case 'yesterday': {
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'last7':
      start.setDate(start.getDate() - 7);
      return { start, end };
    case 'this-week':
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      return { start, end };
    case 'last30':
      start.setDate(start.getDate() - 30);
      return { start, end };
    case 'this-month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    case 'last-month': {
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0); // last day of previous month
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'this-quarter': {
      const q = Math.floor(start.getMonth() / 3) + 1;
      start.setMonth((q - 1) * 3);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case 'last-quarter': {
      const q = Math.floor(start.getMonth() / 3) + 1;
      start.setMonth((q - 2) * 3);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth((q - 1) * 3);
      end.setDate(0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    default:
      start.setDate(start.getDate() - 30);
      return { start, end };
  }
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export default function ClinicBillingReportsPage() {
  const router = useRouter();
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [periodType, setPeriodType] = useState<PeriodType>('MONTHLY');
  const [preset, setPreset] = useState('last30');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clinicId, setClinicId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadClinics = useCallback(async () => {
    try {
      const res = await apiFetch('/api/super-admin/clinic-fees');
      if (res.ok) {
        const json = await res.json();
        const list = (json.clinics ?? []).map((c: { clinic: ClinicOption }) => c.clinic);
        setClinics(list);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadClinics();
  }, [loadClinics]);

  // Initialize dates from preset
  useEffect(() => {
    const { start, end } = getPresetRange(preset);
    setStartDate(start.toISOString().slice(0, 10));
    setEndDate(end.toISOString().slice(0, 10));
  }, [preset]);

  const fetchReport = useCallback(async () => {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('periodType', periodType);
      params.set('startDate', start.toISOString());
      params.set('endDate', end.toISOString());
      if (clinicId) params.set('clinicId', clinicId);
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '200');
      const res = await apiFetch(`/api/super-admin/clinic-fees/reports?${params}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to load report');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, periodType, clinicId, statusFilter]);

  const exportCsv = async () => {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    setExporting(true);
    try {
      const res = await apiFetch('/api/super-admin/clinic-fees/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodType,
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          ...(clinicId ? { clinicId: parseInt(clinicId, 10) } : {}),
          format: 'csv',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Export failed');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `billing-report-${start.toISOString().slice(0, 10)}-${end.toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mb-6 flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.push('/super-admin/clinic-billing')}
          className="flex items-center gap-1 text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-5 w-5" />
          Back
        </button>
      </div>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing Reports</h1>
          <p className="mt-1 text-gray-500">
            Fee visibility by period, linked to each patient prescription
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push('/super-admin/clinic-billing/invoices')}
          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
        >
          <FileText className="h-5 w-5" />
          View Invoices
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-700">
          <Calendar className="h-4 w-4" />
          Period &amp; filters
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Period type</label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as PeriodType)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="YEARLY">Yearly</option>
              <option value="CUSTOM">Custom dates</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Quick range</label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 days</option>
              <option value="this-week">This week</option>
              <option value="last30">Last 30 days</option>
              <option value="this-month">This month</option>
              <option value="last-month">Last month</option>
              <option value="this-quarter">This quarter</option>
              <option value="last-quarter">Last quarter</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Clinic</label>
            <select
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
            >
              <option value="">All clinics</option>
              {clinics.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
            >
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="INVOICED">Invoiced</option>
              <option value="PAID">Paid</option>
              <option value="WAIVED">Waived</option>
              <option value="VOIDED">Voided</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fetchReport}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-[#4fa77e] px-4 py-2 text-white shadow-sm transition-colors hover:bg-[#3d9268] disabled:opacity-50"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Run report
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || !data}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {data?.summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm">Prescription fees</span>
            </div>
            <p className="mt-1 text-lg font-bold text-gray-900">
              {formatCurrency(data.summary.totalPrescriptionFees)}
            </p>
            <p className="text-xs text-gray-500">{data.summary.prescriptionCount} events</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm">Transmission fees</span>
            </div>
            <p className="mt-1 text-lg font-bold text-gray-900">
              {formatCurrency(data.summary.totalTransmissionFees)}
            </p>
            <p className="text-xs text-gray-500">{data.summary.transmissionCount} events</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <DollarSign className="h-4 w-4" />
              <span className="text-sm">Admin fees</span>
            </div>
            <p className="mt-1 text-lg font-bold text-gray-900">
              {formatCurrency(data.summary.totalAdminFees)}
            </p>
            <p className="text-xs text-gray-500">{data.summary.adminCount} events</p>
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <Building2 className="h-4 w-4" />
              <span className="text-sm">Total</span>
            </div>
            <p className="mt-1 text-lg font-bold text-[#4fa77e]">
              {formatCurrency(data.summary.totalFees)}
            </p>
            <p className="text-xs text-gray-500">{data.pagination.total} rows</p>
          </div>
        </div>
      )}

      {/* Events table – linked to each patient prescription */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading && !data ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4fa77e] border-t-transparent" />
          </div>
        ) : data?.events?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Clinic
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Patient
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Order / Prescription
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Fee type
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {formatDate(ev.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {ev.clinic?.name ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {ev.order?.patient
                        ? `${ev.order.patient.firstName} ${ev.order.patient.lastName}`.trim() || '—'
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      Order #{ev.order?.id ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                      {ev.feeType}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">
                      {formatCurrency(ev.amountCents)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          ev.status === 'PAID'
                            ? 'bg-green-100 text-green-700'
                            : ev.status === 'PENDING'
                              ? 'bg-yellow-100 text-yellow-700'
                              : ev.status === 'INVOICED'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {ev.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : data ? (
          <div className="py-12 text-center text-gray-500">
            No fee events in this range. Adjust dates or filters and run report again.
          </div>
        ) : null}
      </div>

      {data?.pagination?.hasMore && (
        <p className="mt-2 text-center text-sm text-gray-500">
          Showing first {data.events?.length ?? 0} of {data.pagination.total}. Narrow date range or
          use CSV export for full data.
        </p>
      )}
    </div>
  );
}
