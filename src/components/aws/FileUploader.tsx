'use client';

/**
 * File Upload Component
 *
 * Handles secure file uploads to AWS S3 with progress tracking
 */

import React, { useState, useCallback } from 'react';
import { logger } from '@/lib/logger';
import {
  Upload,
  X,
  File,
  FileText,
  Image,
  AlertCircle,
  CheckCircle,
  Loader2,
  Download,
  Trash2,
  Eye,
  Lock,
  Globe,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import {
  FileCategory,
  FileAccessLevel,
  STORAGE_CONFIG,
  S3_ERRORS,
} from '@/lib/integrations/aws/s3Config';
import { Feature } from '@/components/Feature';
import { apiFetch } from '@/lib/api/fetch';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  category: FileCategory;
  accessLevel: FileAccessLevel;
  status: 'uploading' | 'success' | 'error';
  progress: number;
  url?: string;
  error?: string;
  key?: string;
}

interface FileUploaderProps {
  patientId?: number;
  providerId?: number;
  category?: FileCategory;
  onUploadComplete?: (file: UploadedFile) => void;
  maxFiles?: number;
  showList?: boolean;
}

export function FileUploader({
  patientId,
  providerId,
  category = FileCategory.OTHER,
  onUploadComplete,
  maxFiles = 10,
  showList = true,
}: FileUploaderProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(category);
  const [selectedAccessLevel, setSelectedAccessLevel] = useState(FileAccessLevel.PRIVATE);

  // Handle file drop
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const newFiles: UploadedFile[] = acceptedFiles
        .slice(0, maxFiles - files.length)
        .map((file: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          size: file.size,
          type: file.type,
          category: selectedCategory,
          accessLevel: selectedAccessLevel,
          status: 'uploading' as const,
          progress: 0,
        }));

      setFiles((prev) => [...prev, ...newFiles]);
      setUploading(true);

      // Upload each file
      for (const [index, file] of acceptedFiles.entries()) {
        if (index >= maxFiles - files.length) break;

        const fileId = newFiles[index].id;

        try {
          // Validate file
          if (!validateFile(file)) {
            throw new Error('Invalid file type or size');
          }

          // Read file as buffer
          const buffer = await file.arrayBuffer();
          const formData = new FormData();
          formData.append('file', new Blob([buffer]));
          formData.append('fileName', file.name);
          formData.append('category', selectedCategory);
          formData.append('contentType', file.type);
          formData.append('accessLevel', selectedAccessLevel);
          if (patientId) formData.append('patientId', patientId.toString());
          if (providerId) formData.append('providerId', providerId.toString());

          // Upload to S3
          const response = await apiFetch('/api/v2/aws/s3/upload', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Upload failed');
          }

          const data = await response.json();

          // Update file status
          setFiles((prev) =>
            prev.map((f: any) =>
              f.id === fileId
                ? {
                    ...f,
                    status: 'success' as const,
                    progress: 100,
                    url: data.url,
                    key: data.key,
                  }
                : f
            )
          );

          if (onUploadComplete) {
            onUploadComplete({
              ...newFiles[index],
              status: 'success',
              url: data.url,
              key: data.key,
            });
          }
        } catch (error: any) {
          // @ts-ignore

          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error('Upload error:', error);

          setFiles((prev) =>
            prev.map((f: any) =>
              f.id === fileId
                ? {
                    ...f,
                    status: 'error' as const,
                    error: errorMessage || 'Upload failed',
                  }
                : f
            )
          );
        }
      }

      setUploading(false);
    },
    [
      files.length,
      maxFiles,
      selectedCategory,
      selectedAccessLevel,
      patientId,
      providerId,
      onUploadComplete,
    ]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: maxFiles - files.length,
    accept: {
      'image/*': STORAGE_CONFIG.ALLOWED_IMAGE_TYPES,
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
  });

  // Validate file
  const validateFile = (file: File): boolean => {
    // Check file type
    const allowedTypes = [
      ...STORAGE_CONFIG.ALLOWED_IMAGE_TYPES,
      ...STORAGE_CONFIG.ALLOWED_DOCUMENT_TYPES,
    ];

    if (!allowedTypes.includes(file.type)) {
      return false;
    }

    // Check file size
    if (STORAGE_CONFIG.ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return file.size <= STORAGE_CONFIG.MAX_IMAGE_SIZE;
    }

    return file.size <= STORAGE_CONFIG.MAX_FILE_SIZE;
  };

  // Remove file
  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f: any) => f.id !== fileId));
  };

  // Delete file from S3
  const deleteFile = async (file: UploadedFile) => {
    if (!file.key) return;

    try {
      const response = await apiFetch('/api/v2/aws/s3/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: file.key }),
      });

      if (response.ok) {
        removeFile(file.id);
      }
    } catch (error: any) {
      // @ts-ignore

      logger.error('Delete error:', error);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Get file icon
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="h-5 w-5" />;
    if (type === 'application/pdf') return <FileText className="h-5 w-5" />;
    return <File className="h-5 w-5" />;
  };

  // Get access level icon
  const getAccessIcon = (level: FileAccessLevel) => {
    switch (level) {
      case FileAccessLevel.PUBLIC:
        return <Globe className="h-4 w-4 text-green-500" />;
      case FileAccessLevel.PRIVATE:
        return <Lock className="h-4 w-4 text-red-500" />;
      default:
        return <Lock className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <Feature feature="AWS_S3_STORAGE">
      <div className="space-y-6">
        {/* Category and Access Level Selection */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
            <select
              value={selectedCategory}
              onChange={(e: any) => setSelectedCategory(e.target.value as FileCategory)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.values(FileCategory).map((cat: any) => (
                <option key={cat} value={cat}>
                  {cat.replace(/-/g, ' ').toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">Access Level</label>
            <select
              value={selectedAccessLevel}
              onChange={(e: any) => setSelectedAccessLevel(e.target.value as FileAccessLevel)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.values(FileAccessLevel).map((level: any) => (
                <option key={level} value={level}>
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Drop Zone */}
        <div
          {...getRootProps()}
          className={`relative cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'} ${uploading ? 'cursor-not-allowed opacity-50' : ''} `}
        >
          <input {...getInputProps()} disabled={uploading || files.length >= maxFiles} />

          <Upload className="mx-auto mb-4 h-12 w-12 text-gray-400" />

          {isDragActive ? (
            <p className="text-lg text-blue-600">Drop files here...</p>
          ) : (
            <>
              <p className="text-lg text-gray-600">Drag & drop files here, or click to browse</p>
              <p className="mt-2 text-sm text-gray-500">
                Max {maxFiles} files • Images up to {STORAGE_CONFIG.MAX_IMAGE_SIZE / 1024 / 1024}MB
                • Documents up to {STORAGE_CONFIG.MAX_DOCUMENT_SIZE / 1024 / 1024}MB
              </p>
            </>
          )}
        </div>

        {/* File List */}
        {showList && files.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-medium text-gray-900">Uploaded Files</h3>

            {files.map((file: any) => (
              <div
                key={file.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="flex flex-1 items-center space-x-3">
                  {getFileIcon(file.type)}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{file.name}</p>
                    <div className="mt-1 flex items-center space-x-2">
                      <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-500">{file.category}</span>
                      {getAccessIcon(file.accessLevel)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {file.status === 'uploading' && (
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <span className="text-sm text-gray-500">{file.progress}%</span>
                    </div>
                  )}

                  {file.status === 'success' && (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      {file.url && (
                        <>
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-gray-400 hover:text-blue-500"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                          <a
                            href={file.url}
                            download={file.name}
                            className="p-1 text-gray-400 hover:text-green-500"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </>
                      )}
                      <button
                        onClick={() => deleteFile(file)}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}

                  {file.status === 'error' && (
                    <>
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      <span className="text-sm text-red-500">{file.error}</span>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Storage Info */}
        <div className="space-y-1 text-xs text-gray-500">
          <p>• Files are encrypted and stored securely in HIPAA-compliant storage</p>
          <p>• Files are automatically backed up and archived according to retention policies</p>
          <p>• Access is logged and audited for compliance</p>
        </div>
      </div>
    </Feature>
  );
}
