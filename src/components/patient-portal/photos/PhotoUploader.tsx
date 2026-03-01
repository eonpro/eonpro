'use client';

/**
 * Photo Uploader Component
 *
 * Handles secure photo uploads for patient portal with:
 * - Drag and drop support
 * - Camera capture (mobile & desktop)
 * - Image preview and editing
 * - Compression before upload
 * - Progress tracking
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Image as ImageIcon,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { PatientPhotoType } from '@/types/prisma-enums';
import { getAuthHeaders } from '@/lib/utils/auth-token';
import { apiFetch } from '@/lib/api/fetch';

// =============================================================================
// Types
// =============================================================================

interface UploadingPhoto {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'uploading' | 'compressing' | 'success' | 'error';
  progress: number;
  error?: string;
  s3Key?: string;
  s3Url?: string;
  thumbnailKey?: string;
}

interface PhotoUploaderProps {
  photoType: PatientPhotoType;
  category?: string;
  maxPhotos?: number;
  maxSizeMB?: number;
  onUploadComplete?: (photo: {
    s3Key: string;
    s3Url: string;
    thumbnailKey?: string;
    fileSize: number;
    mimeType: string;
    width: number;
    height: number;
  }) => void;
  onUploadError?: (error: string) => void;
  showCameraButton?: boolean;
  showGuidelines?: boolean;
  guidelines?: string[];
  acceptedTypes?: string[];
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_SIZE_MB = 15;
const DEFAULT_MAX_PHOTOS = 5;
const DEFAULT_ACCEPTED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
const COMPRESSION_QUALITY = 0.85;
const MAX_DIMENSION = 2048; // Max width/height after compression

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
}

async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;

      // Calculate new dimensions
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = (height / width) * MAX_DIMENSION;
          width = MAX_DIMENSION;
        } else {
          width = (width / height) * MAX_DIMENSION;
          height = MAX_DIMENSION;
        }
      }

      // Create canvas and draw
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ blob, width: Math.round(width), height: Math.round(height) });
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        'image/jpeg',
        COMPRESSION_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    img.src = objectUrl;
  });
}

async function createThumbnail(file: File, maxSize: number = 200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;

      // Calculate thumbnail dimensions
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
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create thumbnail'));
          }
        },
        'image/jpeg',
        0.7
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    img.src = objectUrl;
  });
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
}

// =============================================================================
// Component
// =============================================================================

export function PhotoUploader({
  photoType,
  category,
  maxPhotos = DEFAULT_MAX_PHOTOS,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  onUploadComplete,
  onUploadError,
  showCameraButton = true,
  showGuidelines = false,
  guidelines = [],
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
  className = '',
}: PhotoUploaderProps) {
  const [photos, setPhotos] = useState<UploadingPhoto[]>([]);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  // Cleanup camera stream and fullscreen class on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      document.documentElement.classList.remove('camera-fullscreen');
    };
  }, [cameraStream]);

  // Connect camera stream to video element after React renders the modal
  useEffect(() => {
    if (isCameraOpen && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraOpen, cameraStream]);

  // Cleanup preview object URLs on unmount
  useEffect(() => {
    return () => {
      photos.forEach((p) => {
        if (p.preview) URL.revokeObjectURL(p.preview);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- cleanup on unmount only

  // Upload photo to S3
  const uploadPhoto = useCallback(
    async (photo: UploadingPhoto) => {
      try {
        // Update status to compressing
        setPhotos((prev) =>
          prev.map((p) => (p.id === photo.id ? { ...p, status: 'compressing' as const } : p))
        );

        // Compress image
        const { blob, width, height } = await compressImage(photo.file);

        // Update status to uploading
        setPhotos((prev) =>
          prev.map((p) => (p.id === photo.id ? { ...p, status: 'uploading' as const } : p))
        );

        // Get presigned URL (auth required so photo is tied to patient)
        const presignedResponse = await apiFetch('/api/patient-portal/photos/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            type: photoType,
            contentType: 'image/jpeg',
            fileSize: blob.size,
            category,
            includeThumbnail: true,
          }),
        });

        if (!presignedResponse.ok) {
          const error = await presignedResponse.json();
          throw new Error(error.error || 'Failed to get upload URL');
        }

        const { uploadUrl, s3Key, thumbnailUploadUrl, thumbnailKey } =
          await presignedResponse.json();

        // Upload to S3
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: blob,
          headers: { 'Content-Type': 'image/jpeg' },
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload to S3');
        }

        // Create and upload thumbnail
        let finalThumbnailKey: string | undefined;
        if (thumbnailUploadUrl && thumbnailKey) {
          try {
            const thumbnail = await createThumbnail(photo.file);
            await fetch(thumbnailUploadUrl, {
              method: 'PUT',
              body: thumbnail,
              headers: { 'Content-Type': 'image/jpeg' },
            });
            finalThumbnailKey = thumbnailKey;
          } catch (thumbError) {
            console.warn('Failed to upload thumbnail:', thumbError);
            // Continue without thumbnail
          }
        }

        // Create photo record in database (auth required for patientId resolution)
        const createResponse = await apiFetch('/api/patient-portal/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            type: photoType,
            category,
            s3Key,
            thumbnailKey: finalThumbnailKey,
            fileSize: blob.size,
            mimeType: 'image/jpeg',
            width,
            height,
            uploadedFrom: 'web',
          }),
        });

        if (!createResponse.ok) {
          const error = await createResponse.json();
          throw new Error(error.error || 'Failed to save photo');
        }

        const { photo: savedPhoto } = await createResponse.json();

        // Update status to success
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photo.id
              ? {
                  ...p,
                  status: 'success' as const,
                  progress: 100,
                  s3Key,
                  s3Url: savedPhoto.s3Url,
                  thumbnailKey: finalThumbnailKey,
                }
              : p
          )
        );

        onUploadComplete?.({
          s3Key,
          s3Url: savedPhoto.s3Url,
          thumbnailKey: finalThumbnailKey,
          fileSize: blob.size,
          mimeType: 'image/jpeg',
          width,
          height,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photo.id ? { ...p, status: 'error' as const, error: errorMessage } : p
          )
        );
        onUploadError?.(errorMessage);
      }
    },
    [photoType, category, onUploadComplete, onUploadError]
  );

  // Handle file selection
  const processFiles = useCallback(
    async (files: File[]) => {
      const remainingSlots = maxPhotos - photos.length;
      const filesToProcess = files.slice(0, remainingSlots);

      const newPhotos: UploadingPhoto[] = filesToProcess
        .filter((file) => {
          // Validate file type
          if (!acceptedTypes.includes(file.type)) {
            onUploadError?.(`Invalid file type: ${file.type}`);
            return false;
          }
          // Validate file size
          if (file.size > maxSizeBytes) {
            onUploadError?.(`File too large: ${formatFileSize(file.size)} (max ${maxSizeMB}MB)`);
            return false;
          }
          return true;
        })
        .map((file) => ({
          id: generateId(),
          file,
          preview: URL.createObjectURL(file),
          status: 'pending' as const,
          progress: 0,
        }));

      if (newPhotos.length === 0) return;

      setPhotos((prev) => [...prev, ...newPhotos]);

      // Start uploading each photo
      for (const photo of newPhotos) {
        await uploadPhoto(photo);
      }
    },
    [photos.length, maxPhotos, acceptedTypes, maxSizeBytes, maxSizeMB, onUploadError, uploadPhoto]
  );

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: processFiles,
    accept: acceptedTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxFiles: maxPhotos - photos.length,
    disabled: photos.length >= maxPhotos,
  });

  // Camera functions
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      setCameraStream(stream);
      setIsCameraOpen(true);
      document.documentElement.classList.add('camera-fullscreen');
    } catch (error) {
      onUploadError?.('Unable to access camera. Please check permissions.');
    }
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }
    setCameraStream(null);
    setIsCameraOpen(false);
    document.documentElement.classList.remove('camera-fullscreen');
  };

  const switchCamera = async () => {
    closeCamera();
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
    setTimeout(openCamera, 100);
  };

  const capturePhoto = () => {
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
          const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
          processFiles([file]);
        }
      },
      'image/jpeg',
      0.9
    );

    closeCamera();
  };

  // Remove photo
  const removePhoto = (photoId: string) => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === photoId);
      if (photo?.preview) {
        URL.revokeObjectURL(photo.preview);
      }
      return prev.filter((p) => p.id !== photoId);
    });
  };

  // Retry failed upload
  const retryUpload = (photoId: string) => {
    const photo = photos.find((p) => p.id === photoId);
    if (photo && photo.status === 'error') {
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photoId ? { ...p, status: 'pending' as const, error: undefined } : p
        )
      );
      uploadPhoto(photo);
    }
  };

  const canUploadMore = photos.length < maxPhotos;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Guidelines */}
      {showGuidelines && guidelines.length > 0 && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <h4 className="mb-2 text-sm font-medium text-blue-800">Photo Guidelines</h4>
          <ul className="space-y-1 text-sm text-blue-700">
            {guidelines.map((guideline, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-blue-500">•</span>
                {guideline}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Upload Zone */}
      {canUploadMore && (
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Drag & Drop Zone */}
          <div
            {...getRootProps()}
            className={`relative flex-1 cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'} `}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto mb-3 h-10 w-10 text-gray-400" />
            {isDragActive ? (
              <p className="font-medium text-blue-600">Drop photo here...</p>
            ) : (
              <>
                <p className="font-medium text-gray-600">Drag & drop or tap to browse</p>
                <p className="mt-1 text-sm text-gray-500">
                  {maxPhotos - photos.length} photo{maxPhotos - photos.length !== 1 ? 's' : ''}{' '}
                  remaining • Max {maxSizeMB}MB
                </p>
              </>
            )}
          </div>

          {/* Camera Button */}
          {showCameraButton && (
            <button
              onClick={openCamera}
              className="flex w-full flex-shrink-0 flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-gray-100 py-4 transition-all hover:bg-gray-200 sm:w-32"
            >
              <Camera className="h-8 w-8 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Camera</span>
            </button>
          )}
        </div>
      )}

      {/* Photo Preview Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square overflow-hidden rounded-xl border border-gray-200 bg-gray-100"
            >
              <img
                src={photo.preview}
                alt="Preview"
                className={`h-full w-full object-cover ${
                  photo.status === 'uploading' || photo.status === 'compressing' ? 'opacity-50' : ''
                }`}
              />

              {/* Status Overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                {(photo.status === 'uploading' || photo.status === 'compressing') && (
                  <div className="rounded-full bg-black/50 p-3">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
                {photo.status === 'success' && (
                  <div className="absolute right-2 top-2 rounded-full bg-green-500 p-1">
                    <CheckCircle className="h-4 w-4 text-white" />
                  </div>
                )}
                {photo.status === 'error' && (
                  <div className="rounded-full bg-red-500/90 p-3">
                    <AlertCircle className="h-6 w-6 text-white" />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="absolute bottom-2 right-2 flex gap-1">
                {photo.status === 'error' && (
                  <button
                    onClick={() => retryUpload(photo.id)}
                    className="rounded-full bg-white/90 p-2 shadow-md transition-all hover:bg-white"
                    title="Retry upload"
                  >
                    <RefreshCw className="h-4 w-4 text-gray-700" />
                  </button>
                )}
                <button
                  onClick={() => removePhoto(photo.id)}
                  className="rounded-full bg-white/90 p-2 shadow-md transition-all hover:bg-white"
                  title="Remove photo"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </button>
              </div>

              {/* Error Message */}
              {photo.status === 'error' && photo.error && (
                <div className="absolute inset-x-0 bottom-0 bg-red-500/90 p-2 text-center text-xs text-white">
                  {photo.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Camera Modal — portal to document.body to escape layout stacking context */}
      {isCameraOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-black" style={{ touchAction: 'none' }}>
          {/* Camera Header */}
          <div
            className="flex shrink-0 items-center justify-between bg-black px-4 py-3"
            style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))' }}
          >
            <button onClick={closeCamera} className="flex h-12 w-12 items-center justify-center rounded-full text-white active:bg-white/20">
              <X className="h-7 w-7" />
            </button>
            <span className="text-lg font-semibold text-white">Take Photo</span>
            <button
              onClick={switchCamera}
              className="flex h-12 w-12 items-center justify-center rounded-full text-white active:bg-white/20"
            >
              <RotateCcw className="h-6 w-6" />
            </button>
          </div>

          {/* Video Feed */}
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full max-h-full w-full max-w-full object-contain"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                v.play().catch(() => {});
              }}
            />
          </div>

          {/* Capture Button */}
          <div
            className="flex shrink-0 justify-center bg-black px-6 py-6"
            style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom, 0px))' }}
          >
            <button
              onClick={capturePhoto}
              className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-gray-300 bg-white transition-transform active:scale-95"
            >
              <div className="h-16 w-16 rounded-full border-2 border-gray-400 bg-white" />
            </button>
          </div>

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>,
        document.body,
      )}

      {/* Upload Limit Reached */}
      {!canUploadMore && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 py-4 text-center">
          <ImageIcon className="mx-auto mb-2 h-8 w-8 text-gray-400" />
          <p className="font-medium text-gray-600">Maximum photos reached</p>
          <p className="text-sm text-gray-500">Remove a photo to upload another</p>
        </div>
      )}
    </div>
  );
}

export default PhotoUploader;
