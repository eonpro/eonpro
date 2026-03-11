'use client';

export const dynamic = 'force-dynamic';

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
  thisWeek: number;
  matched: number;
  total: number;
  matchRate: number;
  unmatched: number;
}

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
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
      {/* Top bar */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
            <Package className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {mode === 'capture' ? 'Package Photos' : 'Audit Log'}
            </h1>
            <p className="text-xs text-gray-500">
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
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            {mode === 'capture' ? (
              <>
                <Search className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Audit Log</span>
              </>
            ) : (
              <>
                <Camera className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Capture</span>
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
    <div className="mx-auto max-w-lg">
      <StepIndicator step={step} />

      {/* ── Step 1: Scan LifeFile ID ─────────────────────────── */}
      {step === 'lifefileId' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
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
            className="mb-4 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-center font-mono text-2xl font-bold tracking-widest text-gray-900 placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
          <button
            onClick={() => setStep('camera')}
            disabled={!lifefileId.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-4 text-sm font-bold text-white shadow-sm transition-all hover:bg-violet-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
          >
            <Camera className="h-5 w-5" />
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
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retake
            </button>
            <button
              onClick={handleUpload}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-violet-700 active:scale-[0.98]"
            >
              <CheckCircle className="h-4 w-4" />
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-4 text-sm font-bold text-white shadow-sm transition-all hover:bg-violet-700 active:scale-[0.98]"
            >
              <Camera className="h-5 w-5" />
              Scan Next Package
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Camera Capture — Portrait viewfinder with frame overlay
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
        video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } },
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
    <div className="overflow-hidden rounded-2xl bg-black shadow-lg">
      {/* Header bar */}
      <div className="relative z-10 flex items-center justify-between bg-black/60 px-4 py-3 backdrop-blur-sm">
        <button
          onClick={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); onCancel(); }}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-300 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <span className="rounded-full bg-violet-600/90 px-3 py-1 font-mono text-xs font-bold text-white shadow-sm">
          {lifefileId}
        </span>
        <button
          onClick={switchCamera}
          className="flex items-center gap-1.5 text-sm text-gray-300 transition-colors hover:text-white"
        >
          <SwitchCamera className="h-4 w-4" />
        </button>
      </div>

      {/* Viewfinder */}
      <div className="relative aspect-[3/4] w-full bg-black">
        {cameraError ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Camera className="mb-3 h-12 w-12 text-gray-600" />
            <p className="mb-3 text-sm text-gray-400">{cameraError}</p>
            <button onClick={() => startCamera(facingMode)} className="text-sm font-semibold text-violet-400 hover:text-violet-300">
              Try Again
            </button>
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />

            {/* Frame corner marks */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-[10%] top-[6%] h-10 w-10 border-l-[3px] border-t-[3px] border-white/40 rounded-tl-xl" />
              <div className="absolute right-[10%] top-[6%] h-10 w-10 border-r-[3px] border-t-[3px] border-white/40 rounded-tr-xl" />
              <div className="absolute bottom-[6%] left-[10%] h-10 w-10 border-b-[3px] border-l-[3px] border-white/40 rounded-bl-xl" />
              <div className="absolute bottom-[6%] right-[10%] h-10 w-10 border-b-[3px] border-r-[3px] border-white/40 rounded-br-xl" />
            </div>

            {/* Flash overlay */}
            <div className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-200 ${showFlash ? 'opacity-70' : 'opacity-0'}`} />

            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Capture button */}
      <div className="flex items-center justify-center bg-black/60 py-6 backdrop-blur-sm">
        <button
          onClick={capturePhoto}
          disabled={!cameraReady}
          className="flex h-20 w-20 items-center justify-center rounded-full border-[5px] border-white/80 shadow-lg transition-transform hover:scale-105 active:scale-90 disabled:opacity-40"
          aria-label="Capture photo"
        >
          <div className="h-[60px] w-[60px] rounded-full bg-white" />
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
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'lifefileId'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedPhoto, setSelectedPhoto] = useState<PackagePhotoRecord | null>(null);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/package-photos?stats=true');
      if (res.ok) {
        const json = await res.json();
        setStats(json.data);
      }
    } catch { /* non-critical */ }
  }, []);

  const fetchPhotos = useCallback(
    async (searchVal: string, matchVal: string, periodVal: string, sortByVal: string, sortOrderVal: string, pageVal: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchVal) params.set('search', searchVal);
        if (matchVal !== 'all') params.set('matched', matchVal);
        if (periodVal !== 'all') params.set('period', periodVal);
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
    fetchPhotos(search, matchFilter, periodFilter, sortBy, sortOrder, page);
  }, [fetchPhotos, matchFilter, periodFilter, sortBy, sortOrder, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => {
        setPage(1);
        fetchPhotos(value, matchFilter, periodFilter, sortBy, sortOrder, 1);
      }, 350);
    },
    [fetchPhotos, matchFilter, periodFilter, sortBy, sortOrder],
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
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <Camera className="h-3.5 w-3.5" /> Today
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.today}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <Calendar className="h-3.5 w-3.5" /> This Week
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.thisWeek}</p>
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

      {/* Search + Filters */}
      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by LifeFile ID or tracking number..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={matchFilter}
            onChange={(e) => { setMatchFilter(e.target.value as 'all' | 'true' | 'false'); setPage(1); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs font-medium text-gray-700 focus:border-violet-500 focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="true">Matched</option>
            <option value="false">Unmatched</option>
          </select>
          <select
            value={periodFilter}
            onChange={(e) => { setPeriodFilter(e.target.value as 'all' | 'today' | 'week' | 'month'); setPage(1); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs font-medium text-gray-700 focus:border-violet-500 focus:outline-none"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>
      </div>

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
                  className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-violet-50/30"
                >
                  {/* Thumbnail */}
                  <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    {photo.s3Url && !photo.s3Url.includes('mock-s3') ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={photo.s3Url}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.querySelector('.img-fallback')?.classList.remove('hidden'); }}
                      />
                    ) : null}
                    <div className={`img-fallback flex h-full w-full items-center justify-center ${photo.s3Url && !photo.s3Url.includes('mock-s3') ? 'hidden' : ''}`}>
                      <ImageIcon className="h-5 w-5 text-gray-300" />
                    </div>
                  </div>

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
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
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
          {photo.s3Url && !photo.s3Url.includes('mock-s3') ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photo.s3Url}
              alt={`Package ${photo.lifefileId}`}
              className="w-full"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
            />
          ) : null}
          <div className={`flex aspect-video items-center justify-center bg-gray-800 ${photo.s3Url && !photo.s3Url.includes('mock-s3') ? 'hidden' : ''}`}>
            <div className="text-center">
              <ImageIcon className="mx-auto h-12 w-12 text-gray-600" />
              <p className="mt-2 text-xs text-gray-500">Photo not available</p>
            </div>
          </div>
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
