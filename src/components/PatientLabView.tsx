'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Upload,
  TestTube,
  ChevronRight,
  ArrowLeft,
  Activity,
  Heart,
  Droplets,
  Sparkles,
  FileText,
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { getAuthHeaders as getAuthHeadersFromUtil } from '@/lib/utils/auth-token';
import { apiFetch } from '@/lib/api/fetch';

const PRIMARY = 'var(--brand-primary, #4fa77e)';

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const headers = getAuthHeadersFromUtil();
  if (typeof headers === 'object' && headers !== null && !Array.isArray(headers)) {
    return headers as Record<string, string>;
  }
  return {};
}

interface LabReportSummary {
  id: number;
  documentId: number | null;
  labName: string;
  reportedAt: string | null;
  createdAt: string;
  resultCount: number;
}

interface ResultRow {
  id: number;
  testName: string;
  value: string;
  valueNumeric: number | null;
  unit: string;
  referenceRange: string;
  flag: string | null;
  category: string | null;
}

interface ReportDetail {
  id: number;
  documentId?: number | null;
  labName: string;
  specimenId: string | null;
  collectedAt: string | null;
  reportedAt: string | null;
  fasting: boolean | null;
  createdAt: string;
  results: ResultRow[];
  summary: { total: number; optimal: number; inRange: number; outOfRange: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  heart: 'Heart',
  metabolic: 'Metabolic',
  hormones: 'Hormones',
  liver: 'Liver',
  kidney: 'Kidney',
  blood: 'Blood',
  nutrients: 'Nutrients',
  other: 'Other',
};

const CATEGORY_ICONS: Record<string, typeof Heart> = {
  heart: Heart,
  metabolic: Activity,
  hormones: Sparkles,
  liver: Droplets,
  kidney: Droplets,
  blood: TestTube,
  nutrients: TestTube,
  other: TestTube,
};

const CATEGORY_ORDER = [
  'heart',
  'metabolic',
  'hormones',
  'liver',
  'kidney',
  'blood',
  'nutrients',
  'other',
];

interface PatientLabViewProps {
  patientId: number;
  patientName: string;
}

export default function PatientLabView({ patientId, patientName }: PatientLabViewProps) {
  const [reports, setReports] = useState<LabReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [reportDetail, setReportDetail] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      setListError(null);
      const res = await fetch(`/api/patients/${patientId}/bloodwork`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReports(data.reports ?? []);
      } else {
        setReports([]);
        setListError(
          typeof data?.error === 'string' ? data.error : 'Could not load lab reports. Please try again.'
        );
      }
    } catch {
      setReports([]);
      setListError('Could not load lab reports. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    if (selectedReportId == null) {
      setReportDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setReportDetail(null);
    fetch(`/api/patients/${patientId}/bloodwork/${selectedReportId}`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Not found'))))
      .then((data) => {
        if (!cancelled) {
          setReportDetail(data);
        }
      })
      .catch(() => {
        if (!cancelled) setReportDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, selectedReportId]);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      const file = files[0];
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setUploadError('Please upload a PDF file (Quest Diagnostics bloodwork report).');
        return;
      }
      setUploadError(null);
      setUploadSuccess(false);
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await apiFetch(`/api/patients/${patientId}/bloodwork/upload`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.labReportId) {
          setUploadSuccess(true);
          fetchReports();
          setTimeout(() => setUploadSuccess(false), 3000);
        } else {
          setUploadError(
            data.error ||
              'Upload failed. The patient name on the report may not match this profile.'
          );
        }
      } catch (e: unknown) {
        if ((e as { isAuthError?: boolean })?.isAuthError) {
          // Session expired - SessionExpirationHandler modal will show
          return;
        }
        logger.error('Bloodwork upload error', { error: e });
        setUploadError('Upload failed. Please try again.');
      } finally {
        setUploading(false);
      }
    },
    [patientId, fetchReports]
  );

  const openPdf = useCallback(
    (documentId: number) => {
      fetch(`/api/patients/${patientId}/documents/${documentId}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      })
        .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('Failed'))))
        .then((blob) => {
          const url = window.URL.createObjectURL(blob);
          window.open(url, '_blank');
        })
        .catch(() => alert('Could not open PDF.'));
    },
    [patientId]
  );

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const latestReport = reports[0] ?? null;

  // Detail view (selected report)
  if (selectedReportId != null) {
    const report = reportDetail;
    const back = () => setSelectedReportId(null);

    if (detailLoading || !report) {
      return (
        <div className="space-y-6">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back to lab results
          </button>
          <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-12">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600"
              style={{ borderTopColor: PRIMARY }}
            />
          </div>
        </div>
      );
    }

    const { summary, results } = report;
    const total = summary.total || results.length;
    const optimal = summary.optimal ?? results.filter((r) => !r.flag).length;
    const outOfRange =
      summary.outOfRange ?? results.filter((r) => r.flag === 'H' || r.flag === 'L').length;
    const inRange = total - outOfRange;
    const byCategory = results.reduce<Record<string, ResultRow[]>>((acc, r) => {
      const cat = r.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(r);
      return acc;
    }, {});

    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to lab results
        </button>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">{report.labName}</h2>
          <p className="mt-1 text-sm text-gray-500">
            Report date: {formatDate(report.reportedAt ?? report.createdAt)}
            {report.collectedAt && ` · Collected: ${formatDate(report.collectedAt)}`}
          </p>

          {/* Summary ring */}
          <div className="mt-6 flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-20">
                <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
                  <path
                    d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="3"
                  />
                  {total > 0 && (
                    <>
                      <path
                        d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
                        fill="none"
                        stroke={PRIMARY}
                        strokeWidth="3"
                        strokeDasharray={`${(optimal / total) * 100} 100`}
                        strokeDashoffset="0"
                      />
                      <path
                        d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="3"
                        strokeDasharray={`${(inRange / total) * 100} 100`}
                        strokeDashoffset={`${-(optimal / total) * 100}`}
                      />
                      <path
                        d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="3"
                        strokeDasharray={`${(outOfRange / total) * 100} 100`}
                        strokeDashoffset={`${-((optimal + inRange) / total) * 100}`}
                      />
                    </>
                  )}
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-gray-700">
                  {total}
                </span>
              </div>
              <div className="text-sm">
                <p className="font-medium text-gray-900">Biomarkers</p>
                <p className="mt-1 text-green-600">Optimal: {optimal}</p>
                <p className="text-amber-600">In range: {inRange}</p>
                <p className="text-red-600">Out of range: {outOfRange}</p>
              </div>
            </div>
            {report.documentId != null && (
              <button
                type="button"
                onClick={() => openPdf(report.documentId!)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <FileText className="h-4 w-4" /> View PDF
              </button>
            )}
          </div>

          {/* Results by category */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-gray-900">Results by category</h3>
            {CATEGORY_ORDER.filter((c) => byCategory[c]?.length).map((cat) => {
              const rows = byCategory[cat];
              const outCount = rows.filter((r) => r.flag === 'H' || r.flag === 'L').length;
              const Icon = CATEGORY_ICONS[cat] || TestTube;
              return (
                <div key={cat} className="mt-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium text-gray-900">
                      <Icon className="h-4 w-4 text-gray-500" />
                      {CATEGORY_LABELS[cat] || cat}
                    </span>
                    {outCount > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        {outCount} need attention
                      </span>
                    )}
                  </div>
                  <ul className="mt-3 space-y-2">
                    {rows.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm"
                      >
                        <span className="text-gray-700">{r.testName}</span>
                        <span className="flex items-center gap-2">
                          <span
                            className={
                              r.flag === 'H' || r.flag === 'L'
                                ? 'font-semibold text-red-600'
                                : 'font-medium text-gray-900'
                            }
                          >
                            {r.value} {r.unit}
                          </span>
                          {r.flag && (
                            <span
                              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                r.flag === 'H'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {r.flag === 'H' ? 'High' : 'Low'}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Main lab tab: flagship widget
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Lab Results</h1>
        <p className="text-sm text-gray-600">Quest bloodwork — parsed results</p>
      </div>

      {listError && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200">
          {listError}
        </div>
      )}

      {/* Flagship hero: latest report summary or empty state */}
      <div
        className="rounded-2xl border-2 border-gray-200 bg-white p-6 shadow-sm"
        style={{
          borderColor: latestReport
            ? 'var(--brand-primary-light, rgba(79, 167, 126, 0.3))'
            : undefined,
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'var(--brand-primary-light, rgba(79, 167, 126, 0.15))' }}
          >
            <TestTube className="h-7 w-7" style={{ color: PRIMARY }} />
          </div>
          <div className="min-w-0 flex-1">
            {latestReport ? (
              <>
                <h2 className="text-lg font-semibold text-gray-900">Latest report</h2>
                <p className="text-sm text-gray-500">
                  {latestReport.labName} · {formatDate(latestReport.reportedAt)} ·{' '}
                  {latestReport.resultCount} results
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedReportId(latestReport.id)}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium"
                  style={{ color: PRIMARY }}
                >
                  View full report <ChevronRight className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-gray-900">No lab reports yet</h2>
                <p className="text-sm text-gray-500">
                  Upload a Quest Diagnostics PDF to see parsed results here.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Upload */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Upload Quest bloodwork</h2>
        <p className="mt-1 text-sm text-gray-600">
          PDF only. The patient name on the report must match this profile ({patientName}).
        </p>
        {uploadError && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{uploadError}</div>
        )}
        {uploadSuccess && (
          <div className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
            Report uploaded and parsed.
          </div>
        )}
        <div className="mt-4">
          <input
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            id="lab-upload"
            disabled={uploading}
            onChange={(e) => {
              handleUpload(e.target.files);
              e.target.value = '';
            }}
          />
          <label
            htmlFor="lab-upload"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 px-6 py-4 transition-colors hover:border-gray-400 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-60"
            style={
              {
                ['--tw-border-color']: 'var(--brand-primary, #4fa77e)',
              } as React.CSSProperties
            }
          >
            <Upload className="h-5 w-5 text-gray-500" />
            <span className="font-medium text-gray-700">
              {uploading ? 'Uploading…' : 'Choose PDF or drag and drop'}
            </span>
          </label>
        </div>
      </div>

      {/* Report list */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">All reports</h2>
        </div>
        {loading ? (
          <div className="flex justify-center p-8">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200"
              style={{ borderTopColor: PRIMARY }}
            />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-gray-500">
            <TestTube className="mb-2 h-12 w-12 text-gray-300" />
            <p>No lab reports yet. Upload a Quest PDF above.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {reports.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-gray-50/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">{r.labName}</p>
                  <p className="text-sm text-gray-500">
                    {formatDate(r.reportedAt)} · {r.resultCount} results
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.documentId != null && (
                    <button
                      type="button"
                      onClick={() => openPdf(r.documentId!)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      PDF
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedReportId(r.id)}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                    style={{ backgroundColor: PRIMARY }}
                  >
                    View <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
