'use client';

/**
 * Branding Image Uploader Component
 *
 * Specialized uploader for clinic branding assets (logo, icon, favicon)
 * Supports S3 upload with progress tracking and preview
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Trash2,
  Loader2,
  AlertCircle,
  Check,
  Image as ImageIcon,
  Link as LinkIcon,
} from 'lucide-react';

interface BrandingImageUploaderProps {
  label: string;
  description?: string;
  imageUrl: string | null;
  onImageChange: (url: string | null) => void;
  accept?: string;
  maxSizeMB?: number;
  recommendedSize?: string;
  clinicId?: number;
  imageType: 'logo' | 'icon' | 'favicon';
  disabled?: boolean;
}

export function BrandingImageUploader({
  label,
  description,
  imageUrl,
  onImageChange,
  accept = 'image/png,image/jpeg,image/svg+xml,image/webp,.ico',
  maxSizeMB = 2,
  recommendedSize,
  clinicId,
  imageType,
  disabled = false,
}: BrandingImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (file: File) => {
      setError(null);

      // Validate file size
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`File size must be less than ${maxSizeMB}MB`);
        return;
      }

      // Validate file type
      const validTypes = accept.split(',').map((t) => t.trim());
      const isValidType = validTypes.some((type) => {
        if (type.startsWith('.')) {
          return file.name.toLowerCase().endsWith(type);
        }
        return file.type === type || file.type.startsWith(type.replace('/*', '/'));
      });

      if (!isValidType) {
        setError('Invalid file type. Please upload an image.');
        return;
      }

      setUploading(true);
      setUploadProgress(0);

      try {
        // Get auth token
        const token = localStorage.getItem('auth-token');
        if (!token) {
          throw new Error('Not authenticated');
        }

        // Create form data
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileName', `${imageType}-${Date.now()}-${file.name}`);
        formData.append('category', 'branding');
        formData.append('contentType', file.type);
        formData.append('accessLevel', 'public'); // Branding assets need to be publicly accessible
        if (clinicId) {
          formData.append('clinicId', clinicId.toString());
        }

        // Simulate progress (real progress would need XMLHttpRequest)
        const progressInterval = setInterval(() => {
          setUploadProgress((prev) => Math.min(prev + 10, 90));
        }, 100);

        // Upload to S3
        const response = await fetch('/api/v2/aws/s3/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        clearInterval(progressInterval);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Upload failed');
        }

        const data = await response.json();
        setUploadProgress(100);

        // Use the URL from S3 or fall back to creating a data URL for preview
        const uploadedUrl = data.url || data.signedUrl;

        // If S3 returned a URL, use it; otherwise create a data URL for local preview
        if (uploadedUrl) {
          onImageChange(uploadedUrl);
        } else {
          // Fallback to data URL if no S3 URL returned (mock mode)
          const reader = new FileReader();
          reader.onload = (e) => {
            onImageChange(e.target?.result as string);
          };
          reader.readAsDataURL(file);
        }
      } catch (err: any) {
        console.error('Upload error:', err);

        // Fallback to data URL if S3 is not available
        const reader = new FileReader();
        reader.onload = (e) => {
          onImageChange(e.target?.result as string);
          setError(null); // Clear error since we have a fallback
        };
        reader.readAsDataURL(file);
      } finally {
        setUploading(false);
        setTimeout(() => setUploadProgress(0), 1000);
      }
    },
    [accept, maxSizeMB, clinicId, imageType, onImageChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled || uploading) return;

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [disabled, uploading, handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onImageChange(urlInput.trim());
      setUrlInput('');
      setShowUrlInput(false);
    }
  };

  const handleRemove = () => {
    onImageChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const fileInputId = `branding-upload-${imageType}${clinicId != null ? `-${clinicId}` : ''}`;
  const urlInputId = `branding-url-${imageType}${clinicId != null ? `-${clinicId}` : ''}`;

  return (
    <div className="space-y-2">
      {/* File input always in DOM so label htmlFor is valid and ref works */}
      <input
        ref={fileInputRef}
        id={fileInputId}
        name={`brandingFile-${imageType}`}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
        disabled={disabled || uploading}
        aria-label={`Upload ${label}`}
      />
      <div className="flex items-center justify-between">
        <label htmlFor={fileInputId} className="block text-sm font-medium text-gray-700">
          {label}
        </label>
        {!imageUrl && !showUrlInput && (
          <button
            type="button"
            onClick={() => setShowUrlInput(true)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            disabled={disabled}
          >
            <LinkIcon className="h-3 w-3" />
            Use URL
          </button>
        )}
      </div>

      {description && <p className="text-xs text-gray-500">{description}</p>}

      {showUrlInput ? (
        <div className="space-y-2">
          <label htmlFor={urlInputId} className="sr-only">
            {label} image URL
          </label>
          <div className="flex gap-2">
            <input
              id={urlInputId}
              name={`brandingUrl-${imageType}`}
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/image.png"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500"
              disabled={disabled}
              aria-label={`${label} image URL`}
            />
            <button
              type="button"
              onClick={handleUrlSubmit}
              disabled={!urlInput.trim() || disabled}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowUrlInput(false)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel - Upload file instead
          </button>
        </div>
      ) : (
        <div
          onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className={`relative rounded-xl border-2 border-dashed p-4 text-center transition-all ${disabled ? 'cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:border-emerald-400'} ${uploading ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300'} ${error ? 'border-red-300 bg-red-50' : ''} `}
        >
          {imageUrl ? (
            <div className="group relative">
              <img
                src={imageUrl}
                alt={label}
                className={`mx-auto max-h-20 object-contain ${imageType === 'favicon' ? 'h-8 w-8' : imageType === 'icon' ? 'h-16 w-16' : ''}`}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
                disabled={disabled}
                className="absolute -right-2 -top-2 rounded-full bg-red-100 p-1.5 text-red-600 opacity-0 transition-colors hover:bg-red-200 group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ) : uploading ? (
            <div className="space-y-2">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-500" />
              <p className="text-sm text-emerald-600">Uploading... {uploadProgress}%</p>
              <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full bg-emerald-500 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                {imageType === 'logo' ? (
                  <ImageIcon className="h-5 w-5 text-gray-400" />
                ) : imageType === 'icon' ? (
                  <div className="h-5 w-5 rounded border-2 border-gray-400" />
                ) : (
                  <div className="h-4 w-4 rounded-sm border border-gray-400" />
                )}
              </div>
              <div>
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-emerald-600">Click to upload</span> or drag and
                  drop
                </p>
                {recommendedSize && <p className="mt-1 text-xs text-gray-400">{recommendedSize}</p>}
                <p className="text-xs text-gray-400">Max {maxSizeMB}MB</p>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}
    </div>
  );
}
