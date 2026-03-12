'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { PatientPhotoType } from '@/types/prisma-enums';
import { Camera, Loader2, AlertCircle, CheckCircle, X, RotateCcw } from 'lucide-react';
import { getAuthToken } from '@/lib/utils/auth-token';

interface CaptureStepConfig {
  type: PatientPhotoType;
  label: string;
  instruction: string;
  facingMode: 'user' | 'environment';
}

const MAX_DIMENSION = 2048;
const COMPRESSION_QUALITY = 0.85;
const UPLOAD_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;

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
      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve({ blob, width: Math.round(width), height: Math.round(height) })
            : reject(new Error('Compression failed')),
        'image/jpeg',
        COMPRESSION_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
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
      if (width > height) {
        height = (height / width) * maxSize;
        width = maxSize;
      } else {
        width = (width / height) * maxSize;
        height = maxSize;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Thumbnail failed'))),
        'image/jpeg',
        0.7,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image load failed'));
    };
    img.src = url;
  });
}

/**
 * Upload photo via server-side direct upload (bypasses S3 CORS).
 * Sends the file as FormData to the API which handles S3 upload + DB record in one request.
 */
async function uploadVerificationPhoto(
  compressed: Blob,
  type: PatientPhotoType,
  width: number,
  height: number,
  originalBlob: Blob,
): Promise<void> {
  const formData = new FormData();
  formData.append('file', compressed, `${type.toLowerCase()}.jpg`);
  formData.append('type', type);
  formData.append('width', String(width));
  formData.append('height', String(height));
  formData.append('uploadedFrom', 'camera');

  // Best-effort thumbnail
  try {
    const thumb = await createThumbnail(originalBlob);
    formData.append('thumbnail', thumb, `${type.toLowerCase()}_thumb.jpg`);
  } catch {
    // Thumbnail is optional
  }

  const headers: HeadersInit = {};
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const resp = await fetch('/api/patient-portal/photos/upload-direct', {
        method: 'POST',
        body: formData,
        headers,
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (resp.ok) return;

      const body = await resp.json().catch(() => ({ error: 'Upload failed' }));

      if (resp.status === 401 || resp.status === 403) {
        throw new Error('Your session has expired. Please log in again.');
      }
      if (resp.status === 503) {
        throw new Error('Photo upload service is temporarily unavailable. Please try again later.');
      }

      lastError = new Error(body.error || 'Upload failed');

      // Don't retry client errors (400, 404)
      if (resp.status >= 400 && resp.status < 500) throw lastError;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && (err.message.includes('session') || err.message.includes('unavailable'))) {
        throw err;
      }
      const isTimeout = (err as any)?.name === 'AbortError';
      const isNetwork = (err as any)?.name === 'TypeError';
      lastError = isTimeout
        ? new Error('Upload timed out. Please check your connection and try again.')
        : isNetwork
          ? new Error('Unable to reach the server. Please check your internet connection.')
          : err instanceof Error
            ? err
            : new Error('Upload failed');

      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError ?? new Error('Upload failed. Please try again.');
}

type CapturePhase = 'camera' | 'preview' | 'uploading' | 'complete';

export default function VerificationCaptureOverlay({
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
          videoRef.current.play().catch(() => undefined);
        }
      } catch {
        if (mountedRef.current) {
          setError('Camera access denied. Please allow camera permissions and try again.');
        }
      }
    },
    [stopCamera],
  );

  useEffect(() => {
    if (phase === 'camera' && step) {
      startCamera(step.facingMode);
    }
    return () => {
      if (phase === 'camera') stopCamera();
    };
  }, [stepIndex, phase, step, startCamera, stopCamera]);

  useEffect(() => {
    if (streamRef.current && videoRef.current && phase === 'camera') {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => undefined);
    }
  }, [phase]);

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
    canvas.toBlob((b) => {
      if (b) setCapturedBlob(b);
    }, 'image/jpeg', 0.92);

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
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black" style={{ touchAction: 'none' }}>
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
          <div className="w-11" />
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        {phase === 'camera' && (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${step.facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              onLoadedMetadata={(e) => e.currentTarget.play().catch(() => undefined)}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              {step.type === 'SELFIE' ? (
                <div className="h-72 w-72 rounded-full border-[3px] border-white/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
              ) : (
                <div className="h-56 w-[22rem] max-w-[90vw] rounded-2xl border-[3px] border-white/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
              )}
            </div>
            <div className="absolute bottom-6 left-0 right-0 text-center">
              <span className="inline-block rounded-full bg-black/60 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-sm">
                {step.instruction}
              </span>
            </div>
          </>
        )}

        {phase === 'preview' && capturedDataUrl && (
          <img src={capturedDataUrl} alt="Captured photo" className="h-full w-full object-contain" />
        )}

        {phase === 'uploading' && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-white" />
            <p className="text-lg font-medium text-white">Uploading...</p>
            <p className="text-sm text-white/50">
              {isLastStep
                ? 'Almost done'
                : `${steps.length - stepIndex - 1} step${steps.length - stepIndex - 1 !== 1 ? 's' : ''} remaining`}
            </p>
          </div>
        )}

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

        {error && phase !== 'complete' && (
          <div className="absolute bottom-20 left-4 right-4">
            <div className="flex items-center gap-3 rounded-xl bg-red-500/90 p-4 text-white backdrop-blur-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="flex-1 text-sm">{error}</p>
            </div>
          </div>
        )}
      </div>

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
              onClick={() => {
                setError(null);
                startCamera(step.facingMode);
              }}
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
