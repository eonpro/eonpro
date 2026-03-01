'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';
import { apiFetch } from '@/lib/api/fetch';
import { getAuthHeaders } from '@/lib/utils/auth-token';
import {
  Shield,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Camera,
  CreditCard,
  User,
  Loader2,
  AlertCircle,
  Info,
  RefreshCw,
  X,
  RotateCcw,
} from 'lucide-react';
import { PatientPhotoType, PatientPhotoVerificationStatus } from '@/types/prisma-enums';
import { format, parseISO } from 'date-fns';

// =============================================================================
// Types
// =============================================================================

interface Photo {
  id: number;
  type: PatientPhotoType;
  s3Url: string | null;
  thumbnailUrl: string | null;
  takenAt: string;
  verificationStatus: PatientPhotoVerificationStatus;
  verifiedAt: string | null;
  verificationNotes: string | null;
}

interface CaptureStepConfig {
  type: PatientPhotoType;
  label: string;
  instruction: string;
  icon: React.ElementType;
  facingMode: 'user' | 'environment';
}

// =============================================================================
// Constants
// =============================================================================

const CAPTURE_STEPS: CaptureStepConfig[] = [
  {
    type: 'ID_FRONT',
    label: 'Front of ID',
    instruction: 'Position the front of your ID within the frame',
    icon: CreditCard,
    facingMode: 'environment',
  },
  {
    type: 'ID_BACK',
    label: 'Back of ID',
    instruction: 'Flip your ID over and capture the back',
    icon: CreditCard,
    facingMode: 'environment',
  },
  {
    type: 'SELFIE',
    label: 'Selfie',
    instruction: 'Look directly at the camera',
    icon: User,
    facingMode: 'user',
  },
];

const VERIFICATION_STATUS_CONFIG: Record<
  PatientPhotoVerificationStatus,
  { label: string; description: string; color: string; bgColor: string; icon: React.ElementType }
> = {
  NOT_APPLICABLE: {
    label: 'Not Required',
    description: 'Verification not needed',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    icon: Info,
  },
  PENDING: {
    label: 'Pending Review',
    description: 'Your ID is being reviewed by our team',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    icon: Clock,
  },
  IN_REVIEW: {
    label: 'In Review',
    description: 'A team member is currently reviewing your ID',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    icon: Clock,
  },
  VERIFIED: {
    label: 'Verified',
    description: 'Your identity has been successfully verified',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    icon: CheckCircle,
  },
  REJECTED: {
    label: 'Rejected',
    description: 'Your ID could not be verified. Please upload new photos.',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    icon: XCircle,
  },
  EXPIRED: {
    label: 'Expired',
    description: 'Your verification has expired. Please upload new photos.',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    icon: AlertTriangle,
  },
};

const MAX_DIMENSION = 2048;
const COMPRESSION_QUALITY = 0.85;

// =============================================================================
// Image Helpers
// =============================================================================

function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = (height / width) * MAX_DIMENSION;
          width = MAX_DIMENSION;
        } else {
          width = (width / height) * MAX_DIMENSION;
          height = MAX_DIMENSION;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context failed')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve({ blob, width: Math.round(width), height: Math.round(height) }) : reject(new Error('Compression failed')),
        'image/jpeg',
        COMPRESSION_QUALITY,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

function createThumbnail(blob: Blob, maxSize = 200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > height) { height = (height / width) * maxSize; width = maxSize; }
      else { width = (width / height) * maxSize; height = maxSize; }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas context failed')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error('Thumbnail failed')),
        'image/jpeg',
        0.7,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

async function uploadVerificationPhoto(
  compressed: Blob,
  type: PatientPhotoType,
  width: number,
  height: number,
  originalBlob: Blob,
): Promise<void> {
  const presigned = await apiFetch('/api/patient-portal/photos/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      type,
      contentType: 'image/jpeg',
      fileSize: compressed.size,
      includeThumbnail: true,
    }),
  });
  if (!presigned.ok) {
    const err = await presigned.json().catch(() => ({ error: 'Upload URL failed' }));
    throw new Error(err.error || 'Failed to get upload URL');
  }
  const { uploadUrl, s3Key, thumbnailUploadUrl, thumbnailKey } = await presigned.json();

  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    body: compressed,
    headers: { 'Content-Type': 'image/jpeg' },
  });
  if (!uploadResp.ok) throw new Error('S3 upload failed');

  let finalThumbnailKey: string | undefined;
  if (thumbnailUploadUrl && thumbnailKey) {
    try {
      const thumb = await createThumbnail(originalBlob);
      await fetch(thumbnailUploadUrl, {
        method: 'PUT',
        body: thumb,
        headers: { 'Content-Type': 'image/jpeg' },
      });
      finalThumbnailKey = thumbnailKey;
    } catch {
      // Thumbnail is best-effort
    }
  }

  const createResp = await apiFetch('/api/patient-portal/photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      type,
      s3Key,
      thumbnailKey: finalThumbnailKey,
      fileSize: compressed.size,
      mimeType: 'image/jpeg',
      width,
      height,
      uploadedFrom: 'camera',
    }),
  });
  if (!createResp.ok) {
    const err = await createResp.json().catch(() => ({ error: 'Save failed' }));
    throw new Error(err.error || 'Failed to save photo');
  }
}

// =============================================================================
// CaptureOverlay — fullscreen sequential camera capture (portal)
// =============================================================================

type CapturePhase = 'camera' | 'preview' | 'uploading' | 'complete' | 'error';

function CaptureOverlay({
  steps,
  primaryColor,
  onComplete,
  onCancel,
}: {
  steps: CaptureStepConfig[];
  primaryColor: string;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<CapturePhase>('camera');
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mountedRef = useRef(true);

  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(
    async (facing: 'user' | 'environment') => {
      stopCamera();
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!mountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch {
        if (mountedRef.current) setError('Camera access denied. Please allow camera permissions and try again.');
      }
    },
    [stopCamera],
  );

  // Open camera when step changes or phase becomes 'camera'
  useEffect(() => {
    if (phase === 'camera' && step) {
      startCamera(step.facingMode);
    }
    return () => {
      if (phase === 'camera') stopCamera();
    };
  }, [stepIndex, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Attach stream to video element when stream/video ready
  useEffect(() => {
    if (streamRef.current && videoRef.current && phase === 'camera') {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [phase]);

  // Hide layout chrome and cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    document.documentElement.classList.add('camera-fullscreen');
    return () => {
      mountedRef.current = false;
      stopCamera();
      document.documentElement.classList.remove('camera-fullscreen');
    };
  }, [stopCamera]);

  const capture = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    setCapturedDataUrl(canvas.toDataURL('image/jpeg', 0.92));
    canvas.toBlob((b) => { if (b) setCapturedBlob(b); }, 'image/jpeg', 0.92);

    stopCamera();
    setPhase('preview');
  }, [stopCamera]);

  const retake = useCallback(() => {
    setCapturedDataUrl(null);
    setCapturedBlob(null);
    setError(null);
    setPhase('camera');
  }, []);

  const usePhoto = useCallback(async () => {
    if (!capturedBlob || !step) return;
    setPhase('uploading');
    setError(null);

    try {
      const file = new File([capturedBlob], `${step.type.toLowerCase()}.jpg`, { type: 'image/jpeg' });
      const { blob: compressed, width, height } = await compressImage(file);
      await uploadVerificationPhoto(compressed, step.type, width, height, capturedBlob);

      setCapturedDataUrl(null);
      setCapturedBlob(null);

      if (isLastStep) {
        setPhase('complete');
        setTimeout(onComplete, 2200);
      } else {
        setStepIndex((prev) => prev + 1);
        setPhase('camera');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setPhase('preview');
    }
  }, [capturedBlob, step, isLastStep, onComplete]);

  const handleCancel = useCallback(() => {
    stopCamera();
    onCancel();
  }, [stopCamera, onCancel]);

  const overlay = (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black"
      style={{ touchAction: 'none' }}
    >
      {/* ── Top bar ── */}
      <div
        className="shrink-0 bg-black/80 px-4 pb-2 pt-3"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={handleCancel}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white active:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>
          {phase !== 'complete' && (
            <div className="text-center">
              <p className="text-base font-semibold text-white">{step.label}</p>
              <p className="text-xs text-white/60">
                Step {stepIndex + 1} of {steps.length}
              </p>
            </div>
          )}
          {phase !== 'complete' ? <div className="w-11" /> : <div className="w-11" />}
        </div>
        {/* Step progress dots */}
        {phase !== 'complete' && (
          <div className="mt-2 flex justify-center gap-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === stepIndex
                    ? 'w-8'
                    : i < stepIndex
                      ? 'w-4'
                      : 'w-4'
                }`}
                style={{
                  backgroundColor:
                    i === stepIndex
                      ? primaryColor
                      : i < stepIndex
                        ? `${primaryColor}99`
                        : 'rgba(255,255,255,0.2)',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Main area ── */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        {/* Camera feed */}
        {phase === 'camera' && (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${step.facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              onLoadedMetadata={(e) => e.currentTarget.play().catch(() => {})}
            />
            {/* Viewfinder guide */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {step.type === 'SELFIE' ? (
                <div className="h-72 w-72 rounded-full border-[3px] border-white/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
              ) : (
                <div className="h-56 w-[22rem] max-w-[90vw] rounded-2xl border-[3px] border-white/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
              )}
            </div>
            {/* Instruction banner */}
            <div className="absolute bottom-6 left-0 right-0 text-center">
              <span className="inline-block rounded-full bg-black/60 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-sm">
                {step.instruction}
              </span>
            </div>
          </>
        )}

        {/* Preview */}
        {phase === 'preview' && capturedDataUrl && (
          <img
            src={capturedDataUrl}
            alt="Captured photo"
            className="h-full w-full object-contain"
          />
        )}

        {/* Uploading */}
        {phase === 'uploading' && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-white" />
            <p className="text-lg font-medium text-white">Uploading{'\u2026'}</p>
            <p className="text-sm text-white/50">
              {isLastStep ? 'Almost done' : `${steps.length - stepIndex - 1} step${steps.length - stepIndex - 1 !== 1 ? 's' : ''} remaining`}
            </p>
          </div>
        )}

        {/* Complete */}
        {phase === 'complete' && (
          <div className="flex flex-col items-center gap-5">
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full"
              style={{ backgroundColor: primaryColor }}
            >
              <CheckCircle className="h-12 w-12 text-white" />
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">All Done!</p>
              <p className="mt-2 text-base text-white/60">Your ID is being reviewed</p>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && phase !== 'complete' && (
          <div className="absolute bottom-20 left-4 right-4">
            <div className="flex items-center gap-3 rounded-xl bg-red-500/90 p-4 text-white backdrop-blur-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="flex-1 text-sm">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom controls ── */}
      <div
        className="shrink-0 bg-black/80 px-6 py-5"
        style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom, 0px))' }}
      >
        {phase === 'camera' && !error && (
          <div className="flex items-center justify-center gap-8">
            <div className="w-14" />
            <button
              onClick={capture}
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/80 bg-white transition-transform active:scale-95"
            >
              <div className="h-16 w-16 rounded-full border-2 border-gray-300 bg-white" />
            </button>
            <button
              onClick={() => {
                stopCamera();
                const newFacing = step.facingMode === 'user' ? 'environment' : 'user';
                startCamera(newFacing);
              }}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white active:bg-white/30"
            >
              <RotateCcw className="h-6 w-6" />
            </button>
          </div>
        )}

        {phase === 'camera' && error && (
          <div className="flex gap-4">
            <button
              onClick={handleCancel}
              className="flex-1 rounded-xl bg-white/15 py-4 font-semibold text-white active:bg-white/25"
            >
              Cancel
            </button>
            <button
              onClick={() => { setError(null); startCamera(step.facingMode); }}
              className="flex-1 rounded-xl py-4 font-semibold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              Try Again
            </button>
          </div>
        )}

        {phase === 'preview' && (
          <div className="flex gap-4">
            <button
              onClick={retake}
              className="flex-1 rounded-xl bg-white/15 py-4 font-semibold text-white active:bg-white/25"
            >
              Retake
            </button>
            <button
              onClick={usePhoto}
              className="flex-1 rounded-xl py-4 font-semibold text-white active:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              Use Photo
            </button>
          </div>
        )}

        {phase === 'complete' && (
          <button
            onClick={onComplete}
            className="w-full rounded-xl py-4 font-semibold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Done
          </button>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );

  return createPortal(overlay, document.body);
}

// =============================================================================
// Main Page
// =============================================================================

export default function IDVerificationPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [captureActive, setCaptureActive] = useState(false);

  const fetchPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const response = await portalFetch(
        '/api/patient-portal/photos?type=ID_FRONT&type=ID_BACK&type=SELFIE',
      );
      if (!response.ok) throw new Error('Failed to load verification status');
      const data = await safeParseJson(response);
      const all =
        data !== null && typeof data === 'object' && 'photos' in data
          ? ((data as { photos?: Photo[] }).photos ?? [])
          : [];
      setPhotos(all.filter((p: Photo) => ['ID_FRONT', 'ID_BACK', 'SELFIE'].includes(p.type)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const getPhoto = (type: PatientPhotoType): Photo | undefined => photos.find((p) => p.type === type);

  const getOverallStatus = (): PatientPhotoVerificationStatus => {
    const trio = [getPhoto('ID_FRONT'), getPhoto('ID_BACK'), getPhoto('SELFIE')];
    if (trio.some((p) => !p)) return 'PENDING';
    if (trio.some((p) => p!.verificationStatus === 'REJECTED')) return 'REJECTED';
    if (trio.some((p) => p!.verificationStatus === 'EXPIRED')) return 'EXPIRED';
    if (trio.every((p) => p!.verificationStatus === 'VERIFIED')) return 'VERIFIED';
    if (trio.some((p) => p!.verificationStatus === 'IN_REVIEW')) return 'IN_REVIEW';
    return 'PENDING';
  };

  const stepsNeeded = CAPTURE_STEPS.filter((s) => {
    const photo = getPhoto(s.type);
    return !photo || photo.verificationStatus === 'REJECTED' || photo.verificationStatus === 'EXPIRED';
  });

  const overallStatus = getOverallStatus();
  const statusConfig = VERIFICATION_STATUS_CONFIG[overallStatus];

  const handleCaptureComplete = () => {
    setCaptureActive(false);
    fetchPhotos();
  };

  // Loading
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" style={{ color: primaryColor }} />
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-4">
        <AlertCircle className="mb-4 h-12 w-12 text-red-400" />
        <p className="mb-2 font-medium text-red-600">Error</p>
        <p className="mb-4 text-sm text-gray-500">{error}</p>
        <button
          onClick={() => { setError(null); fetchPhotos(); }}
          className="rounded-lg bg-red-100 px-4 py-2 font-medium text-red-700 hover:bg-red-200"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] px-4 py-6">
      {/* Capture overlay (fullscreen portal) */}
      {captureActive && stepsNeeded.length > 0 && (
        <CaptureOverlay
          steps={stepsNeeded}
          primaryColor={primaryColor}
          onComplete={handleCaptureComplete}
          onCancel={() => { setCaptureActive(false); fetchPhotos(); }}
        />
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${primaryColor}20` }}
          >
            <Shield className="h-5 w-5" style={{ color: primaryColor }} />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">ID Verification</h1>
        </div>
        <p className="text-sm text-gray-500">
          Verify your identity to access all platform features
        </p>
      </div>

      {/* Overall Status Card */}
      <div className={`rounded-2xl ${statusConfig.bgColor} mb-6 p-5`}>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white">
            <statusConfig.icon className={`h-6 w-6 ${statusConfig.color}`} />
          </div>
          <div className="flex-1">
            <p className={`font-semibold ${statusConfig.color}`}>{statusConfig.label}</p>
            <p className="mt-1 text-sm text-gray-600">{statusConfig.description}</p>
            {overallStatus === 'VERIFIED' && photos[0]?.verifiedAt && (
              <p className="mt-2 text-xs text-gray-500">
                Verified on {format(parseISO(photos[0].verifiedAt), 'MMM d, yyyy')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Document Status List */}
      <div className="mb-6 space-y-3">
        {CAPTURE_STEPS.map((step) => {
          const photo = getPhoto(step.type);
          const StepIcon = step.icon;
          const status = photo?.verificationStatus || 'NOT_APPLICABLE';
          const photoStatus = photo ? VERIFICATION_STATUS_CONFIG[status] : null;
          const uploaded = !!photo && status !== 'REJECTED' && status !== 'EXPIRED';

          return (
            <div
              key={step.type}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      photo ? (photoStatus?.bgColor ?? 'bg-gray-100') : 'bg-gray-100'
                    }`}
                  >
                    <StepIcon
                      className={`h-5 w-5 ${photo ? (photoStatus?.color ?? 'text-gray-400') : 'text-gray-400'}`}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{step.label}</p>
                    {photo ? (
                      <p className={`text-xs ${photoStatus?.color}`}>{photoStatus?.label}</p>
                    ) : (
                      <p className="text-xs text-gray-500">Not uploaded</p>
                    )}
                  </div>
                </div>
                {uploaded ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${primaryColor}15` }}
                  >
                    <Camera className="h-4 w-4" style={{ color: primaryColor }} />
                  </div>
                )}
              </div>
              {status === 'REJECTED' && photo?.verificationNotes && (
                <div className="mt-3 rounded-lg bg-red-50 p-3">
                  <p className="text-sm text-red-700">
                    <strong>Reason:</strong> {photo.verificationNotes}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Start / Continue Verification */}
      {stepsNeeded.length > 0 && (
        <button
          onClick={() => setCaptureActive(true)}
          className="flex w-full items-center justify-center gap-3 rounded-xl py-4 font-semibold text-white shadow-lg transition-all active:scale-[0.98]"
          style={{ backgroundColor: primaryColor }}
        >
          <Camera className="h-5 w-5" />
          {photos.length === 0
            ? 'Start Verification'
            : stepsNeeded.length === CAPTURE_STEPS.length
              ? 'Restart Verification'
              : 'Continue Verification'}
        </button>
      )}

      {/* Info Card */}
      <div className="mt-6 rounded-2xl bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <p className="mb-2 font-medium text-blue-900">Why we need this</p>
            <ul className="space-y-1 text-sm text-blue-700">
              <li>• Required by healthcare regulations</li>
              <li>• Protects your medical information</li>
              <li>• Ensures prescriptions reach the right person</li>
              <li>• Your photos are encrypted and secure</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Refresh button for pending/in-review */}
      {(overallStatus === 'PENDING' || overallStatus === 'IN_REVIEW') && stepsNeeded.length === 0 && (
        <button
          onClick={fetchPhotos}
          className="mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="h-4 w-4" />
          Check verification status
        </button>
      )}
    </div>
  );
}
