'use client';

import { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, ChevronRight, Activity, Heart, TestTube } from 'lucide-react';
import Link from 'next/link';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { portalFetch, getPortalResponseError, SESSION_EXPIRED_MESSAGE } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';

interface LabReportSummary {
  id: number;
  labName: string;
  specimenId: string | null;
  collectedAt: string | null;
  reportedAt: string | null;
  fasting: boolean | null;
  createdAt: string;
  resultCount: number;
}

export default function PatientPortalBloodworkPage() {
  const { t } = usePatientPortalLanguage();
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  const [reports, setReports] = useState<LabReportSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      const res = await portalFetch('/api/patient-portal/bloodwork');
      const sessionErr = getPortalResponseError(res);
      if (sessionErr) {
        setError(sessionErr);
        setIsLoading(false);
        return;
      }
      if (res.ok) {
        const data = await safeParseJson(res);
        const list =
          data !== null && typeof data === 'object' && 'reports' in data
            ? (data as { reports?: LabReportSummary[] }).reports
            : undefined;
        setReports(Array.isArray(list) ? list : []);
        setError(null);
      }
    } catch {
      setReports([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleFiles = useCallback(
    async (files: FileList) => {
      const file = files[0];
      if (!file || file.type !== 'application/pdf') {
        setError(t('bloodworkUploadError'));
        return;
      }
      setError(null);
      setIsUploading(true);
      setUploadSuccess(false);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await portalFetch('/api/patient-portal/bloodwork/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await safeParseJson(res);
        if (res.ok && data !== null && typeof data === 'object' && 'success' in data && (data as { success?: boolean }).success) {
          setUploadSuccess(true);
          fetchReports();
        } else {
          const errMsg =
            data !== null && typeof data === 'object' && 'error' in data
              ? String((data as { error?: unknown }).error)
              : t('bloodworkUploadError');
          setError(errMsg);
        }
      } catch {
        setError(t('bloodworkUploadError'));
      } finally {
        setIsUploading(false);
      }
    },
    [t, fetchReports]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files?.[0]) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gray-50/80 p-4 pb-24 md:p-6">
      <div className="mx-auto max-w-3xl">
        {error === SESSION_EXPIRED_MESSAGE && (
          <div
            className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
            role="alert"
          >
            <p className="flex-1 text-sm font-medium text-amber-900">{error}</p>
            <Link
              href={`/login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/bloodwork`)}&reason=session_expired`}
              className="shrink-0 rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-300"
            >
              Log in
            </Link>
          </div>
        )}
        <h1 className="text-2xl font-bold text-gray-900">{t('bloodworkTitle')}</h1>
        <p className="mt-1 text-sm text-gray-600">{t('bloodworkSubtitle')}</p>

        {/* Upload zone */}
        <div
          className="mt-6 rounded-2xl border-2 border-dashed p-8 text-center transition-colors"
          style={{
            borderColor: dragActive ? primaryColor : 'var(--border-color, #e5e7eb)',
            backgroundColor: dragActive ? `${primaryColor}08` : 'var(--bg, #fafafa)',
          }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            id="bloodwork-upload"
            disabled={isUploading}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
          <label htmlFor="bloodwork-upload" className="cursor-pointer">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 font-medium text-gray-700">{t('bloodworkUpload')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('bloodworkDragDrop')}</p>
            {isUploading && <p className="mt-2 text-sm text-gray-600">{t('bloodworkUploading')}</p>}
          </label>
          {uploadSuccess && (
            <p className="mt-2 text-sm font-medium text-green-600">{t('bloodworkUploadSuccess')}</p>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        {/* Report list */}
        <h2 className="mt-8 text-lg font-semibold text-gray-900">{t('bloodworkYourReports')}</h2>
        {isLoading ? (
          <div className="mt-4 flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
          </div>
        ) : reports.length === 0 ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-8 text-center">
            <TestTube className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 font-medium text-gray-600">{t('bloodworkNoReports')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('bloodworkNoReportsDesc')}</p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`${PATIENT_PORTAL_PATH}/bloodwork/${r.id}`}
                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${primaryColor}20` }}
                    >
                      <FileText className="h-5 w-5" style={{ color: primaryColor }} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{r.labName}</p>
                      <p className="text-sm text-gray-500">
                        {t('bloodworkReportDate')}: {formatDate(r.reportedAt ?? r.createdAt)} ·{' '}
                        {r.resultCount} {t('bloodworkBiomarkers')}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
