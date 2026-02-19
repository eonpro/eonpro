'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Activity, Heart, TestTube, Droplets, Sparkles } from 'lucide-react';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';

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

export default function PatientPortalBloodworkReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = use(params);
  const { t } = usePatientPortalLanguage();
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await portalFetch(`/api/patient-portal/bloodwork/${reportId}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await safeParseJson(res);
          setReport(
            data !== null && typeof data === 'object' ? (data as ReportDetail) : null
          );
        } else {
          setError('Report not found');
        }
      } catch {
        if (!cancelled) setError('Failed to load report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getCategoryLabel = (cat: string | null) => {
    if (!cat) return t('bloodworkOther');
    return (
      (t as (k: string) => string)(`bloodwork${cat.charAt(0).toUpperCase() + cat.slice(1)}`) ||
      CATEGORY_LABELS[cat] ||
      cat
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen p-4">
        <Link
          href={`${PATIENT_PORTAL_PATH}/bloodwork`}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> {t('bloodworkYourReports')}
        </Link>
        <p className="mt-4 text-red-600">{error || 'Report not found'}</p>
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

  const categoryOrder = [
    'heart',
    'metabolic',
    'hormones',
    'liver',
    'kidney',
    'blood',
    'nutrients',
    'other',
  ];

  return (
    <div className="min-h-screen p-4 pb-24 md:p-6">
      <div className="mx-auto max-w-3xl">
        <Link
          href={`${PATIENT_PORTAL_PATH}/bloodwork`}
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> {t('bloodworkYourReports')}
        </Link>

        <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">{report.labName}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('bloodworkReportDate')}: {formatDate(report.reportedAt ?? report.createdAt)}
            {report.collectedAt &&
              ` · ${t('bloodworkCollected')}: ${formatDate(report.collectedAt)}`}
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
                        stroke={primaryColor}
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
                <p className="font-medium text-gray-900">{t('bloodworkAllBiomarkers')}</p>
                <p className="mt-1 text-green-600">
                  {t('bloodworkOptimal')}: {optimal}
                </p>
                <p className="text-amber-600">
                  {t('bloodworkInRange')}: {inRange}
                </p>
                <p className="text-red-600">
                  {t('bloodworkOutOfRange')}: {outOfRange}
                </p>
              </div>
            </div>
          </div>

          {/* Results by category */}
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900">{t('bloodworkSummary')}</h2>
            {categoryOrder
              .filter((c) => byCategory[c]?.length)
              .map((cat) => {
                const rows = byCategory[cat];
                const outCount = rows.filter((r) => r.flag === 'H' || r.flag === 'L').length;
                const Icon = CATEGORY_ICONS[cat] || TestTube;
                return (
                  <div
                    key={cat}
                    className="mt-4 rounded-xl border border-gray-200 bg-gray-50/50 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-medium text-gray-900">
                        <Icon className="h-4 w-4 text-gray-500" />
                        {getCategoryLabel(cat)}
                      </span>
                      {outCount > 0 && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          {outCount} {t('bloodworkNeedsAttention')}
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
                    {rows.some((r) => r.referenceRange) && (
                      <p className="mt-2 text-xs text-gray-500">
                        Ref:{' '}
                        {rows
                          .map((r) => r.referenceRange)
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
