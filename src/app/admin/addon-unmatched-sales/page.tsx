'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type AddonGroup = {
  total: number;
  no_customer_email: number;
  no_patient_match: number;
};

type UnmatchedSample = {
  addonKey: string;
  reason: 'no_customer_email' | 'no_patient_match';
  stripeSubscriptionId: string;
  stripeInvoiceId: string;
  paidAt: string;
};

type ReportResponse = {
  success: boolean;
  generatedAt: string;
  clinic: { id: number; name: string; subdomain: string | null };
  report: {
    lookbackDays: number;
    paidSalesChecked: number;
    unmatchedTotal: number;
    grouped: Record<string, AddonGroup>;
    samples: UnmatchedSample[];
  };
};

const ADDON_LABELS: Record<string, string> = {
  elite_bundle: 'Elite Bundle',
  nad_plus: 'NAD+',
  sermorelin: 'Sermorelin',
  b12: 'B12',
};

const REASON_LABELS: Record<UnmatchedSample['reason'], string> = {
  no_customer_email: 'No customer email on Stripe record',
  no_patient_match: 'No local patient match',
};

export default function AddonUnmatchedSalesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ReportResponse | null>(null);
  const [lookbackDays, setLookbackDays] = useState(7);

  const fetchReport = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `/api/admin/addon-unmatched-sales?lookbackDays=${lookbackDays}&sampleLimit=100`,
          {
            cache: 'no-store',
          }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || 'Failed to load unmatched add-on sales report');
          setData(null);
          return;
        }
        const body: ReportResponse = await res.json();
        setData(body);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [lookbackDays]
  );

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const groupedRows = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.report.grouped)
      .map(([key, value]) => ({
        addonKey: key,
        addonLabel: ADDON_LABELS[key] || key,
        ...value,
      }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  return (
    <div className="min-h-screen bg-[#efece7] p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Addon Queue Gaps</h1>
              <p className="mt-1 text-sm text-gray-600">
                Paid add-on sales not yet queued to provider Rx review.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Number(e.target.value))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <option value={1}>Last 1 day</option>
                <option value={3}>Last 3 days</option>
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
              </select>
              <button
                onClick={() => void fetchReport(true)}
                disabled={loading || refreshing}
                className="inline-flex items-center gap-2 rounded-lg bg-[#66a682] px-3 py-2 text-sm font-medium text-white hover:bg-[#5a9575] disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600">
            Loading report...
          </div>
        ) : data ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Paid Sales Checked</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {data.report.paidSalesChecked}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Unmatched Sales</p>
                <p
                  className={`mt-1 text-2xl font-bold ${data.report.unmatchedTotal > 0 ? 'text-amber-700' : 'text-emerald-700'}`}
                >
                  {data.report.unmatchedTotal}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Last Generated</p>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  {new Date(data.generatedAt).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">By Add-on Type</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-500">
                      <th className="px-3 py-2 font-medium">Add-on</th>
                      <th className="px-3 py-2 font-medium">Total</th>
                      <th className="px-3 py-2 font-medium">No Customer Email</th>
                      <th className="px-3 py-2 font-medium">No Patient Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedRows.map((row) => (
                      <tr key={row.addonKey} className="border-b border-gray-100">
                        <td className="px-3 py-2 font-medium text-gray-900">{row.addonLabel}</td>
                        <td className="px-3 py-2 text-gray-700">{row.total}</td>
                        <td className="px-3 py-2 text-gray-700">{row.no_customer_email}</td>
                        <td className="px-3 py-2 text-gray-700">{row.no_patient_match}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Sample Unmatched Sales</h2>
              {data.report.samples.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No unmatched paid sales in the selected window.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-500">
                        <th className="px-3 py-2 font-medium">Add-on</th>
                        <th className="px-3 py-2 font-medium">Reason</th>
                        <th className="px-3 py-2 font-medium">Stripe Subscription</th>
                        <th className="px-3 py-2 font-medium">Stripe Invoice</th>
                        <th className="px-3 py-2 font-medium">Paid At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.report.samples.map((sample) => (
                        <tr
                          key={`${sample.stripeInvoiceId}-${sample.stripeSubscriptionId}`}
                          className="border-b border-gray-100"
                        >
                          <td className="px-3 py-2 text-gray-900">
                            {ADDON_LABELS[sample.addonKey] || sample.addonKey}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {REASON_LABELS[sample.reason]}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-700">
                            {sample.stripeSubscriptionId}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-700">
                            {sample.stripeInvoiceId}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {new Date(sample.paidAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
