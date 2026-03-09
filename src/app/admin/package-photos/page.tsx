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
  Filter,
  Truck,
  ExternalLink,
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

const TRACKING_SOURCE_LABELS: Record<string, string> = {
  order: 'Order Record',
  lifefile_webhook: 'LifeFile Webhook',
  shipping_update: 'Shipping Update',
  fedex_label: 'FedEx Label',
  manual: 'Manual Entry',
};

type CaptureStep = 'lifefileId' | 'camera' | 'preview' | 'uploading' | 'tracking' | 'success';

const STEP_LABELS = [
  { key: 'lifefileId', label: 'LifeFile ID', icon: Package },
  { key: 'camera', label: 'Take Photo', icon: Camera },
  { key: 'tracking', label: 'Tracking', icon: Truck },
] as const;

function getActiveStepIndex(step: CaptureStep): number {
  if (step === 'lifefileId') return 0;
  if (step === 'camera' || step === 'preview' || step === 'uploading') return 1;
  return 2;
}

function StepIndicator({ currentStep }: { currentStep: CaptureStep }) {
  const activeIdx = getActiveStepIndex(currentStep);

  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      {STEP_LABELS.map((s, i) => {
        const Icon = s.icon;
        const isComplete = i < activeIdx;
        const isActive = i === activeIdx;
        return (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-0.5 w-8 rounded-full transition-colors ${
                  i <= activeIdx ? 'bg-violet-500' : 'bg-gray-200'
                }`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                  isComplete
                    ? 'bg-violet-600 text-white'
                    : isActive
                      ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-500'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {isComplete ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
              </div>
              <span
                className={`hidden text-xs font-medium sm:inline ${
                  isActive ? 'text-violet-700' : isComplete ? 'text-violet-600' : 'text-gray-400'
                }`}
              >
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
// Main Page Component
// ---------------------------------------------------------------------------

export default function PackagePhotosPage() {
  const [activeTab, setActiveTab] = useState<'capture' | 'gallery'>('capture');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
              <Package className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Package Photos</h1>
              <p className="text-sm text-gray-500">Capture and track package photos for outgoing shipments</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setActiveTab('capture')}
            className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'capture'
                ? 'bg-white text-violet-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Camera className="mr-2 inline-block h-4 w-4" />
            Capture Photo
          </button>
          <button
            onClick={() => setActiveTab('gallery')}
            className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'gallery'
                ? 'bg-white text-violet-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <ImageIcon className="mr-2 inline-block h-4 w-4" />
            Photo Gallery
          </button>
        </div>

        {activeTab === 'capture' ? <CaptureFlow /> : <PhotoGallery />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capture Flow — Input → Camera → Preview → Upload → Success
// ---------------------------------------------------------------------------

function CaptureFlow() {
  const [step, setStep] = useState<CaptureStep>('lifefileId');
  const [lifefileId, setLifefileId] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [capturedImage, setCapturedImage] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackingSaving, setTrackingSaving] = useState(false);

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
  }, [previewUrl]);

  const handleCapture = useCallback((blob: Blob) => {
    setCapturedImage(blob);
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
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

      const res = await fetch('/api/package-photos', {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth-token') || localStorage.getItem('pharmacy_rep-token') || ''}`,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(err.error || 'Upload failed');
      }

      const json = await res.json();
      setUploadResult(json.data);

      if (json.data.trackingNumber) {
        setTrackingNumber(json.data.trackingNumber);
      }

      setStep('tracking');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setStep('preview');
    }
  }, [capturedImage, lifefileId]);

  const handleSaveTracking = useCallback(async () => {
    if (!uploadResult || !trackingNumber.trim()) return;

    setTrackingSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/package-photos/${uploadResult.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth-token') || localStorage.getItem('pharmacy_rep-token') || ''}`,
        },
        body: JSON.stringify({ trackingNumber: trackingNumber.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to save tracking' }));
        throw new Error(err.error || 'Failed to save tracking');
      }

      const json = await res.json();
      setUploadResult((prev) =>
        prev
          ? {
              ...prev,
              trackingNumber: json.data.trackingNumber,
              trackingSource: json.data.trackingSource,
            }
          : prev,
      );
      setStep('success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save tracking.');
    } finally {
      setTrackingSaving(false);
    }
  }, [uploadResult, trackingNumber]);

  return (
    <div className="mx-auto max-w-lg">
      <StepIndicator currentStep={step} />

      {/* Step 1: LifeFile ID */}
      {step === 'lifefileId' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-violet-50">
              <Package className="h-7 w-7 text-violet-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Identify Package</h2>
            <p className="mt-1 text-sm text-gray-500">Enter the LifeFile ID from the package label</p>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="lifefileId" className="mb-1.5 block text-sm font-medium text-gray-700">
                LifeFile ID
              </label>
              <input
                id="lifefileId"
                type="text"
                value={lifefileId}
                onChange={(e) => setLifefileId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && lifefileId.trim()) setStep('camera');
                }}
                placeholder="e.g. 123456"
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-lg font-mono tracking-wider placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>

            <button
              onClick={() => setStep('camera')}
              disabled={!lifefileId.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              <Camera className="h-5 w-5" />
              Next — Take Photo
            </button>
          </div>
        </div>
      )}

      {/* Step 2a: Camera */}
      {step === 'camera' && (
        <CameraCapture
          onCapture={handleCapture}
          onCancel={() => setStep('lifefileId')}
          lifefileId={lifefileId}
        />
      )}

      {/* Step 2b: Preview */}
      {step === 'preview' && previewUrl && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Review Photo</h2>
            <span className="rounded-full bg-violet-100 px-3 py-1 font-mono text-sm font-medium text-violet-700">
              ID: {lifefileId}
            </span>
          </div>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              <XCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="mb-4 overflow-hidden rounded-xl border border-gray-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Package preview" className="w-full" />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRetake}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Retake
            </button>
            <button
              onClick={handleUpload}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
            >
              <CheckCircle className="h-4 w-4" />
              Upload Photo
            </button>
          </div>
        </div>
      )}

      {/* Step 2c: Uploading */}
      {step === 'uploading' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-violet-600" />
          <p className="mt-4 text-sm font-medium text-gray-600">Uploading photo...</p>
        </div>
      )}

      {/* Step 3: Tracking Number */}
      {step === 'tracking' && uploadResult && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
              <CheckCircle className="h-7 w-7 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Photo Saved</h2>
            <p className="mt-1 text-sm text-gray-500">
              Now add a tracking number, or skip to add it later
            </p>
          </div>

          <div className="mb-4 rounded-xl bg-gray-50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">LifeFile ID</span>
              <span className="font-mono font-medium text-gray-900">{uploadResult.lifefileId}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gray-500">Match Status</span>
              {uploadResult.matched ? (
                <span className="flex items-center gap-1.5 font-medium text-green-700">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Matched
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-medium text-amber-600">
                  <XCircle className="h-3.5 w-3.5" />
                  No Match
                </span>
              )}
            </div>
          </div>

          {uploadResult.trackingNumber ? (
            <div className="mb-4 flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-blue-700">
                <Truck className="h-4 w-4" />
                Auto-detected Tracking
              </span>
              <span className="font-mono text-xs font-semibold text-blue-900">
                {uploadResult.trackingNumber}
              </span>
            </div>
          ) : (
            <div className="mb-4 space-y-3">
              <div>
                <label htmlFor="trackingStep" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Tracking Number <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  id="trackingStep"
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && trackingNumber.trim()) handleSaveTracking();
                  }}
                  placeholder="Enter tracking number"
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 font-mono text-sm tracking-wider placeholder:font-sans placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  <XCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {trackingNumber.trim() && (
                <button
                  onClick={handleSaveTracking}
                  disabled={trackingSaving}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                >
                  {trackingSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Truck className="h-4 w-4" />
                  )}
                  Save Tracking Number
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setStep('success')}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
              uploadResult.trackingNumber || trackingNumber.trim()
                ? 'bg-violet-600 text-white hover:bg-violet-700'
                : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {uploadResult.trackingNumber ? 'Continue' : 'Skip — Add Later'}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Done */}
      {step === 'success' && uploadResult && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
              <CheckCircle className="h-7 w-7 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">All Done</h2>
          </div>

          <div className="mb-5 space-y-3 rounded-xl bg-gray-50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">LifeFile ID</span>
              <span className="font-mono font-medium text-gray-900">{uploadResult.lifefileId}</span>
            </div>
            {uploadResult.trackingNumber && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-gray-500">
                  <Truck className="h-3.5 w-3.5" />
                  Tracking
                </span>
                <span className="font-mono text-xs font-medium text-gray-900">{uploadResult.trackingNumber}</span>
              </div>
            )}
            {uploadResult.trackingSource && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tracking Source</span>
                <span className="text-gray-700">
                  {TRACKING_SOURCE_LABELS[uploadResult.trackingSource] || uploadResult.trackingSource}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Match Status</span>
              {uploadResult.matched ? (
                <span className="flex items-center gap-1.5 font-medium text-green-700">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Matched — Linked to Patient
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-medium text-amber-600">
                  <XCircle className="h-3.5 w-3.5" />
                  No Match Found — Stored for Search
                </span>
              )}
            </div>
            {uploadResult.orderId && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Order</span>
                <span className="font-medium text-gray-700">#{uploadResult.orderId}</span>
              </div>
            )}
          </div>

          <button
            onClick={reset}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
          >
            <Camera className="h-5 w-5" />
            Scan Next Package
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Camera Capture Component
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

  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    setCameraReady(false);
    setCameraError(null);

    // Stop previous stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch {
      setCameraError('Unable to access camera. Please grant camera permissions and try again.');
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
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

    canvas.toBlob(
      (blob) => {
        if (blob) {
          // Stop camera after capture
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
          }
          onCapture(blob);
        }
      },
      'image/jpeg',
      0.85,
    );
  }, [onCapture]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-black shadow-sm">
      {/* Camera header bar */}
      <div className="flex items-center justify-between bg-gray-900/90 px-4 py-3">
        <button
          onClick={() => {
            if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
            onCancel();
          }}
          className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
        <span className="rounded-full bg-violet-600/80 px-3 py-1 font-mono text-xs font-medium text-white">
          ID: {lifefileId}
        </span>
        <button
          onClick={switchCamera}
          className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white"
        >
          <SwitchCamera className="h-4 w-4" />
          Flip
        </button>
      </div>

      {/* Video feed */}
      <div className="relative aspect-[4/3] w-full bg-black">
        {cameraError ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <Camera className="mb-3 h-10 w-10 text-gray-500" />
            <p className="text-sm text-gray-400">{cameraError}</p>
            <button
              onClick={() => startCamera(facingMode)}
              className="mt-3 text-sm font-medium text-violet-400 hover:text-violet-300"
            >
              Try Again
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Capture button */}
      <div className="flex items-center justify-center bg-gray-900/90 py-5">
        <button
          onClick={capturePhoto}
          disabled={!cameraReady}
          className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
          aria-label="Capture photo"
        >
          <div className="h-12 w-12 rounded-full bg-white" />
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photo Gallery — Search & browse all package photos
// ---------------------------------------------------------------------------

function PhotoGallery() {
  const [photos, setPhotos] = useState<PackagePhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [matchFilter, setMatchFilter] = useState<'all' | 'true' | 'false'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedPhoto, setSelectedPhoto] = useState<PackagePhotoRecord | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPhotos = useCallback(async (searchVal: string, matchVal: string, pageVal: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchVal) params.set('search', searchVal);
      if (matchVal !== 'all') params.set('matched', matchVal);
      params.set('page', String(pageVal));
      params.set('limit', '20');

      const res = await apiFetch(`/api/package-photos?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setPhotos(json.data);
        setTotalPages(json.meta.totalPages);
        setTotal(json.meta.total);
      }
    } catch {
      // Error handled silently; photos remain empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos(search, matchFilter, page);
  }, [fetchPhotos, matchFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => {
        setPage(1);
        fetchPhotos(value, matchFilter, 1);
      }, 400);
    },
    [fetchPhotos, matchFilter],
  );

  return (
    <div>
      {/* Search + Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by LifeFile ID or tracking number..."
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={matchFilter}
            onChange={(e) => {
              setMatchFilter(e.target.value as 'all' | 'true' | 'false');
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="all">All Photos</option>
            <option value="true">Matched Only</option>
            <option value="false">Unmatched Only</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      <div className="mb-4 text-sm text-gray-500">
        {loading ? 'Loading...' : `${total} photo${total !== 1 ? 's' : ''} found`}
      </div>

      {/* Photo grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-3">
              <div className="mb-3 aspect-square rounded-lg bg-gray-200" />
              <div className="mb-2 h-4 w-2/3 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white py-16 text-center">
          <ImageIcon className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No package photos found</p>
          <p className="mt-1 text-xs text-gray-400">
            {search ? 'Try a different LifeFile ID' : 'Photos will appear here after capture'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <button
              key={photo.id}
              onClick={() => setSelectedPhoto(photo)}
              className="group rounded-xl border border-gray-200 bg-white p-3 text-left transition-shadow hover:shadow-md"
            >
              <div className="relative mb-3 aspect-square overflow-hidden rounded-lg bg-gray-100">
                {photo.s3Url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={photo.s3Url}
                    alt={`Package ${photo.lifefileId}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-gray-300" />
                  </div>
                )}
                <div className="absolute right-1.5 top-1.5">
                  {photo.matched ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                      <CheckCircle className="mr-0.5 h-3 w-3" />
                      Matched
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      Unmatched
                    </span>
                  )}
                </div>
              </div>
              <p className="font-mono text-sm font-semibold text-gray-900">{photo.lifefileId}</p>
              {photo.trackingNumber && (
                <p className="mt-0.5 flex items-center gap-1 truncate font-mono text-[11px] text-blue-600">
                  <Truck className="h-3 w-3 flex-shrink-0" />
                  {photo.trackingNumber}
                </p>
              )}
              <p className="mt-0.5 text-xs text-gray-500">
                {new Date(photo.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </p>
              <p className="mt-0.5 truncate text-xs text-gray-400">
                by {photo.capturedBy.firstName} {photo.capturedBy.lastName}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>
          <span className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Photo Detail Modal */}
      {selectedPhoto && (
        <PhotoDetailModal photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photo Detail Modal
// ---------------------------------------------------------------------------

function PhotoDetailModal({
  photo,
  onClose,
}: {
  photo: PackagePhotoRecord;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-violet-100 px-3 py-1 font-mono text-sm font-medium text-violet-700">
              ID: {photo.lifefileId}
            </span>
            {photo.matched ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                <CheckCircle className="h-3.5 w-3.5" />
                Matched
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                <XCircle className="h-3.5 w-3.5" />
                Unmatched
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Photo */}
        <div className="bg-gray-50 px-5 py-4">
          {photo.s3Url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photo.s3Url}
              alt={`Package ${photo.lifefileId}`}
              className="w-full rounded-xl"
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-xl bg-gray-200">
              <ImageIcon className="h-10 w-10 text-gray-400" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-3 px-5 py-4">
          {/* Tracking — prominent display */}
          {photo.trackingNumber && (
            <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2.5 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-blue-700">
                <Truck className="h-4 w-4" />
                Tracking
              </span>
              <span className="font-mono text-xs font-semibold text-blue-900">{photo.trackingNumber}</span>
            </div>
          )}
          {photo.trackingSource && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Tracking Source</span>
              <span className="text-gray-900">
                {TRACKING_SOURCE_LABELS[photo.trackingSource] || photo.trackingSource}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Captured by</span>
            <span className="flex items-center gap-1.5 font-medium text-gray-900">
              <User className="h-3.5 w-3.5 text-gray-400" />
              {photo.capturedBy.firstName} {photo.capturedBy.lastName}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Date &amp; Time</span>
            <span className="text-gray-900">
              {new Date(photo.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </div>
          {photo.patient && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Patient</span>
              <span className="font-medium text-gray-900">
                {photo.patient.firstName} {photo.patient.lastName}
              </span>
            </div>
          )}
          {photo.order && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Order</span>
              <span className="text-gray-900">
                #{photo.order.id}
                {photo.order.lifefileOrderId && ` (Lifefile: ${photo.order.lifefileOrderId})`}
              </span>
            </div>
          )}
          {photo.matchStrategy && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Matched via</span>
              <span className="text-gray-900">
                {photo.matchStrategy === 'lifefileOrderId' ? 'LifeFile Order ID' : 'Patient LifeFile ID'}
              </span>
            </div>
          )}
          {photo.notes && (
            <div className="text-sm">
              <span className="text-gray-500">Notes</span>
              <p className="mt-1 text-gray-900">{photo.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
