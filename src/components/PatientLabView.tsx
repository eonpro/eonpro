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
  CheckCircle2,
  AlertTriangle,
  BarChart3,
  ShieldAlert,
  TrendingUp,
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

interface NumericReferenceRange {
  min?: number;
  max?: number;
}

interface BiomarkerExplanationTemplate {
  what: string;
  next: string;
}

const BIOMARKER_EXPLANATIONS: Record<string, BiomarkerExplanationTemplate> = {
  'TESTOSTERONE, TOTAL, MS': {
    what: 'Total testosterone represents overall androgen status and can influence energy, libido, mood, strength, and body composition.',
    next: 'Review with free testosterone, SHBG, estradiol, symptoms, and current therapy before changing treatment.',
  },
  'TESTOSTERONE, TOTAL': {
    what: 'Total testosterone represents overall androgen status and can influence energy, libido, mood, strength, and body composition.',
    next: 'Review with free testosterone, SHBG, estradiol, symptoms, and current therapy before changing treatment.',
  },
  'TESTOSTERONE, FREE': {
    what: 'Free testosterone estimates the active portion available to tissues and is often more clinically actionable than total alone.',
    next: 'Interpret alongside total testosterone and SHBG, and correlate with symptoms and treatment goals.',
  },
  ESTRADIOL: {
    what: 'Estradiol contributes to bone, cardiovascular, and reproductive physiology in both men and women.',
    next: 'Assess with testosterone balance, symptoms, and medication context rather than as a standalone value.',
  },
  'PSA, TOTAL': {
    what: 'PSA is a prostate marker used for surveillance and trend monitoring.',
    next: 'Prioritize trend over time, age/risk context, and symptoms when deciding follow-up.',
  },
  GLUCOSE: {
    what: 'Glucose reflects short-term glycemic status and helps assess insulin/metabolic risk.',
    next: 'Interpret with fasting status plus A1C, insulin, and triglycerides for a fuller metabolic picture.',
  },
  'BUN/CREATININE RATIO': {
    what: 'The BUN/Creatinine ratio helps evaluate hydration and kidney-related physiology.',
    next: 'Interpret with creatinine, eGFR, hydration status, protein intake, and medications.',
  },
  'HDL CHOLESTEROL': {
    what: 'HDL is one component of cardiometabolic risk and should not be read in isolation.',
    next: 'Interpret with ApoB/LDL, triglycerides, inflammation markers, blood pressure, and overall risk profile.',
  },
  'LDL-CHOLESTEROL': {
    what: 'LDL contributes to atherosclerotic risk and is a key target in preventive cardiology.',
    next: 'Contextualize with ApoB, triglycerides, inflammation markers, and patient-specific risk factors.',
  },
  'CHOLESTEROL, TOTAL': {
    what: 'Total cholesterol is a broad screening marker rather than a definitive risk marker by itself.',
    next: 'Use LDL, HDL, triglycerides, and ApoB to drive actionable risk interpretation.',
  },
};

function parseNumericReferenceRange(referenceRange: string): NumericReferenceRange | null {
  const ref = (referenceRange || '').replace(/,/g, '').replace(/\s+/g, ' ').trim();
  if (!ref) return null;

  const bounded = ref.match(/(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)/);
  if (bounded) {
    return {
      min: Number(bounded[1]),
      max: Number(bounded[2]),
    };
  }

  const lte = ref.match(/^(?:<\s*OR\s*=\s*|<=\s*|<\s*)(-?\d+(?:\.\d+)?)/i);
  if (lte) {
    return { max: Number(lte[1]) };
  }

  const gte = ref.match(/^(?:>\s*OR\s*=\s*|>=\s*|>\s*)(-?\d+(?:\.\d+)?)/i);
  if (gte) {
    return { min: Number(gte[1]) };
  }

  return null;
}

function computeRangePosition(valueNumeric: number, range: NumericReferenceRange): number {
  if (range.min != null && range.max != null && range.max > range.min) {
    const pct = ((valueNumeric - range.min) / (range.max - range.min)) * 100;
    return Math.max(0, Math.min(100, pct));
  }
  if (range.max != null && range.max > 0) {
    const paddedMax = range.max * 1.25;
    return Math.max(0, Math.min(100, (valueNumeric / paddedMax) * 100));
  }
  if (range.min != null) {
    const paddedMax = range.min * 1.5;
    if (paddedMax <= 0) return 0;
    return Math.max(0, Math.min(100, (valueNumeric / paddedMax) * 100));
  }
  return 0;
}

function formatRangeValue(v: number): string {
  return Number.isInteger(v) ? `${v}` : `${v}`;
}

function buildValueContext(row: ResultRow): string {
  if (row.valueNumeric == null) {
    return `Current result is ${row.value}${row.unit ? ` ${row.unit}` : ''}.`;
  }

  const range = parseNumericReferenceRange(row.referenceRange || '');
  if (!range) {
    return `Current result is ${row.value}${row.unit ? ` ${row.unit}` : ''}.`;
  }

  if (row.flag === 'H' && range.max != null) {
    return `Current result is ${row.value}${row.unit ? ` ${row.unit}` : ''}, above the reference upper bound (${formatRangeValue(range.max)}${row.unit ? ` ${row.unit}` : ''}).`;
  }
  if (row.flag === 'L' && range.min != null) {
    return `Current result is ${row.value}${row.unit ? ` ${row.unit}` : ''}, below the reference lower bound (${formatRangeValue(range.min)}${row.unit ? ` ${row.unit}` : ''}).`;
  }
  if (range.min != null && range.max != null) {
    return `Current result is ${row.value}${row.unit ? ` ${row.unit}` : ''}, within the listed reference range (${formatRangeValue(range.min)}-${formatRangeValue(range.max)}${row.unit ? ` ${row.unit}` : ''}).`;
  }
  if (range.max != null) {
    return `Current result is ${row.value}${row.unit ? ` ${row.unit}` : ''} with an upper reference threshold of ${formatRangeValue(range.max)}${row.unit ? ` ${row.unit}` : ''}.`;
  }
  if (range.min != null) {
    return `Current result is ${row.value}${row.unit ? ` ${row.unit}` : ''} with a lower reference threshold of ${formatRangeValue(range.min)}${row.unit ? ` ${row.unit}` : ''}.`;
  }

  return `Current result is ${row.value}${row.unit ? ` ${row.unit}` : ''}.`;
}

function getBiomarkerExplanation(row: ResultRow): string {
  const key = row.testName.toUpperCase();
  const valueContext = buildValueContext(row);
  const exact = BIOMARKER_EXPLANATIONS[key];
  if (exact) {
    return `${valueContext} ${exact.what} ${exact.next}`;
  }

  if (key.includes('TESTOSTERONE')) {
    return `${valueContext} This hormone marker helps evaluate endocrine status and treatment response. Review with related hormones and symptoms before decisions.`;
  }
  if (key.includes('CHOLESTEROL') || key.includes('TRIGLYCERIDE') || key.includes('APOB')) {
    return `${valueContext} This lipid marker contributes to cardiovascular risk assessment and should be interpreted with the full lipid panel and inflammatory/metabolic context.`;
  }
  if (key.includes('GLUCOSE') || key.includes('A1C') || key.includes('INSULIN')) {
    return `${valueContext} This metabolic marker helps evaluate glycemic control and insulin-related risk. Include fasting status and trend over time in interpretation.`;
  }
  if (key.includes('CREATININE') || key.includes('BUN') || key.includes('EGFR')) {
    return `${valueContext} This kidney-related marker helps assess renal function and hydration physiology. Consider medications, hydration status, and trend changes.`;
  }
  return `${valueContext} This biomarker provides clinical context for organ and metabolic function. Interpret with related markers, symptoms, and longitudinal trends.`;
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

const CATEGORY_THEME: Record<
  string,
  { cardBg: string; iconBg: string; iconText: string; bar: string; border: string }
> = {
  heart: {
    cardBg: 'bg-rose-50/70',
    iconBg: 'bg-rose-100',
    iconText: 'text-rose-700',
    bar: 'bg-rose-500',
    border: 'border-rose-200',
  },
  metabolic: {
    cardBg: 'bg-amber-50/70',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    bar: 'bg-amber-500',
    border: 'border-amber-200',
  },
  hormones: {
    cardBg: 'bg-violet-50/70',
    iconBg: 'bg-violet-100',
    iconText: 'text-violet-700',
    bar: 'bg-violet-500',
    border: 'border-violet-200',
  },
  liver: {
    cardBg: 'bg-orange-50/70',
    iconBg: 'bg-orange-100',
    iconText: 'text-orange-700',
    bar: 'bg-orange-500',
    border: 'border-orange-200',
  },
  kidney: {
    cardBg: 'bg-sky-50/70',
    iconBg: 'bg-sky-100',
    iconText: 'text-sky-700',
    bar: 'bg-sky-500',
    border: 'border-sky-200',
  },
  blood: {
    cardBg: 'bg-red-50/70',
    iconBg: 'bg-red-100',
    iconText: 'text-red-700',
    bar: 'bg-red-500',
    border: 'border-red-200',
  },
  nutrients: {
    cardBg: 'bg-emerald-50/70',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-700',
    bar: 'bg-emerald-500',
    border: 'border-emerald-200',
  },
  other: {
    cardBg: 'bg-slate-50/70',
    iconBg: 'bg-slate-100',
    iconText: 'text-slate-700',
    bar: 'bg-slate-500',
    border: 'border-slate-200',
  },
};

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
      const res = await apiFetch(`/api/patients/${patientId}/bloodwork`, {
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
    apiFetch(`/api/patients/${patientId}/bloodwork/${selectedReportId}`, {
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
    apiFetch(`/api/patients/${patientId}/documents/${documentId}`, {
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
          <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-6 md:p-12">
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
    const optimalPct = total > 0 ? Math.round((optimal / total) * 100) : 0;
    const inRangePct = total > 0 ? Math.round((inRange / total) * 100) : 0;
    const attentionPct = total > 0 ? Math.round((outOfRange / total) * 100) : 0;
    const byCategory = results.reduce<Record<string, ResultRow[]>>((acc, r) => {
      const cat = r.category || 'other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(r);
      return acc;
    }, {});
    const categoryStats = CATEGORY_ORDER.filter((c) => byCategory[c]?.length).map((cat) => {
      const rows = byCategory[cat];
      const attention = rows.filter((r) => r.flag === 'H' || r.flag === 'L').length;
      const pct = rows.length > 0 ? Math.round((attention / rows.length) * 100) : 0;
      return {
        category: cat,
        label: CATEGORY_LABELS[cat] || cat,
        total: rows.length,
        attention,
        pct,
      };
    });
    const priorityMarkers = results
      .filter((r) => r.flag === 'H' || r.flag === 'L')
      .sort((a, b) => {
        if (a.category === 'hormones' && b.category !== 'hormones') return -1;
        if (b.category === 'hormones' && a.category !== 'hormones') return 1;
        return a.testName.localeCompare(b.testName);
      })
      .slice(0, 8);
    const dynamicMode = outOfRange > 0 ? 'attention' : 'balanced';
    const heroTone =
      dynamicMode === 'attention'
        ? 'border-rose-200 bg-gradient-to-br from-rose-50 via-white to-amber-50'
        : 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50';
    const keyHormones = results.filter((r) =>
      ['TESTOSTERONE, TOTAL, MS', 'TESTOSTERONE, TOTAL', 'TESTOSTERONE, FREE', 'ESTRADIOL', 'PSA, TOTAL'].includes(
        r.testName
      )
    );

    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to lab results
        </button>

        <div className={`rounded-2xl border p-4 shadow-sm md:p-6 ${heroTone}`}>
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
          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-600">
              <span className="inline-flex items-center gap-1">
                <BarChart3 className="h-3.5 w-3.5" /> Clinical distribution
              </span>
              <span>{total} total markers</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div className="flex h-full">
                <div style={{ width: `${optimalPct}%` }} className="bg-green-500" />
                <div style={{ width: `${Math.max(0, inRangePct - optimalPct)}%` }} className="bg-emerald-300" />
                <div style={{ width: `${attentionPct}%` }} className="bg-red-500" />
              </div>
            </div>
            <div className="mt-2 grid gap-2 text-xs text-gray-600 sm:grid-cols-3">
              <p>Optimal: {optimalPct}%</p>
              <p>In range: {inRangePct}%</p>
              <p>Needs attention: {attentionPct}%</p>
            </div>
          </div>

          {/* Results by category */}
          <div className="mt-8">
            <h3 className="text-lg font-semibold text-gray-900">Results by category</h3>
            {categoryStats.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {categoryStats.map((s) => {
                  const Icon = CATEGORY_ICONS[s.category] || TestTube;
                  const theme = CATEGORY_THEME[s.category] || CATEGORY_THEME.other;
                  return (
                    <button
                      key={`card-${s.category}`}
                      type="button"
                      onClick={() => {
                        const el = document.getElementById(`category-${s.category}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={`rounded-xl border p-3 text-left transition hover:shadow-md ${theme.cardBg} ${theme.border}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center gap-2 text-sm font-semibold ${theme.iconText}`}>
                          <span className={`rounded-lg p-1.5 ${theme.iconBg}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          {s.label}
                        </span>
                        <span className="text-xs font-medium text-gray-600">{s.total} tests</span>
                      </div>
                      <p className="mt-2 text-xs text-gray-600">
                        {s.attention > 0 ? `${s.attention} need attention` : 'All in range'}
                      </p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/90">
                        <div className={`h-full ${theme.bar}`} style={{ width: `${Math.max(6, s.pct)}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <TrendingUp className="h-4 w-4 text-gray-500" />
                  Enterprise clinical overview
                </p>
                <p className="text-xs text-gray-500">Prioritized by out-of-range burden</p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500">Biomarkers</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{total}</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-xs font-medium text-green-700">Stable (in range)</p>
                  <p className="mt-1 text-2xl font-bold text-green-700">{inRange}</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-medium text-red-700">Needs attention</p>
                  <p className="mt-1 text-2xl font-bold text-red-700">{outOfRange}</p>
                </div>
              </div>

              {categoryStats.length > 0 && (
                <div className="mt-4 grid gap-2">
                  {categoryStats
                    .slice()
                    .sort((a, b) => b.attention - a.attention || b.total - a.total)
                    .map((s) => (
                      <div key={`stats-${s.category}`} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-700">{s.label}</span>
                          <span className={s.attention > 0 ? 'font-semibold text-red-600' : 'font-medium text-green-700'}>
                            {s.attention}/{s.total} flagged
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={s.attention > 0 ? 'h-full bg-red-500' : 'h-full bg-green-500'}
                            style={{ width: `${Math.max(3, s.pct)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {priorityMarkers.length > 0 && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-red-800">
                  <ShieldAlert className="h-4 w-4" />
                  Priority markers
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {priorityMarkers.map((r) => (
                    <div key={`priority-${r.id}`} className="rounded-lg border border-red-100 bg-white px-3 py-2">
                      <p className="text-sm font-semibold text-gray-900">{r.testName}</p>
                      <p className="text-xs text-gray-500">Reference: {r.referenceRange || '—'}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <p className="text-sm font-bold text-red-700">
                          {r.value} {r.unit}
                        </p>
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          {r.flag === 'H' ? 'High' : 'Low'}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-gray-700">{getBiomarkerExplanation(r)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {keyHormones.length > 0 && (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {keyHormones.map((r) => {
                  const isOutOfRange = r.flag === 'H' || r.flag === 'L';
                  return (
                    <div
                      key={`key-${r.id}`}
                      className={`rounded-xl border p-3 ${
                        isOutOfRange
                          ? 'border-red-200 bg-gradient-to-br from-red-50 to-white'
                          : 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
                      }`}
                    >
                      <p className="text-xs font-medium tracking-wide text-gray-500">Key marker</p>
                      <p className="mt-1 text-sm font-semibold text-gray-900">{r.testName}</p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className={isOutOfRange ? 'text-lg font-bold text-red-600' : 'text-lg font-bold text-gray-900'}>
                          {r.value} {r.unit}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
                            isOutOfRange ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {isOutOfRange ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          {isOutOfRange ? (r.flag === 'H' ? 'High' : 'Low') : 'In range'}
                        </span>
                      </div>
                      {r.referenceRange && <p className="mt-1 text-xs text-gray-500">Ref: {r.referenceRange}</p>}
                      <p className="mt-2 text-xs leading-relaxed text-gray-700">{getBiomarkerExplanation(r)}</p>
                    </div>
                  );
                })}
              </div>
            )}
            {CATEGORY_ORDER.filter((c) => byCategory[c]?.length).map((cat) => {
              const rows = byCategory[cat];
              const outCount = rows.filter((r) => r.flag === 'H' || r.flag === 'L').length;
              const Icon = CATEGORY_ICONS[cat] || TestTube;
              const theme = CATEGORY_THEME[cat] || CATEGORY_THEME.other;
              return (
                <div
                  id={`category-${cat}`}
                  key={cat}
                  className={`mt-4 rounded-xl border p-4 ${theme.border} ${theme.cardBg}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`flex items-center gap-2 font-medium ${theme.iconText}`}>
                      <span className={`rounded-lg p-1.5 ${theme.iconBg}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      {CATEGORY_LABELS[cat] || cat}
                    </span>
                    {outCount > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        {outCount} need attention
                      </span>
                    )}
                  </div>
                  <ul className="mt-3 space-y-2">
                    {rows.map((r) => {
                      const range = parseNumericReferenceRange(r.referenceRange);
                      const hasGraphic = r.valueNumeric != null && range != null;
                      const markerPos = hasGraphic ? computeRangePosition(r.valueNumeric!, range) : 0;
                      const isOutOfRange = r.flag === 'H' || r.flag === 'L';
                      return (
                        <li key={r.id} className="rounded-lg bg-white px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-700">{r.testName}</span>
                            <span className="flex items-center gap-2">
                              <span className={isOutOfRange ? 'font-semibold text-red-600' : 'font-semibold text-gray-900'}>
                                {r.value} {r.unit}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                  isOutOfRange
                                    ? r.flag === 'H'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-amber-100 text-amber-700'
                                    : 'bg-green-100 text-green-700'
                                }`}
                              >
                                {isOutOfRange ? (r.flag === 'H' ? 'High' : 'Low') : 'In range'}
                              </span>
                            </span>
                          </div>
                          {r.referenceRange && <p className="mt-1 text-xs text-gray-500">Reference: {r.referenceRange}</p>}
                          {hasGraphic && (
                            <div className="mt-2">
                              <div className="relative h-2 rounded-full bg-gray-200">
                                <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-gradient-to-r from-green-200 via-green-300 to-green-200" />
                                <span
                                  className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white shadow ${
                                    isOutOfRange ? 'bg-red-500' : 'bg-[var(--brand-primary,#4fa77e)]'
                                  }`}
                                  style={{ left: `calc(${markerPos}% - 6px)` }}
                                />
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
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
        <p className="text-sm text-gray-600">Supported labs: Quest, Rythm, Access — parsed results</p>
      </div>

      {listError && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 border border-amber-200">
          {listError}
        </div>
      )}

      {/* Flagship hero: latest report summary or empty state */}
      <div
        className="rounded-2xl border-2 border-gray-200 bg-white p-4 shadow-sm md:p-6"
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
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-6">
        <h2 className="text-lg font-semibold text-gray-900">Upload lab report</h2>
        <p className="mt-1 text-sm text-gray-600">
          PDF only (Quest, Rythm, or Access). The patient name on the report must match this profile ({patientName}).
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
          <div className="flex flex-col items-center justify-center p-6 text-center text-gray-500 md:p-12">
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
