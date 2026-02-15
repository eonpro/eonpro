'use client';

/**
 * Medical Images Page
 *
 * Allows patients to upload medical images:
 * - Body part selection for categorization
 * - Different photo types (skin, injury, symptom, etc.)
 * - Notes/description for context
 * - Secure storage and care team access
 */

import { useState, useEffect, useCallback } from 'react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';
import { logger } from '@/lib/logger';
import { PhotoUploader, PhotoGallery } from '@/components/patient-portal/photos';
import {
  Camera,
  Plus,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle,
  Info,
  Stethoscope,
  User,
  Hand,
  Eye,
  Activity,
  Heart,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { PatientPhotoType } from '@prisma/client';
import Link from 'next/link';

// =============================================================================
// Types
// =============================================================================

interface Photo {
  id: number;
  createdAt: string;
  type: PatientPhotoType;
  category: string | null;
  s3Url: string | null;
  thumbnailUrl: string | null;
  title: string | null;
  notes: string | null;
  takenAt: string;
  verificationStatus: any;
  verifiedAt: string | null;
  isPrivate: boolean;
  isDeleted: boolean;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  weight: number | null;
}

type ViewMode = 'gallery' | 'upload';

// =============================================================================
// Medical Photo Types
// =============================================================================

const MEDICAL_PHOTO_TYPES: {
  type: PatientPhotoType;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    type: 'MEDICAL_SKIN',
    label: 'Skin Condition',
    description: 'Rashes, moles, acne, or other skin concerns',
    icon: Eye,
  },
  {
    type: 'MEDICAL_INJURY',
    label: 'Injury',
    description: 'Bruises, cuts, swelling, or physical injuries',
    icon: Activity,
  },
  {
    type: 'MEDICAL_SYMPTOM',
    label: 'Symptom',
    description: 'Visual symptoms like swelling, discoloration',
    icon: Stethoscope,
  },
  {
    type: 'MEDICAL_BEFORE',
    label: 'Before Treatment',
    description: 'Document condition before starting treatment',
    icon: Camera,
  },
  {
    type: 'MEDICAL_AFTER',
    label: 'After Treatment',
    description: 'Document results after treatment',
    icon: CheckCircle,
  },
  {
    type: 'MEDICAL_OTHER',
    label: 'Other',
    description: 'Any other medical-related photo',
    icon: FileText,
  },
];

// =============================================================================
// Body Parts
// =============================================================================

const BODY_PARTS: { id: string; label: string; icon: React.ElementType }[] = [
  { id: 'head', label: 'Head/Face', icon: User },
  { id: 'neck', label: 'Neck', icon: User },
  { id: 'chest', label: 'Chest', icon: Heart },
  { id: 'back', label: 'Back', icon: User },
  { id: 'abdomen', label: 'Abdomen', icon: Activity },
  { id: 'arm-left', label: 'Left Arm', icon: Hand },
  { id: 'arm-right', label: 'Right Arm', icon: Hand },
  { id: 'hand-left', label: 'Left Hand', icon: Hand },
  { id: 'hand-right', label: 'Right Hand', icon: Hand },
  { id: 'leg-left', label: 'Left Leg', icon: Activity },
  { id: 'leg-right', label: 'Right Leg', icon: Activity },
  { id: 'foot-left', label: 'Left Foot', icon: Activity },
  { id: 'foot-right', label: 'Right Foot', icon: Activity },
  { id: 'other', label: 'Other', icon: Stethoscope },
];

const PHOTO_GUIDELINES = [
  'Take clear, well-lit photos of the affected area',
  'Include a reference for scale if possible',
  'Capture multiple angles if helpful',
  'Add detailed notes about symptoms',
  'Your care team will review these photos',
];

// =============================================================================
// Component
// =============================================================================

export default function MedicalImagesPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Upload state
  const [selectedType, setSelectedType] = useState<PatientPhotoType | null>(null);
  const [selectedBodyPart, setSelectedBodyPart] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  // Fetch medical photos
  const fetchPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const types = MEDICAL_PHOTO_TYPES.map((t) => `type=${t.type}`).join('&');
      const response = await portalFetch(`/api/patient-portal/photos?${types}`);

      if (!response.ok) {
        throw new Error('Failed to load photos');
      }

      const data = await safeParseJson(response);
      const photos =
        data !== null && typeof data === 'object' && 'photos' in data
          ? (data as { photos?: Photo[] }).photos ?? []
          : [];
      const medicalPhotos = photos.filter((p: Photo) =>
        MEDICAL_PHOTO_TYPES.some((t) => t.type === p.type)
      );

      setPhotos(medicalPhotos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // Handle upload complete
  const handleUploadComplete = () => {
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setViewMode('gallery');
      setSelectedType(null);
      setSelectedBodyPart(null);
      setNotes('');
      fetchPhotos();
    }, 1500);
  };

  // Handle photo delete
  const handleDeletePhoto = async (photoId: number) => {
    try {
      const response = await portalFetch(`/api/patient-portal/photos/${photoId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      }
    } catch (err) {
      logger.error('Failed to delete photo', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  };

  // Reset upload state
  const resetUpload = () => {
    setViewMode('gallery');
    setSelectedType(null);
    setSelectedBodyPart(null);
    setNotes('');
  };

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
        <p className="mb-2 font-medium text-red-600">Error Loading Photos</p>
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
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {viewMode === 'upload' && (
            <button
              onClick={resetUpload}
              className="-ml-2 rounded-full p-2 transition-colors hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {viewMode === 'gallery' ? 'Medical Images' : 'Upload Medical Photo'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {viewMode === 'gallery'
                ? 'Share photos with your care team'
                : 'Select type and body area'}
            </p>
          </div>
        </div>

        {viewMode === 'gallery' && (
          <button
            onClick={() => setViewMode('upload')}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-medium text-white shadow-lg transition-all hover:shadow-xl"
            style={{ backgroundColor: primaryColor }}
          >
            <Camera className="h-5 w-5" />
            <span className="hidden sm:inline">Upload</span>
          </button>
        )}
      </div>

      {/* Gallery View */}
      {viewMode === 'gallery' && (
        <div className="space-y-6">
          {photos.length > 0 ? (
            <PhotoGallery
              photos={photos as any}
              onDelete={handleDeletePhoto}
              showFilters
              showDateGroups
              emptyMessage="No medical images yet"
            />
          ) : (
            <div className="rounded-2xl bg-gray-50 p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <Stethoscope className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="mb-2 font-semibold text-gray-900">No Medical Images</h3>
              <p className="mb-6 text-sm text-gray-500">
                Upload photos of medical concerns to share with your care team.
              </p>
              <button
                onClick={() => setViewMode('upload')}
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 font-medium text-white transition-all hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                <Plus className="h-5 w-5" />
                Upload First Photo
              </button>
            </div>
          )}

          {/* Info Card */}
          <div className="rounded-2xl bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
              <div>
                <p className="mb-2 font-medium text-blue-900">Secure & Private</p>
                <ul className="space-y-1 text-sm text-blue-700">
                  <li>• Photos are encrypted and stored securely</li>
                  <li>• Only you and your care team can view them</li>
                  <li>• Helps providers assess conditions remotely</li>
                  <li>• Delete at any time</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload View - Step 1: Select Type */}
      {viewMode === 'upload' && !selectedType && (
        <div className="space-y-4">
          <p className="mb-3 text-sm font-medium text-gray-700">What type of photo is this?</p>
          <div className="grid gap-3">
            {MEDICAL_PHOTO_TYPES.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.type}
                  onClick={() => setSelectedType(type.type)}
                  className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition-all hover:border-gray-200 hover:shadow-md"
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${primaryColor}15` }}
                  >
                    <Icon className="h-6 w-6" style={{ color: primaryColor }} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{type.label}</p>
                    <p className="text-sm text-gray-500">{type.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Upload View - Step 2: Select Body Part */}
      {viewMode === 'upload' && selectedType && !selectedBodyPart && (
        <div className="space-y-4">
          <button
            onClick={() => setSelectedType(null)}
            className="mb-2 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to type selection
          </button>

          <p className="mb-3 text-sm font-medium text-gray-700">Where on your body?</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {BODY_PARTS.map((part) => {
              const Icon = part.icon;
              return (
                <button
                  key={part.id}
                  onClick={() => setSelectedBodyPart(part.id)}
                  className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:border-gray-200 hover:shadow-md"
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${primaryColor}15` }}
                  >
                    <Icon className="h-5 w-5" style={{ color: primaryColor }} />
                  </div>
                  <span className="text-center text-sm font-medium text-gray-700">
                    {part.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Upload View - Step 3: Upload Photo */}
      {viewMode === 'upload' && selectedType && selectedBodyPart && (
        <div className="space-y-4">
          <button
            onClick={() => setSelectedBodyPart(null)}
            className="mb-2 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to body part selection
          </button>

          {/* Selection Summary */}
          <div className="mb-4 rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-500">Type:</span>
              <span className="font-medium text-gray-900">
                {MEDICAL_PHOTO_TYPES.find((t) => t.type === selectedType)?.label}
              </span>
              <span className="text-gray-300">|</span>
              <span className="text-gray-500">Area:</span>
              <span className="font-medium text-gray-900">
                {BODY_PARTS.find((p) => p.id === selectedBodyPart)?.label}
              </span>
            </div>
          </div>

          {/* Notes Input */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Add notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe any symptoms, when it started, or other relevant details..."
              rows={3}
              className="w-full resize-none rounded-lg border-2 border-gray-100 bg-gray-50 p-3 text-sm outline-none focus:border-gray-300 focus:bg-white"
            />
          </div>

          {/* Photo Uploader */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <PhotoUploader
              photoType={selectedType}
              category={selectedBodyPart}
              maxPhotos={5}
              onUploadComplete={handleUploadComplete}
              showGuidelines
              guidelines={PHOTO_GUIDELINES}
              showCameraButton
            />
          </div>
        </div>
      )}
    </div>
  );
}
