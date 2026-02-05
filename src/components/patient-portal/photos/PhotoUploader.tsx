"use client";

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
import { PatientPhotoType } from '@prisma/client';

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
const DEFAULT_ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
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
    img.onload = () => {
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
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

async function createThumbnail(file: File, maxSize: number = 200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
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
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
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

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

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

        // Get presigned URL
        const presignedResponse = await fetch('/api/patient-portal/photos/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

        const { uploadUrl, s3Key, thumbnailUploadUrl, thumbnailKey } = await presignedResponse.json();

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

        // Create photo record in database
        const createResponse = await fetch('/api/patient-portal/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
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
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-800 mb-2">Photo Guidelines</h4>
          <ul className="text-sm text-blue-700 space-y-1">
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
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Drag & Drop Zone */}
          <div
            {...getRootProps()}
            className={`
              flex-1 relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
              ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}
            `}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-10 w-10 text-gray-400 mb-3" />
            {isDragActive ? (
              <p className="text-blue-600 font-medium">Drop photo here...</p>
            ) : (
              <>
                <p className="text-gray-600 font-medium">Drag & drop or tap to browse</p>
                <p className="text-sm text-gray-500 mt-1">
                  {maxPhotos - photos.length} photo{maxPhotos - photos.length !== 1 ? 's' : ''} remaining • Max{' '}
                  {maxSizeMB}MB
                </p>
              </>
            )}
          </div>

          {/* Camera Button */}
          {showCameraButton && (
            <button
              onClick={openCamera}
              className="flex-shrink-0 flex flex-col items-center justify-center gap-2 w-full sm:w-32 py-4 bg-gray-100 hover:bg-gray-200 rounded-xl border-2 border-gray-200 transition-all"
            >
              <Camera className="h-8 w-8 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Camera</span>
            </button>
          )}
        </div>
      )}

      {/* Photo Preview Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200"
            >
              <img
                src={photo.preview}
                alt="Preview"
                className={`w-full h-full object-cover ${
                  photo.status === 'uploading' || photo.status === 'compressing'
                    ? 'opacity-50'
                    : ''
                }`}
              />

              {/* Status Overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                {(photo.status === 'uploading' || photo.status === 'compressing') && (
                  <div className="bg-black/50 rounded-full p-3">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
                {photo.status === 'success' && (
                  <div className="absolute top-2 right-2 bg-green-500 rounded-full p-1">
                    <CheckCircle className="h-4 w-4 text-white" />
                  </div>
                )}
                {photo.status === 'error' && (
                  <div className="bg-red-500/90 rounded-full p-3">
                    <AlertCircle className="h-6 w-6 text-white" />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="absolute bottom-2 right-2 flex gap-1">
                {photo.status === 'error' && (
                  <button
                    onClick={() => retryUpload(photo.id)}
                    className="p-2 bg-white/90 rounded-full shadow-md hover:bg-white transition-all"
                    title="Retry upload"
                  >
                    <RefreshCw className="h-4 w-4 text-gray-700" />
                  </button>
                )}
                <button
                  onClick={() => removePhoto(photo.id)}
                  className="p-2 bg-white/90 rounded-full shadow-md hover:bg-white transition-all"
                  title="Remove photo"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </button>
              </div>

              {/* Error Message */}
              {photo.status === 'error' && photo.error && (
                <div className="absolute bottom-0 inset-x-0 bg-red-500/90 text-white text-xs p-2 text-center">
                  {photo.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Camera Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Camera Header */}
          <div className="flex items-center justify-between p-4 bg-black/80">
            <button onClick={closeCamera} className="p-2 text-white hover:bg-white/20 rounded-full">
              <X className="h-6 w-6" />
            </button>
            <span className="text-white font-medium">Take Photo</span>
            <button onClick={switchCamera} className="p-2 text-white hover:bg-white/20 rounded-full">
              <RotateCcw className="h-6 w-6" />
            </button>
          </div>

          {/* Video Feed */}
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* Capture Button */}
          <div className="p-6 bg-black/80 flex justify-center">
            <button
              onClick={capturePhoto}
              className="w-20 h-20 rounded-full bg-white border-4 border-gray-300 hover:scale-105 transition-transform flex items-center justify-center"
            >
              <div className="w-16 h-16 rounded-full bg-white border-2 border-gray-400" />
            </button>
          </div>

          {/* Hidden canvas for capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* Upload Limit Reached */}
      {!canUploadMore && (
        <div className="text-center py-4 bg-gray-50 rounded-lg border border-gray-200">
          <ImageIcon className="mx-auto h-8 w-8 text-gray-400 mb-2" />
          <p className="text-gray-600 font-medium">Maximum photos reached</p>
          <p className="text-sm text-gray-500">Remove a photo to upload another</p>
        </div>
      )}
    </div>
  );
}

export default PhotoUploader;
