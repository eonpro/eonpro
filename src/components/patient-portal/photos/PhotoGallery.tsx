"use client";

/**
 * Photo Gallery Component
 *
 * Displays photos in a responsive grid with:
 * - Lightbox for full-screen viewing
 * - Date grouping
 * - Photo type filtering
 * - Swipe navigation on mobile
 * - Zoom and pan support
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Calendar,
  Download,
  Trash2,
  MoreVertical,
  Filter,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  Scale,
} from 'lucide-react';
import { PatientPhotoType, PatientPhotoVerificationStatus } from '@prisma/client';
import { format, isToday, isYesterday, isThisWeek, isThisMonth, parseISO } from 'date-fns';

// =============================================================================
// Types
// =============================================================================

interface Photo {
  id: number;
  createdAt: string;
  updatedAt: string;
  type: PatientPhotoType;
  category: string | null;
  s3Url: string | null;
  thumbnailUrl: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  title: string | null;
  notes: string | null;
  weight: number | null;
  takenAt: string;
  verificationStatus: PatientPhotoVerificationStatus;
  verifiedAt: string | null;
  isPrivate: boolean;
  isDeleted: boolean;
}

interface PhotoGroup {
  label: string;
  photos: Photo[];
}

interface PhotoGalleryProps {
  photos: Photo[];
  loading?: boolean;
  error?: string | null;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onDelete?: (photoId: number) => Promise<void>;
  onPhotoClick?: (photo: Photo) => void;
  showFilters?: boolean;
  showDateGroups?: boolean;
  showWeight?: boolean;
  emptyMessage?: string;
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

const PHOTO_TYPE_LABELS: Record<PatientPhotoType, string> = {
  PROGRESS_FRONT: 'Front',
  PROGRESS_SIDE: 'Side',
  PROGRESS_BACK: 'Back',
  ID_FRONT: 'ID Front',
  ID_BACK: 'ID Back',
  SELFIE: 'Selfie',
  MEDICAL_SKIN: 'Skin',
  MEDICAL_INJURY: 'Injury',
  MEDICAL_SYMPTOM: 'Symptom',
  MEDICAL_BEFORE: 'Before',
  MEDICAL_AFTER: 'After',
  MEDICAL_OTHER: 'Medical',
  PROFILE_AVATAR: 'Profile',
};

const VERIFICATION_STATUS_CONFIG: Record<
  PatientPhotoVerificationStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  NOT_APPLICABLE: { label: '', color: '', icon: CheckCircle },
  PENDING: { label: 'Pending', color: 'text-yellow-600 bg-yellow-100', icon: Clock },
  IN_REVIEW: { label: 'In Review', color: 'text-blue-600 bg-blue-100', icon: Clock },
  VERIFIED: { label: 'Verified', color: 'text-green-600 bg-green-100', icon: CheckCircle },
  REJECTED: { label: 'Rejected', color: 'text-red-600 bg-red-100', icon: AlertCircle },
  EXPIRED: { label: 'Expired', color: 'text-gray-600 bg-gray-100', icon: AlertCircle },
};

// =============================================================================
// Helpers
// =============================================================================

function groupPhotosByDate(photos: Photo[]): PhotoGroup[] {
  const groups: Map<string, Photo[]> = new Map();

  photos.forEach((photo) => {
    const date = parseISO(photo.takenAt);
    let label: string;

    if (isToday(date)) {
      label = 'Today';
    } else if (isYesterday(date)) {
      label = 'Yesterday';
    } else if (isThisWeek(date)) {
      label = 'This Week';
    } else if (isThisMonth(date)) {
      label = 'This Month';
    } else {
      label = format(date, 'MMMM yyyy');
    }

    const existing = groups.get(label) || [];
    groups.set(label, [...existing, photo]);
  });

  return Array.from(groups.entries()).map(([label, photos]) => ({
    label,
    photos: photos.sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime()),
  }));
}

function formatWeight(weight: number | null): string {
  if (!weight) return '';
  return `${weight.toFixed(1)} lbs`;
}

// =============================================================================
// Lightbox Component
// =============================================================================

interface LightboxProps {
  photos: Photo[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDelete?: (photoId: number) => Promise<void>;
}

function Lightbox({ photos, currentIndex, onClose, onNavigate, onDelete }: LightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDeleting, setIsDeleting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const photo = photos[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          if (hasPrev) onNavigate(currentIndex - 1);
          break;
        case 'ArrowRight':
          if (hasNext) onNavigate(currentIndex + 1);
          break;
        case '+':
        case '=':
          setZoom((z) => Math.min(z + 0.5, 4));
          break;
        case '-':
          setZoom((z) => Math.max(z - 0.5, 1));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, hasPrev, hasNext, onClose, onNavigate]);

  // Reset zoom when changing photos
  useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, [currentIndex]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    setZoom((z) => Math.min(Math.max(z + delta, 1), 4));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDelete = async () => {
    if (!onDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(photo.id);
      if (photos.length === 1) {
        onClose();
      } else if (currentIndex === photos.length - 1) {
        onNavigate(currentIndex - 1);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const statusConfig = VERIFICATION_STATUS_CONFIG[photo.verificationStatus];

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="h-6 w-6" />
          </button>
          <div>
            <p className="font-medium">{PHOTO_TYPE_LABELS[photo.type]}</p>
            <p className="text-sm text-gray-400">{format(parseISO(photo.takenAt), 'MMM d, yyyy')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">
            {currentIndex + 1} / {photos.length}
          </span>

          {/* Zoom Controls */}
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.5, 1))}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            disabled={zoom <= 1}
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <span className="text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.5, 4))}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            disabled={zoom >= 4}
          >
            <ZoomIn className="h-5 w-5" />
          </button>

          {/* Download */}
          {photo.s3Url && (
            <a
              href={photo.s3Url}
              download
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <Download className="h-5 w-5" />
            </a>
          )}

          {/* Delete */}
          {onDelete && (
            <button
              onClick={handleDelete}
              className="p-2 hover:bg-red-500/20 text-red-400 rounded-full transition-colors"
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {/* Image Container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {photo.s3Url ? (
          <img
            src={photo.s3Url}
            alt={photo.title || 'Photo'}
            className="max-w-full max-h-full object-contain select-none"
            style={{
              transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
              transition: isDragging ? 'none' : 'transform 0.2s ease-out',
            }}
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center text-gray-400">
            <AlertCircle className="h-12 w-12 mb-2" />
            <p>Image unavailable</p>
          </div>
        )}

        {/* Navigation Arrows */}
        {hasPrev && (
          <button
            onClick={() => onNavigate(currentIndex - 1)}
            className="absolute left-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <ChevronLeft className="h-8 w-8 text-white" />
          </button>
        )}
        {hasNext && (
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            className="absolute right-4 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <ChevronRight className="h-8 w-8 text-white" />
          </button>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-black/50 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {photo.weight && (
              <div className="flex items-center gap-1 text-sm">
                <Scale className="h-4 w-4 text-gray-400" />
                <span>{formatWeight(photo.weight)}</span>
              </div>
            )}
            {photo.verificationStatus !== 'NOT_APPLICABLE' && (
              <span className={`text-xs px-2 py-1 rounded-full ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
            )}
          </div>
          {photo.notes && <p className="text-sm text-gray-400 max-w-md truncate">{photo.notes}</p>}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Photo Card Component
// =============================================================================

interface PhotoCardProps {
  photo: Photo;
  onClick: () => void;
  showWeight?: boolean;
}

function PhotoCard({ photo, onClick, showWeight }: PhotoCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const statusConfig = VERIFICATION_STATUS_CONFIG[photo.verificationStatus];
  const imageUrl = photo.thumbnailUrl || photo.s3Url;

  return (
    <div
      onClick={onClick}
      className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
    >
      {/* Loading State */}
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      )}

      {/* Image */}
      {imageUrl && !error ? (
        <img
          src={imageUrl}
          alt={photo.title || 'Photo'}
          className={`w-full h-full object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-gray-300" />
        </div>
      )}

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />

      {/* Type Badge */}
      <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded-full text-xs text-white">
        {PHOTO_TYPE_LABELS[photo.type]}
      </div>

      {/* Verification Status Badge */}
      {photo.verificationStatus !== 'NOT_APPLICABLE' && (
        <div className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs ${statusConfig.color}`}>
          {statusConfig.label}
        </div>
      )}

      {/* Weight Badge (for progress photos) */}
      {showWeight && photo.weight && (
        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded-full text-xs text-white flex items-center gap-1">
          <Scale className="h-3 w-3" />
          {formatWeight(photo.weight)}
        </div>
      )}

      {/* Date Badge */}
      <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 rounded-full text-xs text-white">
        {format(parseISO(photo.takenAt), 'MMM d')}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function PhotoGallery({
  photos,
  loading = false,
  error = null,
  onLoadMore,
  hasMore = false,
  onDelete,
  onPhotoClick,
  showFilters = false,
  showDateGroups = true,
  showWeight = false,
  emptyMessage = 'No photos yet',
  className = '',
}: PhotoGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<PatientPhotoType | 'all'>('all');

  // Filter photos
  const filteredPhotos = typeFilter === 'all' ? photos : photos.filter((p) => p.type === typeFilter);

  // Group photos by date
  const photoGroups = showDateGroups ? groupPhotosByDate(filteredPhotos) : [{ label: '', photos: filteredPhotos }];

  // Get unique photo types for filter
  const availableTypes = Array.from(new Set(photos.map((p) => p.type)));

  const handlePhotoClick = (photo: Photo, index: number) => {
    if (onPhotoClick) {
      onPhotoClick(photo);
    } else {
      // Find the index in filtered photos
      const filteredIndex = filteredPhotos.findIndex((p) => p.id === photo.id);
      setLightboxIndex(filteredIndex);
    }
  };

  const handleDeleteFromLightbox = async (photoId: number) => {
    if (onDelete) {
      await onDelete(photoId);
    }
  };

  // Error state
  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
        <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
        <p className="text-red-600 font-medium">Failed to load photos</p>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  // Empty state
  if (!loading && photos.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
        <ImageIcon className="h-12 w-12 text-gray-300 mb-4" />
        <p className="text-gray-500 font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Filters */}
      {showFilters && availableTypes.length > 1 && (
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
          <Filter className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              typeFilter === 'all'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All ({photos.length})
          </button>
          {availableTypes.map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                typeFilter === type
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {PHOTO_TYPE_LABELS[type]} ({photos.filter((p) => p.type === type).length})
            </button>
          ))}
        </div>
      )}

      {/* Photo Groups */}
      <div className="space-y-6">
        {photoGroups.map((group, groupIndex) => (
          <div key={group.label || groupIndex}>
            {/* Group Label */}
            {showDateGroups && group.label && (
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-medium text-gray-600">{group.label}</h3>
              </div>
            )}

            {/* Photo Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {group.photos.map((photo, photoIndex) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  onClick={() => handlePhotoClick(photo, photoIndex)}
                  showWeight={showWeight}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      )}

      {/* Load More */}
      {hasMore && onLoadMore && !loading && (
        <div className="flex justify-center mt-6">
          <button
            onClick={onLoadMore}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition-colors"
          >
            Load More
          </button>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={filteredPhotos}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onDelete={onDelete ? handleDeleteFromLightbox : undefined}
        />
      )}
    </div>
  );
}

export default PhotoGallery;
