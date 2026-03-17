'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Camera,
  Search,
  Package,
  CheckCircle,
  XCircle,
  Loader2,
  X,
  User,
  ChevronLeft,
  ChevronRight,
  SwitchCamera,
  Image as ImageIcon,
  RefreshCw,
  Truck,
  ExternalLink,
  Copy,
  Clock,
  Calendar,
  ArrowUpDown,
  Shield,
  Download,
  BarChart3,
  TrendingUp,
  Users,
  ChevronDown,
  ChevronUp,
  Activity,
  CalendarDays,
  FileDown,
  Table,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PackagePhotoRecord {
  id: number;
  lifefileId: string;
  trackingNumber: string | null;
  trackingSource: string | null;
  matched: boolean;
  matchStrategy: string | null;
  s3Url: string | null;
  s3Key: string;
  contentType: string;
  notes: string | null;
  createdAt: string;
  capturedBy: { id: number; firstName: string; lastName: string; email: string };
  patient: { id: number; firstName: string; lastName: string } | null;
  order: { id: number; lifefileOrderId: string | null; status: string | null; trackingNumber: string | null } | null;
}

interface UploadResult {
  id: number;
  lifefileId: string;
  trackingNumber: string | null;
  trackingSource: string | null;
  matched: boolean;
  matchStrategy: string | null;
  patientId: number | null;
  orderId: number | null;
  s3Url: string;
  createdAt: string;
}

interface AuditStats {
  today: number;
  yesterday: number;
  thisWeek: number;
  thisMonth: number;
  matched: number;
  total: number;
  matchRate: number;
  unmatched: number;
}

interface DailyVolume {
  date: string;
  total: number;
  matched: number;
  unmatched: number;
}

interface RepBreakdown {
  userId: number;
  name: string;
  total: number;
  matched: number;
  matchRate: number;
}

interface TrackingSourceBreakdown {
  source: string;
  total: number;
}

interface Demographics {
  dailyVolume: DailyVolume[];
  avgDaily: number;
  repBreakdown: RepBreakdown[];
  trackingSourceBreakdown: TrackingSourceBreakdown[];
  monthlyMatchRate: { matched: number; unmatched: number; total: number; rate: number };
  hourlyDistribution: Array<{ hour: number; total: number }>;
  peakHour: { hour: number; count: number };
}

interface DailyReportDay {
  date: string;
  total: number;
  matched: number;
  unmatched: number;
  matchRate: number;
  reps: Array<{ name: string; total: number; matched: number }>;
}

interface DailyReportData {
  days: DailyReportDay[];
  summary: {
    totalDays: number;
    totalPackages: number;
    totalMatched: number;
    totalUnmatched: number;
    matchRate: number;
    avgPerDay: number;
  };
  range: { from: string; to: string };
}

interface PerformanceInterval {
  label: string;
  date?: string;
  hour?: number;
  total: number;
  matched: number;
  unmatched: number;
  matchRate: number;
  reps: Array<{ userId: number; name: string; total: number; matched: number }>;
}

interface PerformanceRepSummary {
  userId: number;
  name: string;
  total: number;
  matched: number;
  matchRate: number;
}

interface PerformanceReportData {
  intervals: PerformanceInterval[];
  summary: {
    totalPackages: number;
    totalMatched: number;
    totalUnmatched: number;
    matchRate: number;
    avgPerInterval: number;
    totalReps: number;
    topRep: { userId: number; name: string; total: number; matched: number } | null;
  };
  reps: PerformanceRepSummary[];
  range: { from: string; to: string };
  granularity: string;
}

type Granularity = 'hourly' | 'daily' | 'weekly';

// ---------------------------------------------------------------------------
// Constants & Helpers
// ---------------------------------------------------------------------------

const TRACKING_SOURCE_LABELS: Record<string, string> = {
  order: 'Order Record',
  lifefile_webhook: 'LifeFile Webhook',
  shipping_update: 'Shipping Update',
  fedex_label: 'FedEx Label',
  manual: 'Manual Entry',
};

type CaptureStep = 'lifefileId' | 'camera' | 'preview' | 'uploading' | 'done';

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diffMs / 60000);
  const hr = Math.floor(diffMs / 3600000);
  const day = Math.floor(diffMs / 86400000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getAuthToken(): string {
  return localStorage.getItem('auth-token') || localStorage.getItem('pharmacy_rep-token') || '';
}

async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  try {
    return await apiFetch(url, options);
  } catch {
    return await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        ...options.headers,
        Authorization: `Bearer ${getAuthToken()}`,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Shared: Photo Thumbnail — uses server-side proxy to avoid S3/CloudFront URL issues
// ---------------------------------------------------------------------------

function PhotoThumbnail({ photoId, s3Key, size }: { photoId: number; s3Key: string; size: 'sm' | 'full' }) {
  const [failed, setFailed] = useState(false);
  const src = s3Key ? `/api/package-photos/${photoId}/image` : '';

  if (!s3Key || failed) {
    if (size === 'sm') {
      return (
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
          <ImageIcon className="h-5 w-5 text-gray-300" />
        </div>
      );
    }
    return (
      <div className="flex aspect-video items-center justify-center bg-gray-800">
        <div className="text-center">
          <ImageIcon className="mx-auto h-12 w-12 text-gray-600" />
          <p className="mt-2 text-xs text-gray-500">Photo not available</p>
        </div>
      </div>
    );
  }

  if (size === 'sm') {
    return (
      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} loading="lazy" />
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} alt={`Package photo #${photoId}`} className="w-full" onError={() => setFailed(true)} />
  );
}

// ---------------------------------------------------------------------------
// Shared: Copy Button
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="ml-1.5 inline-flex items-center rounded p-0.5 text-gray-400 transition-colors hover:text-violet-600"
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Shared: Step Indicator
// ---------------------------------------------------------------------------

const STEPS = [
  { key: 'lifefileId', label: 'Scan ID', icon: Package },
  { key: 'camera', label: 'Photograph', icon: Camera },
  { key: 'done', label: 'Confirm', icon: CheckCircle },
] as const;

function getStepIndex(step: CaptureStep): number {
  if (step === 'lifefileId') return 0;
  if (step === 'camera' || step === 'preview' || step === 'uploading') return 1;
  return 2;
}

function StepIndicator({ step }: { step: CaptureStep }) {
  const activeIdx = getStepIndex(step);
  return (
    <div className="mb-6 flex items-center justify-center">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <div key={s.key} className="flex items-center">
            {i > 0 && (
              <div className={`mx-1.5 h-px w-10 transition-colors sm:mx-2 sm:w-14 ${i <= activeIdx ? 'bg-violet-400' : 'bg-gray-200'}`} />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                  done
                    ? 'bg-violet-600 text-white shadow-sm'
                    : active
                      ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-500 ring-offset-1'
                      : 'bg-gray-100 text-gray-300'
                }`}
              >
                {done ? <CheckCircle className="h-4.5 w-4.5" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={`text-[10px] font-semibold tracking-wide ${active ? 'text-violet-700' : done ? 'text-violet-500' : 'text-gray-300'}`}>
                {s.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PackagePhotosPage() {
  const [mode, setMode] = useState<'capture' | 'audit'>('capture');
  const [sessionCount, setSessionCount] = useState(0);

  return (
    <div className="mx-auto max-w-6xl px-3 py-3 sm:px-6 sm:py-5">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between sm:mb-5">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 sm:h-10 sm:w-10">
            <Package className="h-4.5 w-4.5 text-violet-600 sm:h-5 sm:w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 sm:text-xl">
              {mode === 'capture' ? 'Package Photos' : 'Audit Log'}
            </h1>
            <p className="hidden text-xs text-gray-500 sm:block">
              {mode === 'capture'
                ? 'Scan, photograph, and track outgoing packages'
                : 'Search and investigate package records'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {mode === 'capture' && sessionCount > 0 && (
            <span className="hidden rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 sm:inline-flex">
              {sessionCount} scanned
            </span>
          )}
          <button
            onClick={() => setMode(mode === 'capture' ? 'audit' : 'capture')}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100 sm:py-2"
          >
            {mode === 'capture' ? (
              <>
                <Search className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                <span>Audit Log</span>
              </>
            ) : (
              <>
                <Camera className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                <span>Capture</span>
              </>
            )}
          </button>
        </div>
      </div>

      {mode === 'capture' ? (
        <CaptureFlow sessionCount={sessionCount} onCaptured={() => setSessionCount((c) => c + 1)} />
      ) : (
        <AuditLog />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capture Flow — 3-step: Scan ID → Photograph → Confirm
// ---------------------------------------------------------------------------

function CaptureFlow({
  sessionCount,
  onCaptured,
}: {
  sessionCount: number;
  onCaptured: () => void;
}) {
  const [step, setStep] = useState<CaptureStep>('lifefileId');
  const [lifefileId, setLifefileId] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [capturedImage, setCapturedImage] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [trackingSaved, setTrackingSaved] = useState(false);
  const idInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('lifefileId');
    setLifefileId('');
    setTrackingNumber('');
    setCapturedImage(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setUploadResult(null);
    setError(null);
    setTrackingSaving(false);
    setTrackingSaved(false);
    setTimeout(() => idInputRef.current?.focus(), 50);
  }, [previewUrl]);

  const handleCapture = useCallback((blob: Blob) => {
    setCapturedImage(blob);
    setPreviewUrl(URL.createObjectURL(blob));
    setStep('preview');
  }, []);

  const handleRetake = useCallback(() => {
    setCapturedImage(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStep('camera');
  }, [previewUrl]);

  const handleUpload = useCallback(async () => {
    if (!capturedImage || !lifefileId.trim()) return;
    setStep('uploading');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('lifefileId', lifefileId.trim());
      formData.append('photo', capturedImage, `package-${lifefileId.trim()}.jpg`);

      const res = await authenticatedFetch('/api/package-photos', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }

      const json = await res.json();
      setUploadResult(json.data);
      if (json.data.trackingNumber) setTrackingNumber(json.data.trackingNumber);
      onCaptured();
      setStep('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setStep('preview');
    }
  }, [capturedImage, lifefileId, onCaptured]);

  const handleSaveTracking = useCallback(async () => {
    if (!uploadResult || !trackingNumber.trim()) return;
    setTrackingSaving(true);
    setError(null);

    try {
      const res = await authenticatedFetch(`/api/package-photos/${uploadResult.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingNumber: trackingNumber.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to save' }));
        throw new Error(err.error || 'Failed to save');
      }

      const json = await res.json();
      setUploadResult((prev) =>
        prev ? { ...prev, trackingNumber: json.data.trackingNumber, trackingSource: json.data.trackingSource } : prev,
      );
      setTrackingSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save tracking.');
    } finally {
      setTrackingSaving(false);
    }
  }, [uploadResult, trackingNumber]);

  const captureTimestamp = uploadResult ? formatTimestamp(uploadResult.createdAt) : '';

  return (
    <div className="mx-auto sm:max-w-lg">
      <StepIndicator step={step} />

      {/* ── Step 1: Scan LifeFile ID ─────────────────────────── */}
      {step === 'lifefileId' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <label htmlFor="lifefileId" className="mb-2 block text-sm font-semibold text-gray-900">
            LifeFile ID
          </label>
          <input
            ref={idInputRef}
            id="lifefileId"
            type="text"
            inputMode="text"
            value={lifefileId}
            onChange={(e) => setLifefileId(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && lifefileId.trim()) setStep('camera'); }}
            placeholder="Scan or type the package ID"
            autoFocus
            autoComplete="off"
            className="mb-4 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-5 text-center font-mono text-2xl font-bold tracking-widest text-gray-900 placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 sm:py-4"
          />
          <button
            onClick={() => setStep('camera')}
            disabled={!lifefileId.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-5 text-base font-bold text-white shadow-sm transition-all hover:bg-violet-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none sm:py-4 sm:text-sm"
          >
            <Camera className="h-6 w-6 sm:h-5 sm:w-5" />
            Take Photo
          </button>
          {sessionCount > 0 && (
            <p className="mt-3 text-center text-xs text-gray-400">
              {sessionCount} package{sessionCount !== 1 ? 's' : ''} scanned this session
            </p>
          )}
        </div>
      )}

      {/* ── Step 2a: Camera ──────────────────────────────────── */}
      {step === 'camera' && (
        <CameraCapture onCapture={handleCapture} onCancel={() => setStep('lifefileId')} lifefileId={lifefileId} />
      )}

      {/* ── Step 2b: Preview ─────────────────────────────────── */}
      {step === 'preview' && previewUrl && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Package preview" className="w-full" />
            {/* Metadata stamp overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-4 pb-3 pt-10">
              <div className="flex items-end justify-between text-white">
                <span className="font-mono text-sm font-bold tracking-wide">ID: {lifefileId}</span>
                <span className="text-[11px] opacity-80">
                  {new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700">
              <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 p-4">
            <button
              onClick={handleRetake}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-4 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 active:bg-gray-100 sm:py-3 sm:text-xs"
            >
              <RefreshCw className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              Retake
            </button>
            <button
              onClick={handleUpload}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 py-4 text-base font-bold text-white shadow-sm transition-all hover:bg-violet-700 active:scale-[0.98] sm:py-3 sm:text-sm"
            >
              <CheckCircle className="h-5 w-5 sm:h-4 sm:w-4" />
              Upload Photo
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2c: Uploading ───────────────────────────────── */}
      {step === 'uploading' && (
        <div className="flex flex-col items-center rounded-2xl border border-gray-200 bg-white py-16 shadow-sm">
          <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
          <p className="mt-4 text-sm font-medium text-gray-500">Uploading&hellip;</p>
        </div>
      )}

      {/* ── Step 3: Done — Tracking + Confirmation ───────────── */}
      {step === 'done' && uploadResult && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {/* Success header */}
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-4 text-white">
            <div className="flex items-center gap-2.5">
              <Shield className="h-5 w-5" />
              <div>
                <p className="text-sm font-bold">Photo Recorded</p>
                <p className="text-[11px] opacity-85">{captureTimestamp}</p>
              </div>
            </div>
          </div>

          <div className="p-5">
            {/* Audit summary */}
            <div className="mb-4 space-y-2.5 rounded-xl bg-gray-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">LifeFile ID</span>
                <span className="flex items-center font-mono font-bold text-gray-900">
                  {uploadResult.lifefileId}
                  <CopyButton text={uploadResult.lifefileId} />
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Match</span>
                {uploadResult.matched ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Linked to Patient
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                    <XCircle className="h-3.5 w-3.5" />
                    No Match — Stored
                  </span>
                )}
              </div>
              {uploadResult.orderId && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Order</span>
                  <span className="font-medium text-gray-900">#{uploadResult.orderId}</span>
                </div>
              )}
            </div>

            {/* Tracking section */}
            {uploadResult.trackingNumber || trackingSaved ? (
              <div className="mb-4 flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                  <Truck className="h-4 w-4" />
                  {uploadResult.trackingSource === 'manual' ? 'Tracking' : 'Auto-detected'}
                </span>
                <span className="flex items-center font-mono text-xs font-bold text-blue-900">
                  {uploadResult.trackingNumber}
                  <CopyButton text={uploadResult.trackingNumber!} />
                </span>
              </div>
            ) : (
              <div className="mb-4 rounded-xl border border-dashed border-gray-200 p-4">
                <label htmlFor="trackingDone" className="mb-1.5 block text-xs font-semibold text-gray-700">
                  Tracking Number <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="trackingDone"
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && trackingNumber.trim()) handleSaveTracking(); }}
                    placeholder="Enter tracking number"
                    autoFocus
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2.5 font-mono text-sm tracking-wider placeholder:font-sans placeholder:text-xs placeholder:tracking-normal placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                  <button
                    onClick={handleSaveTracking}
                    disabled={!trackingNumber.trim() || trackingSaving}
                    className="rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
                  >
                    {trackingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </button>
                </div>
                {error && (
                  <p className="mt-2 text-xs text-red-600">{error}</p>
                )}
                <p className="mt-2 text-[11px] text-gray-400">
                  You can add tracking later from the audit log
                </p>
              </div>
            )}

            {/* Primary CTA */}
            <button
              onClick={reset}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-5 text-base font-bold text-white shadow-sm transition-all hover:bg-violet-700 active:scale-[0.98] sm:py-4 sm:text-sm"
            >
              <Camera className="h-6 w-6 sm:h-5 sm:w-5" />
              Scan Next Package
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Camera Capture — Full-screen on mobile, wider viewfinder for packages
// ---------------------------------------------------------------------------

function CameraCapture({
  onCapture,
  onCancel,
  lifefileId,
}: {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
  lifefileId: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showFlash, setShowFlash] = useState(false);

  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    setCameraReady(false);
    setCameraError(null);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch {
      setCameraError('Camera access denied. Please allow camera permissions.');
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchCamera = useCallback(() => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startCamera(next);
  }, [facingMode, startCamera]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 200);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          onCapture(blob);
        }
      },
      'image/jpeg',
      0.85,
    );
  }, [onCapture]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black md:static md:z-auto md:overflow-hidden md:rounded-2xl md:shadow-lg">
      {/* Header bar */}
      <div className="relative z-10 flex items-center justify-between bg-black/60 px-5 py-4 backdrop-blur-sm md:px-4 md:py-3">
        <button
          onClick={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); onCancel(); }}
          className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-base font-medium text-gray-300 transition-colors hover:text-white active:bg-white/10 md:px-0 md:py-0 md:text-sm"
        >
          <ChevronLeft className="h-5 w-5 md:h-4 md:w-4" />
          Back
        </button>
        <span className="rounded-full bg-violet-600/90 px-4 py-1.5 font-mono text-sm font-bold text-white shadow-sm md:px-3 md:py-1 md:text-xs">
          {lifefileId}
        </span>
        <button
          onClick={switchCamera}
          className="rounded-lg p-2.5 text-gray-300 transition-colors hover:text-white active:bg-white/10 md:p-0"
        >
          <SwitchCamera className="h-6 w-6 md:h-4 md:w-4" />
        </button>
      </div>

      {/* Viewfinder — fills available space on mobile, fixed aspect on desktop */}
      <div className="relative flex-1 bg-black md:aspect-[4/3] md:flex-none">
        {cameraError ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Camera className="mb-3 h-12 w-12 text-gray-600" />
            <p className="mb-3 text-base text-gray-400 md:text-sm">{cameraError}</p>
            <button onClick={() => startCamera(facingMode)} className="rounded-lg px-4 py-2 text-base font-semibold text-violet-400 hover:text-violet-300 active:bg-white/10 md:text-sm">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />

            {/* Frame corner marks — wider spread for packages */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-[5%] top-[5%] h-12 w-12 rounded-tl-2xl border-l-[3px] border-t-[3px] border-white/50 md:left-[10%] md:top-[6%] md:h-10 md:w-10" />
              <div className="absolute right-[5%] top-[5%] h-12 w-12 rounded-tr-2xl border-r-[3px] border-t-[3px] border-white/50 md:right-[10%] md:top-[6%] md:h-10 md:w-10" />
              <div className="absolute bottom-[5%] left-[5%] h-12 w-12 rounded-bl-2xl border-b-[3px] border-l-[3px] border-white/50 md:bottom-[6%] md:left-[10%] md:h-10 md:w-10" />
              <div className="absolute bottom-[5%] right-[5%] h-12 w-12 rounded-br-2xl border-b-[3px] border-r-[3px] border-white/50 md:bottom-[6%] md:right-[10%] md:h-10 md:w-10" />
            </div>

            {/* Flash overlay */}
            <div className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-200 ${showFlash ? 'opacity-70' : 'opacity-0'}`} />

            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-10 w-10 animate-spin text-white md:h-8 md:w-8" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Capture button — larger on mobile */}
      <div className="flex items-center justify-center bg-black/60 py-8 backdrop-blur-sm md:py-6">
        <button
          onClick={capturePhoto}
          disabled={!cameraReady}
          className="flex h-24 w-24 items-center justify-center rounded-full border-[5px] border-white/80 shadow-lg transition-transform hover:scale-105 active:scale-90 disabled:opacity-40 md:h-20 md:w-20"
          aria-label="Capture photo"
        >
          <div className="h-[72px] w-[72px] rounded-full bg-white md:h-[60px] md:w-[60px]" />
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit Log — Stats + Table + Detail Modal
// ---------------------------------------------------------------------------

function AuditLog() {
  const [photos, setPhotos] = useState<PackagePhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [matchFilter, setMatchFilter] = useState<'all' | 'true' | 'false'>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'lifefileId'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedPhoto, setSelectedPhoto] = useState<PackagePhotoRecord | null>(null);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [demographics, setDemographics] = useState<Demographics | null>(null);
  const [showDemographics, setShowDemographics] = useState(true);
  const [showPerfReport, setShowPerfReport] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [dailyReport, setDailyReport] = useState<DailyReportData | null>(null);
  const [dailyReportLoading, setDailyReportLoading] = useState(false);
  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  });
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, demoRes] = await Promise.all([
        apiFetch('/api/package-photos?stats=true'),
        apiFetch('/api/package-photos?demographics=true'),
      ]);
      if (statsRes.ok) {
        const json = await statsRes.json();
        setStats(json.data);
      }
      if (demoRes.ok) {
        const json = await demoRes.json();
        setDemographics(json.data);
      }
    } catch { /* non-critical */ }
  }, []);

  const fetchDailyReport = useCallback(async (from: string, to: string) => {
    setDailyReportLoading(true);
    try {
      const res = await apiFetch(`/api/package-photos?daily-report=true&from=${from}&to=${to}`);
      if (res.ok) {
        const json = await res.json();
        setDailyReport(json.data);
      }
    } catch { /* non-critical */ }
    finally { setDailyReportLoading(false); }
  }, []);

  const fetchPhotos = useCallback(
    async (searchVal: string, matchVal: string, periodVal: string, sortByVal: string, sortOrderVal: string, pageVal: number, fromVal?: string, toVal?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchVal) params.set('search', searchVal);
        if (matchVal !== 'all') params.set('matched', matchVal);
        if (periodVal !== 'all') params.set('period', periodVal);
        if (periodVal === 'custom' && fromVal) {
          params.set('from', fromVal);
          if (toVal) params.set('to', toVal);
        }
        params.set('sortBy', sortByVal);
        params.set('sortOrder', sortOrderVal);
        params.set('page', String(pageVal));
        params.set('limit', '20');

        const res = await apiFetch(`/api/package-photos?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          setPhotos(json.data);
          setTotalPages(json.meta.totalPages);
          setTotal(json.meta.total);
        }
      } catch { /* silent */ }
      finally { setLoading(false); }
    },
    [],
  );

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    fetchPhotos(search, matchFilter, periodFilter, sortBy, sortOrder, page, customFrom, customTo);
  }, [fetchPhotos, matchFilter, periodFilter, sortBy, sortOrder, page, customFrom, customTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => {
        setPage(1);
        fetchPhotos(value, matchFilter, periodFilter, sortBy, sortOrder, 1, customFrom, customTo);
      }, 350);
    },
    [fetchPhotos, matchFilter, periodFilter, sortBy, sortOrder, customFrom, customTo],
  );

  const toggleSort = (col: 'createdAt' | 'lifefileId') => {
    if (sortBy === col) {
      setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(col);
      setSortOrder('desc');
    }
    setPage(1);
  };

  return (
    <div>
      {/* Stats banner */}
      {stats && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <Camera className="h-3.5 w-3.5" /> Today
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.today}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <Clock className="h-3.5 w-3.5" /> Yesterday
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.yesterday}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <Calendar className="h-3.5 w-3.5" /> This Week
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.thisWeek}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <BarChart3 className="h-3.5 w-3.5" /> This Month
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.thisMonth}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <CheckCircle className="h-3.5 w-3.5" /> Match Rate
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{stats.matchRate}%</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <XCircle className="h-3.5 w-3.5" /> Unmatched
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{stats.unmatched}</p>
          </div>
        </div>
      )}

      {/* Demographics toggle */}
      <button
        onClick={() => setShowDemographics((v) => !v)}
        className="mb-4 flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Activity className="h-4 w-4 text-violet-500" />
          Package Processing Analytics
        </span>
        {showDemographics ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {/* Demographics dashboard */}
      {showDemographics && demographics && (
        <div className="mb-6 space-y-4">
          {/* Row 1: Daily volume chart + summary */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Daily volume bar chart */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <TrendingUp className="h-4 w-4 text-violet-500" />
                  Daily Volume (Last 14 Days)
                </h3>
                <span className="text-xs text-gray-400">
                  Avg: {demographics.avgDaily}/day
                </span>
              </div>
              <div className="flex items-end gap-[3px]" style={{ height: 120 }}>
                {demographics.dailyVolume.map((d) => {
                  const maxVal = Math.max(...demographics.dailyVolume.map((v) => v.total), 1);
                  const matchedH = (d.matched / maxVal) * 100;
                  const unmatchedH = (d.unmatched / maxVal) * 100;
                  const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' });
                  const dateLabel = new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  const isToday = d.date === new Date().toISOString().split('T')[0];
                  return (
                    <div key={d.date} className="group relative flex flex-1 flex-col items-center">
                      <div className="absolute -top-10 z-10 hidden rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-center shadow-lg group-hover:block">
                        <p className="text-[10px] font-medium text-gray-500">{dateLabel}</p>
                        <p className="text-xs font-bold text-gray-900">{d.total} pkgs</p>
                        <p className="text-[10px] text-emerald-600">{d.matched} matched</p>
                      </div>
                      <div className="flex w-full flex-col items-stretch" style={{ height: 100 }}>
                        <div className="flex-1" />
                        {d.unmatched > 0 && (
                          <div
                            className="w-full rounded-t bg-amber-300 transition-all"
                            style={{ height: `${unmatchedH}%`, minHeight: d.unmatched > 0 ? 2 : 0 }}
                          />
                        )}
                        {d.matched > 0 && (
                          <div
                            className={`w-full ${d.unmatched > 0 ? '' : 'rounded-t'} rounded-b bg-emerald-500 transition-all`}
                            style={{ height: `${matchedH}%`, minHeight: d.matched > 0 ? 2 : 0 }}
                          />
                        )}
                      </div>
                      <span className={`mt-1 text-[9px] ${isToday ? 'font-bold text-violet-600' : 'text-gray-400'}`}>
                        {dayLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> Matched</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-amber-300" /> Unmatched</span>
              </div>
            </div>

            {/* Monthly summary + peak hours */}
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">This Month</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Total Packages</span>
                    <span className="font-bold text-gray-900">{demographics.monthlyMatchRate.total}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Match Rate</span>
                    <span className="font-bold text-emerald-600">{demographics.monthlyMatchRate.rate}%</span>
                  </div>
                  {/* Match rate bar */}
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${demographics.monthlyMatchRate.rate}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>{demographics.monthlyMatchRate.matched} matched</span>
                    <span>{demographics.monthlyMatchRate.unmatched} unmatched</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-700">Peak Activity</h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Peak Hour Today</span>
                  <span className="font-bold text-gray-900">
                    {demographics.peakHour.count > 0
                      ? `${demographics.peakHour.hour % 12 || 12}${demographics.peakHour.hour < 12 ? 'AM' : 'PM'} (${demographics.peakHour.count})`
                      : 'No data'}
                  </span>
                </div>
                <div className="mt-2 flex items-end gap-px" style={{ height: 32 }}>
                  {demographics.hourlyDistribution.map((h) => {
                    const maxH = Math.max(...demographics.hourlyDistribution.map((v) => v.total), 1);
                    const pct = (h.total / maxH) * 100;
                    const isNow = new Date().getHours() === h.hour;
                    return (
                      <div
                        key={h.hour}
                        className={`flex-1 rounded-t transition-all ${isNow ? 'bg-violet-500' : h.total > 0 ? 'bg-violet-200' : 'bg-gray-100'}`}
                        style={{ height: `${Math.max(pct, 4)}%` }}
                        title={`${h.hour % 12 || 12}${h.hour < 12 ? 'AM' : 'PM'}: ${h.total} packages`}
                      />
                    );
                  })}
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-gray-300">
                  <span>12AM</span>
                  <span>12PM</span>
                  <span>11PM</span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Rep breakdown + Tracking source */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Rep breakdown */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Users className="h-4 w-4 text-violet-500" />
                Rep Activity (This Month)
              </h3>
              {demographics.repBreakdown.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">No data this month</p>
              ) : (
                <div className="space-y-2">
                  {demographics.repBreakdown.map((rep, idx) => {
                    const maxTotal = demographics.repBreakdown[0]?.total || 1;
                    return (
                      <div key={rep.userId} className="flex items-center gap-3">
                        <span className="w-5 text-right text-xs font-bold text-gray-300">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="truncate text-sm font-medium text-gray-700">{rep.name}</span>
                            <span className="ml-2 flex-shrink-0 text-xs text-gray-400">
                              {rep.total} pkgs &middot; {rep.matchRate}% match
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div className="flex h-full">
                              <div
                                className="rounded-l-full bg-emerald-500 transition-all"
                                style={{ width: `${(rep.matched / maxTotal) * 100}%` }}
                              />
                              <div
                                className="bg-amber-300 transition-all"
                                style={{ width: `${((rep.total - rep.matched) / maxTotal) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tracking source breakdown */}
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Truck className="h-4 w-4 text-violet-500" />
                Tracking Sources (This Month)
              </h3>
              {demographics.trackingSourceBreakdown.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">No data this month</p>
              ) : (
                <div className="space-y-3">
                  {demographics.trackingSourceBreakdown.map((src) => {
                    const totalMonth = demographics.monthlyMatchRate.total || 1;
                    const pct = Math.round((src.total / totalMonth) * 100);
                    const label = TRACKING_SOURCE_LABELS[src.source] ?? src.source;
                    const colors: Record<string, string> = {
                      order: 'bg-blue-500',
                      lifefile_webhook: 'bg-violet-500',
                      shipping_update: 'bg-cyan-500',
                      fedex_label: 'bg-orange-500',
                      manual: 'bg-gray-400',
                      unknown: 'bg-gray-300',
                    };
                    const barColor = colors[src.source] ?? 'bg-gray-400';
                    return (
                      <div key={src.source}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{label}</span>
                          <span className="font-medium text-gray-900">{src.total} <span className="text-xs text-gray-400">({pct}%)</span></span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Performance Reports section */}
      <button
        onClick={() => setShowPerfReport((v) => !v)}
        className="mb-4 flex w-full items-center justify-between rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-left transition-colors hover:bg-violet-100"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-violet-700">
          <BarChart3 className="h-4 w-4 text-violet-600" />
          Performance Reports
          <span className="rounded-full bg-violet-200 px-2 py-0.5 text-[10px] font-bold text-violet-800">
            Hourly &middot; Daily &middot; Weekly &middot; Per Rep
          </span>
        </span>
        {showPerfReport ? <ChevronUp className="h-4 w-4 text-violet-400" /> : <ChevronDown className="h-4 w-4 text-violet-400" />}
      </button>

      {showPerfReport && <PerformanceReports />}

      {/* Daily Report section */}
      <button
        onClick={() => {
          const opening = !showDailyReport;
          setShowDailyReport(opening);
          if (opening && !dailyReport) fetchDailyReport(reportFrom, reportTo);
        }}
        className="mb-4 flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <CalendarDays className="h-4 w-4 text-violet-500" />
          Daily Package Report
        </span>
        {showDailyReport ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {showDailyReport && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          {/* Date range picker + actions */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">From</label>
              <input
                type="date"
                value={reportFrom}
                onChange={(e) => setReportFrom(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">To</label>
              <input
                type="date"
                value={reportTo}
                onChange={(e) => setReportTo(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
            <button
              onClick={() => fetchDailyReport(reportFrom, reportTo)}
              disabled={dailyReportLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
            >
              {dailyReportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Table className="h-4 w-4" />}
              Pull Report
            </button>
            {/* Quick presets */}
            <div className="flex gap-1.5">
              {[
                { label: 'Today', days: 0 },
                { label: '7 Days', days: 6 },
                { label: '14 Days', days: 13 },
                { label: '30 Days', days: 29 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    const to = new Date().toISOString().split('T')[0];
                    const from = new Date(Date.now() - preset.days * 86400000).toISOString().split('T')[0];
                    setReportFrom(from);
                    setReportTo(to);
                    fetchDailyReport(from, to);
                  }}
                  className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {/* CSV export */}
            {dailyReport && dailyReport.days.length > 0 && (
              <button
                onClick={() => {
                  const header = 'Date,Day,Total,Matched,Unmatched,Match Rate,Reps\n';
                  const rows = dailyReport.days.map((d) => {
                    const dayName = new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' });
                    const repStr = d.reps.map((r) => `${r.name}:${r.total}`).join('; ');
                    return `${d.date},${dayName},${d.total},${d.matched},${d.unmatched},${d.matchRate}%,"${repStr}"`;
                  }).join('\n');
                  const summary = `\nSummary,,${dailyReport.summary.totalPackages},${dailyReport.summary.totalMatched},${dailyReport.summary.totalUnmatched},${dailyReport.summary.matchRate}%,Avg ${dailyReport.summary.avgPerDay}/day`;
                  const blob = new Blob([header + rows + summary], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `package-report-${reportFrom}-to-${reportTo}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700"
              >
                <FileDown className="h-3.5 w-3.5" />
                Export CSV
              </button>
            )}
          </div>

          {/* Summary bar */}
          {dailyReport && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Days</p>
                <p className="text-lg font-bold text-gray-900">{dailyReport.summary.totalDays}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Pkgs</p>
                <p className="text-lg font-bold text-gray-900">{dailyReport.summary.totalPackages.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Matched</p>
                <p className="text-lg font-bold text-emerald-600">{dailyReport.summary.totalMatched.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Unmatched</p>
                <p className="text-lg font-bold text-amber-600">{dailyReport.summary.totalUnmatched.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Avg/Day</p>
                <p className="text-lg font-bold text-violet-600">{dailyReport.summary.avgPerDay}</p>
              </div>
            </div>
          )}

          {/* Daily table */}
          {dailyReportLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            </div>
          ) : !dailyReport ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Select a date range and click &ldquo;Pull Report&rdquo;
            </div>
          ) : dailyReport.days.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              No packages found in this date range
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              {/* Header */}
              <div className="hidden border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 sm:grid sm:grid-cols-12 sm:gap-2">
                <div className="col-span-3">Date</div>
                <div className="col-span-2 text-right">Total</div>
                <div className="col-span-2 text-right">Matched</div>
                <div className="col-span-2 text-right">Unmatched</div>
                <div className="col-span-2 text-right">Match Rate</div>
                <div className="col-span-1" />
              </div>
              {/* Rows */}
              <div className="divide-y divide-gray-100">
                {dailyReport.days.map((day) => {
                  const isExpanded = expandedDay === day.date;
                  const dayName = new Date(day.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                  const isToday = day.date === new Date().toISOString().split('T')[0];
                  const aboveAvg = day.total > dailyReport.summary.avgPerDay;
                  return (
                    <div key={day.date}>
                      <button
                        onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                        className={`w-full px-4 py-3 text-left transition-colors hover:bg-violet-50/30 ${isToday ? 'bg-violet-50/40' : ''}`}
                      >
                        {/* Mobile layout */}
                        <div className="sm:hidden">
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-semibold ${isToday ? 'text-violet-700' : 'text-gray-900'}`}>
                              {dayName} {isToday && <span className="ml-1 text-[10px] font-bold text-violet-500">(Today)</span>}
                            </span>
                            <span className="text-lg font-bold text-gray-900">{day.total}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[11px]">
                            <span className="text-emerald-600">{day.matched} matched</span>
                            <span className="text-amber-600">{day.unmatched} unmatched</span>
                            <span className="text-gray-400">{day.matchRate}%</span>
                            {day.reps.length > 0 && (
                              <span className="text-gray-300">{day.reps.length} rep{day.reps.length !== 1 ? 's' : ''}</span>
                            )}
                          </div>
                        </div>
                        {/* Desktop layout */}
                        <div className="hidden sm:grid sm:grid-cols-12 sm:items-center sm:gap-2">
                          <div className="col-span-3">
                            <span className={`text-sm font-semibold ${isToday ? 'text-violet-700' : 'text-gray-900'}`}>
                              {dayName}
                            </span>
                            {isToday && <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-600">Today</span>}
                          </div>
                          <div className="col-span-2 text-right">
                            <span className={`text-sm font-bold ${aboveAvg ? 'text-gray-900' : 'text-gray-500'}`}>{day.total}</span>
                            {aboveAvg && <span className="ml-1 text-[10px] text-emerald-500" title="Above average">&#9650;</span>}
                          </div>
                          <div className="col-span-2 text-right text-sm font-medium text-emerald-600">{day.matched}</div>
                          <div className="col-span-2 text-right text-sm font-medium text-amber-600">{day.unmatched}</div>
                          <div className="col-span-2 text-right">
                            <span className={`text-sm font-bold ${day.matchRate >= 60 ? 'text-emerald-600' : day.matchRate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                              {day.matchRate}%
                            </span>
                          </div>
                          <div className="col-span-1 text-right">
                            {day.reps.length > 0 && (
                              isExpanded
                                ? <ChevronUp className="ml-auto h-4 w-4 text-gray-400" />
                                : <ChevronDown className="ml-auto h-4 w-4 text-gray-300" />
                            )}
                          </div>
                        </div>
                      </button>
                      {/* Expanded rep breakdown */}
                      {isExpanded && day.reps.length > 0 && (
                        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Rep Breakdown</p>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {day.reps.map((rep) => (
                              <div key={rep.name} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                                <span className="text-sm font-medium text-gray-700">{rep.name}</span>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="font-bold text-gray-900">{rep.total}</span>
                                  <span className="text-emerald-600">{rep.matched}m</span>
                                  <span className="text-amber-600">{rep.total - rep.matched}u</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search + Filters */}
      <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by LifeFile ID or tracking number..."
            className="w-full rounded-lg border border-gray-200 bg-white py-3 pl-10 pr-4 text-base placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 sm:py-2.5 sm:text-sm"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={matchFilter}
            onChange={(e) => { setMatchFilter(e.target.value as 'all' | 'true' | 'false'); setPage(1); }}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-700 focus:border-violet-500 focus:outline-none sm:flex-none sm:py-2.5 sm:text-xs"
          >
            <option value="all">All Status</option>
            <option value="true">Matched</option>
            <option value="false">Unmatched</option>
          </select>
          <select
            value={periodFilter}
            onChange={(e) => {
              setPeriodFilter(e.target.value);
              if (e.target.value !== 'custom') {
                setCustomFrom('');
                setCustomTo('');
              }
              setPage(1);
            }}
            className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm font-medium text-gray-700 focus:border-violet-500 focus:outline-none sm:flex-none sm:py-2.5 sm:text-xs"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
      </div>

      {/* Custom date range picker */}
      {periodFilter === 'custom' && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5">
          <span className="text-xs font-semibold text-violet-700">From:</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => { setCustomFrom(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/20"
          />
          <span className="text-xs font-semibold text-violet-700">To:</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => { setCustomTo(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/20"
          />
          {customFrom && (
            <button
              onClick={() => { setCustomFrom(''); setCustomTo(''); setPeriodFilter('all'); setPage(1); }}
              className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-100"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      )}

      {/* Results count */}
      <div className="mb-3 text-xs font-medium text-gray-400">
        {loading ? 'Loading...' : `${total} record${total !== 1 ? 's' : ''}`}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex animate-pulse items-center gap-4 px-4 py-3">
                <div className="h-12 w-12 rounded-lg bg-gray-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 rounded bg-gray-100" />
                  <div className="h-3 w-36 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="py-20 text-center">
            <ImageIcon className="mx-auto mb-3 h-10 w-10 text-gray-200" />
            <p className="text-sm font-medium text-gray-400">No records found</p>
            <p className="mt-1 text-xs text-gray-300">
              {search ? 'Try a different search term' : 'Package photos will appear here after capture'}
            </p>
          </div>
        ) : (
          <>
            {/* Column headers (desktop) */}
            <div className="hidden border-b border-gray-100 bg-gray-50/50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 md:flex md:items-center md:gap-4">
              <div className="w-12" />
              <button onClick={() => toggleSort('lifefileId')} className="flex w-28 items-center gap-1 hover:text-gray-600">
                LifeFile ID <ArrowUpDown className="h-3 w-3" />
              </button>
              <button onClick={() => toggleSort('createdAt')} className="flex w-40 items-center gap-1 hover:text-gray-600">
                Date & Time <ArrowUpDown className="h-3 w-3" />
              </button>
              <div className="w-28">Rep</div>
              <div className="flex-1">Tracking</div>
              <div className="w-24 text-right">Status</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-gray-100">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className="flex w-full items-center gap-3 px-3 py-4 text-left transition-colors hover:bg-violet-50/30 active:bg-violet-50/50 sm:gap-4 sm:px-4 sm:py-3"
                >
                  {/* Thumbnail */}
                  <PhotoThumbnail photoId={photo.id} s3Key={photo.s3Key} size="sm" />

                  {/* Mobile: stacked layout */}
                  <div className="min-w-0 flex-1 md:hidden">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold text-gray-900">{photo.lifefileId}</span>
                      {photo.matched ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          <CheckCircle className="h-3 w-3" /> Matched
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Unmatched
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-400">
                      <span>{relativeTime(photo.createdAt)}</span>
                      <span>&middot;</span>
                      <span>{photo.capturedBy.firstName} {photo.capturedBy.lastName[0]}.</span>
                      {photo.trackingNumber && (
                        <>
                          <span>&middot;</span>
                          <span className="flex items-center gap-0.5 font-mono text-blue-600">
                            <Truck className="h-3 w-3" />
                            {photo.trackingNumber.slice(0, 12)}{photo.trackingNumber.length > 12 ? '...' : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Desktop: table columns */}
                  <div className="hidden w-28 md:block">
                    <span className="font-mono text-sm font-bold text-gray-900">{photo.lifefileId}</span>
                  </div>
                  <div className="hidden w-40 md:block">
                    <p className="text-sm text-gray-700">
                      {new Date(photo.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </p>
                    <p className="text-[11px] text-gray-400">{relativeTime(photo.createdAt)}</p>
                  </div>
                  <div className="hidden w-28 md:block">
                    <p className="truncate text-sm text-gray-700">{photo.capturedBy.firstName} {photo.capturedBy.lastName[0]}.</p>
                  </div>
                  <div className="hidden min-w-0 flex-1 md:block">
                    {photo.trackingNumber ? (
                      <span className="flex items-center gap-1 font-mono text-xs text-blue-600">
                        <Truck className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{photo.trackingNumber}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">&mdash;</span>
                    )}
                  </div>
                  <div className="hidden w-24 text-right md:block">
                    {photo.matched ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <CheckCircle className="h-3 w-3" /> Matched
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Unmatched
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40 sm:px-3 sm:py-1.5 sm:text-xs"
            >
              <ChevronLeft className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40 sm:px-3 sm:py-1.5 sm:text-xs"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selectedPhoto && (
        <AuditDetailModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Performance Reports — Hourly / Daily / Weekly with per-rep drill-down
// ---------------------------------------------------------------------------

const GRANULARITY_OPTIONS: Array<{ value: Granularity; label: string; icon: typeof Clock }> = [
  { value: 'hourly', label: 'Hourly', icon: Clock },
  { value: 'daily', label: 'Daily', icon: Calendar },
  { value: 'weekly', label: 'Weekly', icon: CalendarDays },
];

const PERF_PRESETS = [
  { label: 'Today (Hourly)', granularity: 'hourly' as Granularity, days: 0 },
  { label: 'Last 7 Days', granularity: 'daily' as Granularity, days: 6 },
  { label: 'Last 14 Days', granularity: 'daily' as Granularity, days: 13 },
  { label: 'Last 30 Days', granularity: 'weekly' as Granularity, days: 29 },
  { label: 'This Month', granularity: 'daily' as Granularity, days: -1 },
];

function PerformanceReports() {
  const [report, setReport] = useState<PerformanceReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [selectedRepId, setSelectedRepId] = useState<number | null>(null);
  const [availableReps, setAvailableReps] = useState<PerformanceRepSummary[]>([]);
  const [expandedInterval, setExpandedInterval] = useState<string | null>(null);
  const [perfFrom, setPerfFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  });
  const [perfTo, setPerfTo] = useState(() => new Date().toISOString().split('T')[0]);

  const fetchReport = useCallback(async (g: Granularity, from: string, to: string, repId: number | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        'performance-report': 'true',
        granularity: g,
        from,
        to,
      });
      if (repId) params.set('repId', String(repId));

      const res = await apiFetch(`/api/package-photos?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setReport(json.data);
        if (!repId && json.data.reps?.length) {
          setAvailableReps(json.data.reps);
        }
      }
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, []);

  const handlePreset = useCallback((preset: typeof PERF_PRESETS[number]) => {
    const to = new Date().toISOString().split('T')[0];
    let from: string;
    if (preset.days === -1) {
      const now = new Date();
      from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    } else {
      from = new Date(Date.now() - preset.days * 86400000).toISOString().split('T')[0];
    }
    setGranularity(preset.granularity);
    setPerfFrom(from);
    setPerfTo(to);
    setExpandedInterval(null);
    fetchReport(preset.granularity, from, to, selectedRepId);
  }, [fetchReport, selectedRepId]);

  const handleRepChange = useCallback((repId: number | null) => {
    setSelectedRepId(repId);
    setExpandedInterval(null);
    fetchReport(granularity, perfFrom, perfTo, repId);
  }, [fetchReport, granularity, perfFrom, perfTo]);

  const handlePull = useCallback(() => {
    setExpandedInterval(null);
    fetchReport(granularity, perfFrom, perfTo, selectedRepId);
  }, [fetchReport, granularity, perfFrom, perfTo, selectedRepId]);

  const exportCsv = useCallback(() => {
    if (!report) return;
    const g = report.granularity;
    const header = `Interval,Total,Matched,Unmatched,Match Rate,Reps\n`;
    const rows = report.intervals.map((i) => {
      const repStr = i.reps.map((r) => `${r.name}:${r.total}`).join('; ');
      return `"${i.label}",${i.total},${i.matched},${i.unmatched},${i.matchRate}%,"${repStr}"`;
    }).join('\n');
    const repSection = `\n\nRep Summary\nName,Total,Matched,Match Rate\n` +
      report.reps.map((r) => `"${r.name}",${r.total},${r.matched},${r.matchRate}%`).join('\n');
    const summary = `\n\nSummary\nTotal Packages,${report.summary.totalPackages}\nMatched,${report.summary.totalMatched}\nUnmatched,${report.summary.totalUnmatched}\nMatch Rate,${report.summary.matchRate}%\nAvg per ${g === 'hourly' ? 'Hour' : g === 'weekly' ? 'Week' : 'Day'},${report.summary.avgPerInterval}`;
    const blob = new Blob([header + rows + repSection + summary], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-report-${g}-${perfFrom}-to-${perfTo}${selectedRepId ? `-rep${selectedRepId}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report, perfFrom, perfTo, selectedRepId]);

  const selectedRepName = selectedRepId ? availableReps.find((r) => r.userId === selectedRepId)?.name : null;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      {/* Controls row */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
        {/* Granularity selector */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">Granularity</label>
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {GRANULARITY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = granularity === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setGranularity(opt.value)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? 'bg-white text-violet-700 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Rep selector */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">Rep</label>
          <select
            value={selectedRepId ?? ''}
            onChange={(e) => handleRepChange(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="">All Reps (Team)</option>
            {availableReps.map((rep) => (
              <option key={rep.userId} value={rep.userId}>{rep.name}</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">From</label>
          <input
            type="date"
            value={perfFrom}
            onChange={(e) => setPerfFrom(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">To</label>
          <input
            type="date"
            value={perfTo}
            onChange={(e) => setPerfTo(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>

        {/* Pull button */}
        <button
          onClick={handlePull}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
          Pull Report
        </button>

        {/* Presets */}
        <div className="flex flex-wrap gap-1.5">
          {PERF_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePreset(preset)}
              className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* CSV export */}
        {report && report.intervals.length > 0 && (
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-700"
          >
            <FileDown className="h-3.5 w-3.5" />
            Export CSV
          </button>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
        </div>
      )}

      {/* No data yet */}
      {!loading && !report && (
        <div className="py-16 text-center text-sm text-gray-400">
          Select a time range and click &ldquo;Pull Report&rdquo; to generate a performance report
        </div>
      )}

      {/* Report content */}
      {!loading && report && (
        <div className="space-y-5">
          {/* Rep filter banner */}
          {selectedRepName && (
            <div className="flex items-center gap-2 rounded-lg bg-violet-50 px-4 py-2.5">
              <User className="h-4 w-4 text-violet-600" />
              <span className="text-sm font-semibold text-violet-700">
                Showing: {selectedRepName}
              </span>
              <button
                onClick={() => handleRepChange(null)}
                className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-600 transition-colors hover:bg-violet-100"
              >
                <X className="h-3 w-3" /> Clear Filter
              </button>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg bg-gray-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Pkgs</p>
              <p className="text-xl font-bold text-gray-900">{report.summary.totalPackages.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Matched</p>
              <p className="text-xl font-bold text-emerald-600">{report.summary.totalMatched.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Unmatched</p>
              <p className="text-xl font-bold text-amber-600">{report.summary.totalUnmatched.toLocaleString()}</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Match Rate</p>
              <p className={`text-xl font-bold ${report.summary.matchRate >= 60 ? 'text-emerald-600' : report.summary.matchRate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                {report.summary.matchRate}%
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Avg/{granularity === 'hourly' ? 'Hour' : granularity === 'weekly' ? 'Week' : 'Day'}
              </p>
              <p className="text-xl font-bold text-violet-600">{report.summary.avgPerInterval}</p>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Active Reps</p>
              <p className="text-xl font-bold text-gray-900">{report.summary.totalReps}</p>
            </div>
          </div>

          {/* Bar chart */}
          {report.intervals.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <BarChart3 className="h-4 w-4 text-violet-500" />
                {granularity === 'hourly' ? 'Hourly' : granularity === 'weekly' ? 'Weekly' : 'Daily'} Volume
                <span className="ml-auto text-xs font-normal text-gray-400">
                  {report.range.from} to {report.range.to}
                </span>
              </h4>
              <div className="flex items-end gap-[3px]" style={{ height: 140 }}>
                {report.intervals.map((interval, idx) => {
                  const maxVal = Math.max(...report.intervals.map((v) => v.total), 1);
                  const matchedH = (interval.matched / maxVal) * 100;
                  const unmatchedH = (interval.unmatched / maxVal) * 100;
                  const isLast = idx === report.intervals.length - 1;
                  return (
                    <div key={`${interval.date}-${interval.hour ?? idx}`} className="group relative flex flex-1 flex-col items-center">
                      <div className="absolute -top-12 z-10 hidden min-w-[100px] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-center shadow-lg group-hover:block">
                        <p className="text-[10px] font-medium text-gray-500">{interval.label}</p>
                        <p className="text-xs font-bold text-gray-900">{interval.total} pkgs</p>
                        <p className="text-[10px] text-emerald-600">{interval.matched}m / {interval.unmatched}u</p>
                      </div>
                      <div className="flex w-full flex-col items-stretch" style={{ height: 120 }}>
                        <div className="flex-1" />
                        {interval.unmatched > 0 && (
                          <div
                            className="w-full rounded-t bg-amber-300 transition-all"
                            style={{ height: `${unmatchedH}%`, minHeight: 2 }}
                          />
                        )}
                        {interval.matched > 0 && (
                          <div
                            className={`w-full ${interval.unmatched > 0 ? '' : 'rounded-t'} rounded-b bg-emerald-500 transition-all`}
                            style={{ height: `${matchedH}%`, minHeight: 2 }}
                          />
                        )}
                      </div>
                      <span className={`mt-1 max-w-full truncate text-[8px] ${isLast ? 'font-bold text-violet-600' : 'text-gray-400'}`}>
                        {granularity === 'hourly'
                          ? interval.label.split('–')[0]
                          : granularity === 'weekly'
                            ? interval.label.split(' – ')[0]
                            : interval.label.split(', ')[0]?.replace(/^[A-Z][a-z]+\s/, '') ?? interval.label
                        }
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> Matched</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-amber-300" /> Unmatched</span>
              </div>
            </div>
          )}

          {/* Rep leaderboard (team view) */}
          {!selectedRepId && report.reps.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Users className="h-4 w-4 text-violet-500" />
                Rep Leaderboard
                {report.summary.topRep && (
                  <span className="ml-2 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                    Top: {report.summary.topRep.name}
                  </span>
                )}
              </h4>
              <div className="space-y-2">
                {report.reps.map((rep, idx) => {
                  const maxTotal = report.reps[0]?.total || 1;
                  return (
                    <button
                      key={rep.userId}
                      onClick={() => handleRepChange(rep.userId)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-violet-50"
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                        idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-gray-100 text-gray-600' : idx === 2 ? 'bg-orange-50 text-orange-600' : 'bg-gray-50 text-gray-400'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="truncate text-sm font-medium text-gray-700">{rep.name}</span>
                          <span className="ml-2 flex-shrink-0 text-xs text-gray-400">
                            {rep.total} pkgs &middot; {rep.matchRate}% match
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <div className="flex h-full">
                            <div className="rounded-l-full bg-emerald-500 transition-all" style={{ width: `${(rep.matched / maxTotal) * 100}%` }} />
                            <div className="bg-amber-300 transition-all" style={{ width: `${((rep.total - rep.matched) / maxTotal) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interval detail table */}
          {report.intervals.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className="hidden border-b border-gray-100 bg-gray-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 sm:grid sm:grid-cols-12 sm:gap-2">
                <div className="col-span-3">
                  {granularity === 'hourly' ? 'Hour' : granularity === 'weekly' ? 'Week' : 'Date'}
                </div>
                <div className="col-span-2 text-right">Total</div>
                <div className="col-span-2 text-right">Matched</div>
                <div className="col-span-2 text-right">Unmatched</div>
                <div className="col-span-2 text-right">Match Rate</div>
                <div className="col-span-1" />
              </div>
              <div className="divide-y divide-gray-100">
                {report.intervals.map((interval, idx) => {
                  const key = `${interval.date}-${interval.hour ?? idx}`;
                  const isExpanded = expandedInterval === key;
                  const aboveAvg = interval.total > report.summary.avgPerInterval;
                  return (
                    <div key={key}>
                      <button
                        onClick={() => setExpandedInterval(isExpanded ? null : key)}
                        className="w-full px-4 py-3 text-left transition-colors hover:bg-violet-50/30"
                      >
                        <div className="sm:hidden">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-900">{interval.label}</span>
                            <span className="text-lg font-bold text-gray-900">{interval.total}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[11px]">
                            <span className="text-emerald-600">{interval.matched} matched</span>
                            <span className="text-amber-600">{interval.unmatched} unmatched</span>
                            <span className="text-gray-400">{interval.matchRate}%</span>
                            {interval.reps.length > 0 && (
                              <span className="text-gray-300">{interval.reps.length} rep{interval.reps.length !== 1 ? 's' : ''}</span>
                            )}
                          </div>
                        </div>
                        <div className="hidden sm:grid sm:grid-cols-12 sm:items-center sm:gap-2">
                          <div className="col-span-3">
                            <span className="text-sm font-semibold text-gray-900">{interval.label}</span>
                          </div>
                          <div className="col-span-2 text-right">
                            <span className={`text-sm font-bold ${aboveAvg ? 'text-gray-900' : 'text-gray-500'}`}>{interval.total}</span>
                            {aboveAvg && <span className="ml-1 text-[10px] text-emerald-500">&#9650;</span>}
                          </div>
                          <div className="col-span-2 text-right text-sm font-medium text-emerald-600">{interval.matched}</div>
                          <div className="col-span-2 text-right text-sm font-medium text-amber-600">{interval.unmatched}</div>
                          <div className="col-span-2 text-right">
                            <span className={`text-sm font-bold ${interval.matchRate >= 60 ? 'text-emerald-600' : interval.matchRate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                              {interval.matchRate}%
                            </span>
                          </div>
                          <div className="col-span-1 text-right">
                            {interval.reps.length > 0 && (
                              isExpanded
                                ? <ChevronUp className="ml-auto h-4 w-4 text-gray-400" />
                                : <ChevronDown className="ml-auto h-4 w-4 text-gray-300" />
                            )}
                          </div>
                        </div>
                      </button>
                      {isExpanded && interval.reps.length > 0 && (
                        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Rep Breakdown</p>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {interval.reps.map((rep) => {
                              const repRate = rep.total > 0 ? Math.round((rep.matched / rep.total) * 100) : 0;
                              return (
                                <div key={rep.userId} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
                                  <span className="text-sm font-medium text-gray-700">{rep.name}</span>
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="font-bold text-gray-900">{rep.total}</span>
                                    <span className="text-emerald-600">{rep.matched}m</span>
                                    <span className="text-amber-600">{rep.total - rep.matched}u</span>
                                    <span className={`font-semibold ${repRate >= 60 ? 'text-emerald-600' : repRate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                                      {repRate}%
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {report.intervals.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">
              No packages found in this date range
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit Detail Modal — Full audit card
// ---------------------------------------------------------------------------

function AuditDetailModal({
  photo,
  onClose,
}: {
  photo: PackagePhotoRecord;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:overflow-y-auto sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Photo with metadata stamp */}
        <div className="relative bg-gray-900">
          <PhotoThumbnail photoId={photo.id} s3Key={photo.s3Key} size="full" />
          {/* Metadata stamp overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-4 pb-3 pt-12">
            <div className="flex items-end justify-between text-white">
              <div>
                <p className="font-mono text-lg font-bold">{photo.lifefileId}</p>
                <p className="text-[11px] opacity-75">
                  {photo.capturedBy.firstName} {photo.capturedBy.lastName}
                </p>
              </div>
              <p className="text-[11px] opacity-75">
                {new Date(photo.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-black/40 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Details */}
        <div className="p-5">
          {/* Status bar */}
          <div className="mb-4 flex items-center justify-between">
            {photo.matched ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle className="h-3.5 w-3.5" />
                Matched to Patient
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                <XCircle className="h-3.5 w-3.5" />
                Unmatched — Stored for Search
              </span>
            )}
            <span className="text-xs text-gray-400">#{photo.id}</span>
          </div>

          {/* Tracking */}
          {photo.trackingNumber && (
            <div className="mb-4 flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
                <Truck className="h-4 w-4" />
                {TRACKING_SOURCE_LABELS[photo.trackingSource || ''] || 'Tracking'}
              </span>
              <span className="flex items-center font-mono text-xs font-bold text-blue-900">
                {photo.trackingNumber}
                <CopyButton text={photo.trackingNumber} />
              </span>
            </div>
          )}

          {/* Audit fields */}
          <div className="space-y-3">
            {/* Chain of custody */}
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <Shield className="h-3 w-3" /> Chain of Custody
              </p>
              <p className="text-sm text-gray-900">
                Captured by <span className="font-semibold">{photo.capturedBy.firstName} {photo.capturedBy.lastName}</span>
              </p>
              <p className="flex items-center gap-1.5 text-xs text-gray-500">
                <Clock className="h-3 w-3" />
                {formatTimestamp(photo.createdAt)}
              </p>
            </div>

            {/* LifeFile ID */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">LifeFile ID</span>
              <span className="flex items-center font-mono font-bold text-gray-900">
                {photo.lifefileId}
                <CopyButton text={photo.lifefileId} />
              </span>
            </div>

            {/* Patient */}
            {photo.patient && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Patient</span>
                <span className="flex items-center gap-1.5 font-medium text-gray-900">
                  <User className="h-3.5 w-3.5 text-gray-400" />
                  {photo.patient.firstName} {photo.patient.lastName}
                </span>
              </div>
            )}

            {/* Order */}
            {photo.order && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Order</span>
                <span className="font-medium text-gray-900">
                  #{photo.order.id}
                  {photo.order.lifefileOrderId && (
                    <span className="ml-1 text-xs text-gray-400">(LF: {photo.order.lifefileOrderId})</span>
                  )}
                </span>
              </div>
            )}

            {/* Match strategy */}
            {photo.matchStrategy && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Matched via</span>
                <span className="text-gray-700">
                  {photo.matchStrategy === 'lifefileOrderId' ? 'LifeFile Order ID' : 'Patient LifeFile ID'}
                </span>
              </div>
            )}

            {/* Notes */}
            {photo.notes && (
              <div className="text-sm">
                <span className="text-gray-500">Notes</span>
                <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-gray-900">{photo.notes}</p>
              </div>
            )}

            {/* Patient profile link */}
            {photo.patient && (
              <a
                href={`/admin/patients/${photo.patient.id}`}
                className="mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 py-2.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Patient Profile
              </a>
            )}

            {/* Download PDF */}
            <DownloadPdfButton photoId={photo.id} lifefileId={photo.lifefileId} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Download PDF Button
// ---------------------------------------------------------------------------

function DownloadPdfButton({ photoId, lifefileId }: { photoId: number; lifefileId: string }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await authenticatedFetch(`/api/package-photos/${photoId}/pdf`, {});
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `package-audit-${lifefileId}-${photoId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
    >
      {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {downloading ? 'Generating PDF...' : 'Download Audit PDF'}
    </button>
  );
}
