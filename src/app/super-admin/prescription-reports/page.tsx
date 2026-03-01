'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Download,
  Calendar,
  Building2,
  Users,
  Pill,
  ChevronDown,
  ChevronUp,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// ============================================================================
// Types
// ============================================================================

type Period = 'day' | 'week' | 'month' | 'quarter' | 'semester' | 'year' | 'custom';

interface ProviderSummary {
  providerId: number;
  providerName: string;
  clinicId: number;
  clinicName: string;
  prescriptionCount: number;
  uniquePatients: number;
}

interface DetailRow {
  orderId: number;
  date: string;
  patientId: number;
  patientName: string;
  providerId: number;
  providerName: string;
  clinicId: number;
  clinicName: string;
  medications: string;
  status: string | null;
}

interface ReportData {
  summary: {
    totalPrescriptions: number;
    uniquePatients: number;
    activeProviders: number;
    clinicCount: number;
    byProvider: ProviderSummary[];
  };
  details: DetailRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

interface ClinicOption {
  id: number;
  name: string;
}

// ============================================================================
// Helpers
// ============================================================================

const PERIOD_LABELS: Record<Period, string> = {
  day: 'Today',
  week: 'This Week',
  month: 'This Month',
  quarter: 'This Quarter',
  semester: 'This Semester',
  year: 'This Year',
  custom: 'Custom Dates',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadge(status: string | null) {
  if (!status) return null;
  const colors: Record<string, string> = {
    Completed: 'bg-green-100 text-green-700',
    Shipped: 'bg-blue-100 text-blue-700',
    Processing: 'bg-yellow-100 text-yellow-700',
    Cancelled: 'bg-red-100 text-red-700',
    Pending: 'bg-gray-100 text-gray-600',
  };
  const cls = colors[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ============================================================================
// Page
// ============================================================================

export default function PrescriptionReportsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clinicId, setClinicId] = useState<string>('');
  const [providerId, setProviderId] = useState<string>('');
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [showDetails, setShowDetails] = useState(true);

  // Load clinic options
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/super-admin/clinics?limit=500');
        if (res.ok) {
          const json = await res.json();
          const list = (json.clinics ?? json.data ?? []).map(
            (c: { id: number; name: string }) => ({ id: c.id, name: c.name })
          );
          setClinics(list);
        }
      } catch {
        // non-blocking
      }
    })();
  }, []);

  const fetchReport = useCallback(
    async (p = page) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('period', period);
        if (period === 'custom' && startDate) params.set('startDate', new Date(startDate).toISOString());
        if (period === 'custom' && endDate) params.set('endDate', new Date(endDate).toISOString());
        if (clinicId) params.set('clinicId', clinicId);
        if (providerId) params.set('providerId', providerId);
        params.set('page', String(p));
        params.set('limit', String(limit));

        const res = await apiFetch(`/api/super-admin/prescription-reports?${params}`);
        if (res.ok) {
          const json: ReportData = await res.json();
          setData(json);
          setPage(p);
        } else {
          const err = await res.json().catch(() => ({}));
          alert(err.error || 'Failed to load report');
        }
      } catch {
        alert('Failed to load report');
      } finally {
        setLoading(false);
      }
    },
    [period, startDate, endDate, clinicId, providerId, limit, page]
  );

  const handleExport = async (format: 'csv' | 'pdf') => {
    setExporting(format);
    try {
      const res = await apiFetch('/api/super-admin/prescription-reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          period,
          ...(period === 'custom' && startDate
            ? { startDate: new Date(startDate).toISOString() }
            : {}),
          ...(period === 'custom' && endDate
            ? { endDate: new Date(endDate).toISOString() }
            : {}),
          ...(clinicId ? { clinicId: parseInt(clinicId, 10) } : {}),
          ...(providerId ? { providerId: parseInt(providerId, 10) } : {}),
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
      const ext = format === 'csv' ? 'csv' : 'pdf';
      a.download = `prescription-report.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed');
    } finally {
      setExporting(null);
    }
  };

  const handleGenerateInvoice = () => {
    if (!clinicId) {
      alert('Please select a specific clinic to generate an invoice.');
      return;
    }
    const params = new URLSearchParams();
    params.set('create', '1');
    params.set('clinicId', clinicId);
    if (data?.dateRange) {
      params.set('startDate', data.dateRange.startDate.split('T')[0]);
      params.set('endDate', data.dateRange.endDate.split('T')[0]);
    }
    router.push(`/super-admin/clinic-billing/invoices?${params}`);
  };

  const totalPages = data ? Math.ceil(data.pagination.total / limit) : 0;

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prescription Reports</h1>
          <p className="mt-1 text-gray-500">
            Prescriptions written by providers per clinic with export and invoicing
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleExport('csv')}
            disabled={!data || exporting !== null}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting === 'csv' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            disabled={!data || exporting !== null}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting === 'pdf' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Export PDF
          </button>
          <button
            type="button"
            onClick={handleGenerateInvoice}
            disabled={!data}
            className="flex items-center gap-2 rounded-xl bg-[#4fa77e] px-4 py-2 text-sm text-white shadow-sm transition-colors hover:bg-[#3d9268] disabled:opacity-50"
          >
            <Receipt className="h-4 w-4" />
            Generate Invoice
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-gray-700">
          <Calendar className="h-4 w-4" />
          Filters
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
            >
              {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {period === 'custom' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Clinic</label>
            <select
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#4fa77e] focus:outline-none focus:ring-2 focus:ring-[#4fa77e]/20"
            >
              <option value="">All Clinics</option>
              {clinics.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => fetchReport(1)}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4fa77e] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#3d9268] disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Run Report
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <Pill className="h-4 w-4" />
              <span className="text-sm">Total Prescriptions</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {data.summary.totalPrescriptions.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <Users className="h-4 w-4" />
              <span className="text-sm">Unique Patients</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {data.summary.uniquePatients.toLocaleString()}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <Users className="h-4 w-4" />
              <span className="text-sm">Active Providers</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-[#4fa77e]">
              {data.summary.activeProviders}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-gray-500">
              <Building2 className="h-4 w-4" />
              <span className="text-sm">Clinics</span>
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-900">{data.summary.clinicCount}</p>
          </div>
        </div>
      )}

      {/* Date range label */}
      {data && (
        <div className="mb-4 text-sm text-gray-500">
          Showing data from <span className="font-medium text-gray-700">{formatDate(data.dateRange.startDate)}</span>{' '}
          to <span className="font-medium text-gray-700">{formatDate(data.dateRange.endDate)}</span>
        </div>
      )}

      {/* Provider Summary Table */}
      {data && data.summary.byProvider.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Provider Summary</h2>
            <p className="text-sm text-gray-500">Prescriptions grouped by provider per clinic</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Provider
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Clinic
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Prescriptions
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Unique Patients
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.summary.byProvider.map((row) => (
                  <tr key={`${row.providerId}-${row.clinicId}`} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-3 text-sm font-medium text-gray-900">
                      {row.providerName}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-sm text-gray-600">
                      {row.clinicName}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-right text-sm font-semibold text-[#4fa77e]">
                      {row.prescriptionCount}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-right text-sm text-gray-600">
                      {row.uniquePatients}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Table */}
      {data && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Prescription Details</h2>
              <p className="text-sm text-gray-500">
                {data.pagination.total.toLocaleString()} total prescriptions
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
            >
              {showDetails ? (
                <>
                  <ChevronUp className="h-4 w-4" /> Hide
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" /> Show
                </>
              )}
            </button>
          </div>

          {showDetails && (
            <>
              {loading && !data.details.length ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-[#4fa77e]" />
                </div>
              ) : data.details.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Order
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Patient
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Provider
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Clinic
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Medications
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.details.map((row) => (
                        <tr key={row.orderId} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                            {formatDateTime(row.date)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                            #{row.orderId}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                            {row.patientName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                            {row.providerName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                            {row.clinicName}
                          </td>
                          <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-600" title={row.medications}>
                            {row.medications}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm">
                            {statusBadge(row.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-12 text-center text-gray-500">
                  No prescriptions found for the selected filters.
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 px-6 py-3">
                  <p className="text-sm text-gray-500">
                    Page {page} of {totalPages} ({data.pagination.total.toLocaleString()} records)
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fetchReport(page - 1)}
                      disabled={page <= 1 || loading}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchReport(page + 1)}
                      disabled={!data.pagination.hasMore || loading}
                      className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {!data && !loading && (
        <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm">
          <Pill className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No report generated yet</h3>
          <p className="mt-2 text-gray-500">
            Select your filters above and click &ldquo;Run Report&rdquo; to see prescription data.
          </p>
        </div>
      )}
    </div>
  );
}
