'use client';

/**
 * ID Verification Page
 *
 * Allows patients to upload ID documents for verification:
 * - Front of ID (driver's license, state ID, passport)
 * - Back of ID
 * - Selfie for identity verification
 * - Clear guidelines and status tracking
 */

import { useState, useEffect, useCallback } from 'react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';
import dynamic from 'next/dynamic';

const PhotoUploader = dynamic(
  () => import('@/components/patient-portal/photos').then(mod => ({ default: mod.PhotoUploader })),
  {
    loading: () => <div className="animate-pulse rounded-2xl bg-gray-100 h-64 w-full" />,
    ssr: false,
  },
);
import {
  Shield,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Camera,
  CreditCard,
  User,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Info,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { PatientPhotoType, PatientPhotoVerificationStatus } from '@/types/prisma-enums';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';

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

type UploadStep = 'ID_FRONT' | 'ID_BACK' | 'SELFIE';

// =============================================================================
// Verification Status Config
// =============================================================================

const VERIFICATION_STATUS: Record<
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
    description: 'Your ID could not be verified. Please upload a new photo.',
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

const UPLOAD_STEPS: {
  step: UploadStep;
  type: PatientPhotoType;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    step: 'ID_FRONT',
    type: 'ID_FRONT',
    label: 'Front of ID',
    description: "Driver's license, state ID, or passport",
    icon: CreditCard,
  },
  {
    step: 'ID_BACK',
    type: 'ID_BACK',
    label: 'Back of ID',
    description: 'Back side showing barcode',
    icon: CreditCard,
  },
  {
    step: 'SELFIE',
    type: 'SELFIE',
    label: 'Selfie',
    description: 'Clear photo of your face',
    icon: User,
  },
];

const ID_GUIDELINES = [
  "Use your government-issued ID (driver's license, state ID, or passport)",
  'Make sure all text is clearly readable',
  'Capture the entire ID without cropping edges',
  'Avoid glare or reflections on the ID',
  'Take the photo in good lighting',
];

const SELFIE_GUIDELINES = [
  'Face the camera directly',
  'Ensure good, even lighting on your face',
  'Remove sunglasses, hats, or face coverings',
  'Keep a neutral expression',
  'Make sure your face is clearly visible',
];

// =============================================================================
// Component
// =============================================================================

export default function IDVerificationPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState<UploadStep | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Fetch existing verification photos
  const fetchPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const response = await portalFetch(
        '/api/patient-portal/photos?type=ID_FRONT&type=ID_BACK&type=SELFIE'
      );

      if (!response.ok) {
        throw new Error('Failed to load verification status');
      }

      const data = await safeParseJson(response);
      const photos =
        data !== null && typeof data === 'object' && 'photos' in data
          ? (data as { photos?: Photo[] }).photos ?? []
          : [];
      const verificationPhotos = photos.filter((p: Photo) =>
        ['ID_FRONT', 'ID_BACK', 'SELFIE'].includes(p.type)
      );

      setPhotos(verificationPhotos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // Get photo by type
  const getPhotoByType = (type: PatientPhotoType): Photo | undefined => {
    return photos.find((p) => p.type === type);
  };

  // Get overall verification status
  const getOverallStatus = (): PatientPhotoVerificationStatus => {
    const idFront = getPhotoByType('ID_FRONT');
    const idBack = getPhotoByType('ID_BACK');
    const selfie = getPhotoByType('SELFIE');

    if (!idFront || !idBack || !selfie) return 'PENDING';

    // If any is rejected, overall is rejected
    if ([idFront, idBack, selfie].some((p) => p.verificationStatus === 'REJECTED')) {
      return 'REJECTED';
    }

    // If any is expired, overall is expired
    if ([idFront, idBack, selfie].some((p) => p.verificationStatus === 'EXPIRED')) {
      return 'EXPIRED';
    }

    // If all verified, overall is verified
    if ([idFront, idBack, selfie].every((p) => p.verificationStatus === 'VERIFIED')) {
      return 'VERIFIED';
    }

    // If any in review, overall is in review
    if ([idFront, idBack, selfie].some((p) => p.verificationStatus === 'IN_REVIEW')) {
      return 'IN_REVIEW';
    }

    return 'PENDING';
  };

  // Handle upload complete
  const handleUploadComplete = () => {
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setCurrentStep(null);
      setIsUploading(false);
      fetchPhotos();
    }, 1500);
  };

  // Start upload for a type
  const startUpload = (step: UploadStep) => {
    setCurrentStep(step);
    setIsUploading(true);
  };

  // Check if all required photos are uploaded
  const allPhotosUploaded = () => {
    return getPhotoByType('ID_FRONT') && getPhotoByType('ID_BACK') && getPhotoByType('SELFIE');
  };

  // Get next step to upload
  const getNextStep = (): UploadStep | null => {
    if (!getPhotoByType('ID_FRONT')) return 'ID_FRONT';
    if (!getPhotoByType('ID_BACK')) return 'ID_BACK';
    if (!getPhotoByType('SELFIE')) return 'SELFIE';
    return null;
  };

  const overallStatus = getOverallStatus();
  const statusConfig = VERIFICATION_STATUS[overallStatus];

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" style={{ color: primaryColor }} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-4">
        <AlertCircle className="mb-4 h-12 w-12 text-red-400" />
        <p className="mb-2 font-medium text-red-600">Error</p>
        <p className="mb-4 text-sm text-gray-500">{error}</p>
        <button
          onClick={() => {
            setError(null);
            fetchPhotos();
          }}
          className="rounded-lg bg-red-100 px-4 py-2 font-medium text-red-700 hover:bg-red-200"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Upload view
  if (isUploading && currentStep) {
    const stepConfig = UPLOAD_STEPS.find((s) => s.step === currentStep)!;
    const guidelines = currentStep === 'SELFIE' ? SELFIE_GUIDELINES : ID_GUIDELINES;

    return (
      <div className="min-h-[100dvh] px-4 py-6">
        {/* Success Toast */}
        {showSuccess && (
          <div className="animate-in slide-in-from-top-2 fixed right-4 top-4 z-50 flex items-center gap-3 rounded-2xl bg-gray-900 px-5 py-4 text-white shadow-2xl">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500">
              <CheckCircle className="h-4 w-4" />
            </div>
            <span className="font-medium">Photo uploaded!</span>
          </div>
        )}

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => {
              setCurrentStep(null);
              setIsUploading(false);
            }}
            className="-ml-2 rounded-full p-2 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{stepConfig.label}</h1>
            <p className="mt-1 text-sm text-gray-500">{stepConfig.description}</p>
          </div>
        </div>

        {/* Upload Card */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <PhotoUploader
            photoType={stepConfig.type}
            maxPhotos={1}
            onUploadComplete={handleUploadComplete}
            showGuidelines
            guidelines={guidelines}
            showCameraButton
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] px-4 py-6">
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
          <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-white`}>
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
        {UPLOAD_STEPS.map((step) => {
          const photo = getPhotoByType(step.type);
          const StepIcon = step.icon;
          const status = photo?.verificationStatus || 'NOT_APPLICABLE';
          const photoStatus = photo ? VERIFICATION_STATUS[status] : null;
          const needsUpload = !photo || status === 'REJECTED' || status === 'EXPIRED';

          return (
            <div
              key={step.step}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      photo ? photoStatus?.bgColor : 'bg-gray-100'
                    }`}
                  >
                    <StepIcon
                      className={`h-5 w-5 ${photo ? photoStatus?.color : 'text-gray-400'}`}
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

                {needsUpload ? (
                  <button
                    onClick={() => startUpload(step.step)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-100"
                    style={{ color: primaryColor }}
                  >
                    <Camera className="h-4 w-4" />
                    {photo ? 'Re-upload' : 'Upload'}
                  </button>
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}
              </div>

              {/* Show rejection reason if rejected */}
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

      {/* Quick Start Button */}
      {!allPhotosUploaded() && (
        <button
          onClick={() => {
            const nextStep = getNextStep();
            if (nextStep) startUpload(nextStep);
          }}
          className="w-full rounded-xl py-4 font-semibold text-white shadow-lg transition-all hover:shadow-xl"
          style={{ backgroundColor: primaryColor }}
        >
          {photos.length === 0 ? 'Start Verification' : 'Continue Verification'}
        </button>
      )}

      {/* Info Card */}
      <div className="mt-6 rounded-2xl bg-blue-50 p-5">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
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

      {/* Refresh Button */}
      {overallStatus === 'PENDING' || overallStatus === 'IN_REVIEW' ? (
        <button
          onClick={fetchPhotos}
          className="mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="h-4 w-4" />
          Check verification status
        </button>
      ) : null}
    </div>
  );
}
