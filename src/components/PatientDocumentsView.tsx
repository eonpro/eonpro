'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Upload, FileText, Trash2, Download, Eye, Image, File, FileType } from 'lucide-react';
import { logger } from '@/lib/logger';
import { apiFetch } from '@/lib/api/fetch';

interface Document {
  id: number;
  filename: string;
  category: string;
  mimeType: string;
  uploadedAt: string;
  size?: number;
  url?: string;
}

interface PatientDocumentsViewProps {
  patientId: number;
  patientName: string;
}

export default function PatientDocumentsView({
  patientId,
  patientName,
}: PatientDocumentsViewProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('id-photo');
  const [dragActive, setDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch existing documents on component mount
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setIsLoading(true);
        const token =
          localStorage.getItem('auth-token') || localStorage.getItem('admin-token') || '';
        const response = await apiFetch(`/api/patients/${patientId}/documents`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (response.ok) {
          const data = await response.json();
          setDocuments(data);
        } else if (response.status === 401) {
          logger.error('Unauthorized access to documents');
          // In a real app, redirect to login
        }
      } catch (error: any) {
        // @ts-ignore

        logger.error('Error fetching documents:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, [patientId]);

  const documentCategories = [
    { value: 'id-photo', label: 'ID Picture' },
    { value: 'medical-records', label: 'Medical Records' },
    { value: 'lab-results', label: 'Lab Results' },
    { value: 'insurance', label: 'Insurance Documents' },
    { value: 'consent-forms', label: 'Consent Forms' },
    { value: 'prescriptions', label: 'Prescriptions' },
    { value: 'imaging', label: 'Imaging Results' },
    { value: 'other', label: 'Other' },
  ];

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = async (files: FileList) => {
    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    Array.from(files).forEach((file: any) => {
      formData.append('files', file);
    });
    formData.append('patientId', patientId.toString());
    formData.append('category', selectedCategory);

    let progressInterval: NodeJS.Timeout | null = null;

    try {
      // Simulate upload progress
      progressInterval = setInterval(() => {
        setUploadProgress((prev: any) => {
          if (prev >= 90) {
            if (progressInterval) clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token') || '';
      const response = await apiFetch(`/api/patients/${patientId}/documents`, {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (progressInterval) clearInterval(progressInterval);
      setUploadProgress(100);

      if (response.ok) {
        const newDocuments = await response.json();
        setDocuments([...documents, ...newDocuments]);
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
        }, 500);
      } else {
        const data = await response.json().catch(() => ({}));
        const msg =
          data?.error ||
          (response.status === 500
            ? 'Server error. Use the Labs tab for lab PDFs.'
            : `Upload failed (${response.status})`);
        throw new Error(msg);
      }
    } catch (error: any) {
      if (progressInterval) clearInterval(progressInterval);
      logger.error('Upload error:', error);
      setIsUploading(false);
      setUploadProgress(0);
      const message =
        error instanceof Error ? error.message : 'Failed to upload documents. Please try again.';
      const labHint =
        message.includes('Labs') || message.includes('Lab tab')
          ? ''
          : '\n\nFor lab results (Quest PDFs), use the Labs tab in the patient sidebar.';
      alert(message + labHint);
    }
  };

  const handleDelete = async (documentId: number) => {
    if (!confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token') || '';
      const response = await apiFetch(`/api/patients/${patientId}/documents/${documentId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (response.ok) {
        setDocuments(documents.filter((doc: any) => doc.id !== documentId));
      } else {
        throw new Error('Delete failed');
      }
    } catch (error: any) {
      // @ts-ignore

      logger.error('Delete error:', error);
      alert('Failed to delete document. Please try again.');
    }
  };

  const handleView = async (doc: Document, skipRegeneratePrompt?: boolean) => {
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token') || '';
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const response = await apiFetch(`/api/patients/${patientId}/documents/${doc.id}`, {
        credentials: 'include',
        headers: authHeaders,
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
        return;
      }

      const error = await response.json().catch(() => ({ error: 'Unknown error' }));

      if (response.status === 404 && error.needsRegeneration && !skipRegeneratePrompt) {
        const shouldRegenerate = window.confirm(
          'This document has no viewable PDF yet (legacy format). Regenerate PDF now?'
        );
        if (!shouldRegenerate) return;

        const regenRes = await apiFetch(
          `/api/patients/${patientId}/documents/${doc.id}/regenerate`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
          }
        );
        if (!regenRes.ok) {
          const regenErr = await regenRes.json().catch(() => ({ error: 'Regenerate failed' }));
          alert(`Regenerate failed: ${regenErr.error || regenRes.statusText}`);
          return;
        }
        // Retry view once (skip prompt to avoid loop)
        await handleView(doc, true);
        return;
      }

      const message =
        response.status === 404 && error.needsRegeneration
          ? 'This document has no viewable file yet (legacy or not generated). Use regenerate if available, or re-upload the file.'
          : error.error || 'Unknown error';
      alert(`Cannot view document: ${message}`);
    } catch (err: unknown) {
      logger.error('View error:', err);
      alert('Failed to view document. Please try again.');
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token') || '';
      const response = await apiFetch(`/api/patients/${patientId}/documents/${doc.id}/download`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error: any) {
      // @ts-ignore

      logger.error('Download error:', error);
      alert('Failed to download document. Please try again.');
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Byte';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image className="h-8 w-8 text-blue-500" />;
    if (mimeType === 'application/pdf') return <FileText className="h-8 w-8 text-red-500" />;
    if (mimeType.startsWith('text/')) return <FileType className="h-8 w-8 text-gray-500" />;
    return <File className="h-8 w-8 text-gray-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>ID pictures, insurance, consent forms,</strong> and similar documents go here.{' '}
        <strong>Lab results (Quest PDFs):</strong> Use the{' '}
        <Link href={`/patients/${patientId}?tab=lab`} className="font-medium underline">
          Labs
        </Link>{' '}
        tab to upload and view parsed bloodwork.
      </div>
      {/* Upload Section */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">Upload Documents</h2>

        <div className="mb-4">
          <label htmlFor="category" className="mb-1 block text-sm font-medium text-gray-700">
            Document Category
          </label>
          <select
            id="category"
            value={selectedCategory}
            onChange={(e: any) => setSelectedCategory(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:outline-none focus:ring-2 md:w-auto"
            style={{ '--tw-ring-color': 'var(--brand-primary, #4fa77e)' } as React.CSSProperties}
          >
            {documentCategories.map((cat: any) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div
          className="relative rounded-lg border-2 border-dashed p-8 text-center transition-colors"
          style={{
            borderColor: dragActive ? 'var(--brand-primary, #4fa77e)' : '#d1d5db',
            backgroundColor: dragActive
              ? 'var(--brand-primary-light, rgba(79, 167, 126, 0.05))'
              : 'transparent',
          }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            id="file-upload"
            multiple
            onChange={handleChange}
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif"
          />

          {isUploading ? (
            <div className="space-y-4">
              <div className="animate-pulse">
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
              </div>
              <div className="h-2.5 w-full rounded-full bg-gray-200">
                <div
                  className="h-2.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${uploadProgress}%`,
                    backgroundColor: 'var(--brand-primary, #4fa77e)',
                  }}
                ></div>
              </div>
              <p className="text-sm text-gray-600">Uploading... {uploadProgress}%</p>
            </div>
          ) : (
            <>
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer font-semibold transition-opacity hover:opacity-80"
                  style={{ color: 'var(--brand-primary, #4fa77e)' }}
                >
                  Click to upload
                </label>{' '}
                or drag and drop
              </p>
              <p className="mt-1 text-xs text-gray-500">
                PDF, DOC, DOCX, TXT, JPG, PNG, GIF up to 10MB
              </p>
            </>
          )}
        </div>
      </div>

      {/* Documents List */}
      <div className="rounded-lg bg-white shadow">
        <div className="border-b px-6 py-4">
          <h2 className="text-xl font-semibold">Documents</h2>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-gray-500">
            <div
              className="mx-auto mb-2 h-12 w-12 animate-spin rounded-full border-b-2"
              style={{ borderColor: 'var(--brand-primary, #4fa77e)' }}
            ></div>
            <p>Loading documents...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <FileText className="mx-auto mb-2 h-12 w-12 text-gray-400" />
            <p>No documents uploaded yet</p>
          </div>
        ) : (
          <div className="divide-y">
            {documents.map((doc: any) => (
              <div key={doc.id} className="p-4 transition-colors hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="flex-shrink-0">{getFileIcon(doc.mimeType)}</span>
                    <div>
                      <p className="font-medium text-gray-900">{doc.filename}</p>
                      <p className="text-sm text-gray-500">
                        {documentCategories.find(
                          (cat: any) =>
                            cat.value === doc.category ||
                            cat.value ===
                              String(doc.category || '')
                                .toLowerCase()
                                .replace(/_/g, '-')
                        )?.label || doc.category}{' '}
                        •{formatFileSize(doc.size)} •{new Date(doc.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleView(doc)}
                      className="rounded-lg p-2 text-gray-600 transition-colors"
                      style={
                        { '--hover-color': 'var(--brand-primary, #4fa77e)' } as React.CSSProperties
                      }
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                        e.currentTarget.style.backgroundColor =
                          'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#4b5563';
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      title="View document"
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDownload(doc)}
                      className="rounded-lg p-2 text-gray-600 transition-colors"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                        e.currentTarget.style.backgroundColor =
                          'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#4b5563';
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      title="Download document"
                    >
                      <Download className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
                      title="Delete document"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
