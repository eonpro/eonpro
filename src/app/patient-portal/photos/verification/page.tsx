'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';
import {
  Shield,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Camera,
  CreditCard,
  User,
  AlertCircle,
  Info,
  RefreshCw,
} from 'lucide-react';
import { PatientPhotoType, PatientPhotoVerificationStatus } from '@/types/prisma-enums';
import { format, parseISO } from 'date-fns';
const VerificationCaptureOverlay = dynamic(
  () => import('@/components/patient-portal/photos/VerificationCaptureOverlay'),
  { ssr: false },
);

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

// =============================================================================
// Main Page
// =============================================================================

export default function IDVerificationPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);
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
      if (data && typeof data === 'object' && 'warning' in data) {
        setPhotoWarning((data as { warning?: string }).warning || null);
      } else {
        setPhotoWarning(null);
      }
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

  // Loading — skeleton matches final layout to prevent CLS
  if (loading) {
    return (
      <div className="min-h-[100dvh] animate-pulse px-4 py-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gray-200" />
          <div>
            <div className="h-6 w-48 rounded bg-gray-200" />
            <div className="mt-1 h-4 w-32 rounded bg-gray-100" />
          </div>
        </div>
        <div className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 h-5 w-40 rounded bg-gray-200" />
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="mt-2 h-4 w-3/4 rounded bg-gray-100" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
              <div className="h-14 w-14 rounded-xl bg-gray-200" />
              <div className="flex-1">
                <div className="h-5 w-32 rounded bg-gray-200" />
                <div className="mt-1 h-4 w-20 rounded bg-gray-100" />
              </div>
              <div className="h-6 w-20 rounded-full bg-gray-200" />
            </div>
          ))}
        </div>
        <div className="mt-6 h-12 w-full rounded-xl bg-gray-200" />
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
        <VerificationCaptureOverlay
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

      {/* Photo Loading Warning */}
      {photoWarning && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-800">{photoWarning}</p>
            <button
              onClick={fetchPhotos}
              className="mt-1 text-xs font-medium text-amber-700 underline hover:text-amber-900"
            >
              Retry loading photos
            </button>
          </div>
        </div>
      )}

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
