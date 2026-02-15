'use client';

import { useState, useCallback, useEffect } from 'react';
import { logger } from '../../../lib/logger';
import { portalFetch, getPortalResponseError, SESSION_EXPIRED_MESSAGE } from '@/lib/api/patient-portal-client';
import { safeParseJson, safeParseJsonString } from '@/lib/utils/safe-json';
import { getMinimalPortalUserPayload, setPortalUserStorage } from '@/lib/utils/portal-user-storage';

import { Upload, FileText, Trash2, Download, Eye, ArrowLeft, Shield, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { toast } from '@/components/Toast';

interface Document {
  id: number;
  filename: string;
  category: string;
  mimeType: string;
  createdAt: string;
  size?: number;
  url?: string;
}

export default function PatientPortalDocuments() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState('MEDICAL_RECORDS');
  const [dragActive, setDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [patientId, setPatientId] = useState<number | null>(null);

  // Get patient ID from user (same as progress/dashboard so data matches admin profile)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const userJson = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      if (!userJson) {
        router.push(PATIENT_PORTAL_PATH);
        return;
      }
      try {
        const userData = safeParseJsonString<{ patientId?: number; role?: string }>(userJson);
        if (!userData) {
          if (!cancelled) router.push(PATIENT_PORTAL_PATH);
          return;
        }
        let pid: number | null = userData.patientId ?? null;
        if (pid == null && userData.role?.toLowerCase() === 'patient') {
          const meRes = await portalFetch('/api/auth/me');
          if (meRes.ok && !cancelled) {
            const meData = await safeParseJson(meRes);
            const fromMe = (meData as { user?: { patientId?: number } } | null)?.user?.patientId;
            if (typeof fromMe === 'number' && fromMe > 0) {
              pid = fromMe;
              setPortalUserStorage(getMinimalPortalUserPayload({ ...userData, patientId: fromMe }));
            }
          }
        }
        if (!cancelled && pid != null) setPatientId(pid);
        else if (!cancelled) router.push(PATIENT_PORTAL_PATH);
      } catch {
        if (!cancelled) router.push(PATIENT_PORTAL_PATH);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Fetch existing documents on component mount
  useEffect(() => {
    if (!patientId) return;

    const fetchDocuments = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await portalFetch(`/api/patients/${patientId}/documents`);
        const sessionError = getPortalResponseError(response);
        if (sessionError) {
          setError(sessionError);
          return;
        }
        if (response.ok) {
          const data = await safeParseJson(response);
          if (data !== null && Array.isArray(data)) {
            setDocuments(data);
          } else {
            setError('Failed to load documents. Please try again.');
          }
        } else {
          setError('Failed to load documents. Please try again.');
        }
      } catch (error) {
        logger.error('Error fetching documents', { error: error instanceof Error ? error.message : 'Unknown' });
        setError('Failed to load documents. Please check your connection and try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, [patientId]);

  const documentCategories = [
    { value: 'MEDICAL_RECORDS', label: 'Medical Records' },
    { value: 'LAB_RESULTS', label: 'Lab Results' },
    { value: 'CONSENT_FORMS', label: 'Consent Forms' },
    { value: 'PRESCRIPTIONS', label: 'Prescriptions' },
    { value: 'IMAGING', label: 'Imaging Results' },
    { value: 'OTHER', label: 'Other' },
  ];

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isUploading) return;
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, [isUploading]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (isUploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  }, [isUploading]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = async (files: FileList) => {
    if (!patientId) return;

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append('files', file);
    });
    formData.append('patientId', patientId.toString());
    formData.append('category', selectedCategory);
    formData.append('source', 'patient_portal');

    let progressInterval: NodeJS.Timeout | null = null;

    try {
      // Simulate upload progress
      progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            if (progressInterval) clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const response = await portalFetch(`/api/patients/${patientId}/documents`, {
        method: 'POST',
        body: formData,
      });

      if (progressInterval) clearInterval(progressInterval);
      setUploadProgress(100);

      if (response.ok) {
        const newDocuments = await safeParseJson(response);
        if (newDocuments !== null && Array.isArray(newDocuments)) {
          setDocuments([...documents, ...newDocuments]);
        }
        // Reset after successful upload
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
        }, 500);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      // Always clear the interval on error
      if (progressInterval) clearInterval(progressInterval);
      logger.error('Upload error', { error: error instanceof Error ? error.message : 'Unknown' });
      setIsUploading(false);
      setUploadProgress(0);
      toast.error('Failed to upload documents. Please try again.');
    }
  };

  const handleDelete = async (documentId: number) => {
    if (!patientId) return;

    if (!confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      const response = await portalFetch(`/api/patients/${patientId}/documents/${documentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setDocuments(documents.filter((doc) => doc.id !== documentId));
      } else {
        throw new Error('Delete failed');
      }
    } catch (error) {
      logger.error('Delete error', { error: error instanceof Error ? error.message : 'Unknown' });
      toast.error('Failed to delete document. Please try again.');
    }
  };

  const handleView = async (doc: Document) => {
    if (!patientId) return;

    try {
      const response = await portalFetch(`/api/patients/${patientId}/documents/${doc.id}`);

      if (response.ok) {
        // Create a blob URL and open in new tab
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else {
        const errBody = await safeParseJson(response);
        const errMsg =
          errBody !== null && typeof errBody === 'object' && 'error' in errBody
            ? String((errBody as { error?: unknown }).error)
            : 'Unknown error';
        toast.error(`Failed to view document: ${errMsg}`);
      }
    } catch (error: unknown) {
      logger.error('View error', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      toast.error('Failed to view document. Please try again.');
    }
  };

  const handleDownload = async (doc: Document) => {
    if (!patientId) return;

    try {
      const response = await portalFetch(`/api/patients/${patientId}/documents/${doc.id}/download`);
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
    } catch (error) {
      logger.error('Download error', { error: error instanceof Error ? error.message : 'Unknown' });
      toast.error('Failed to download document. Please try again.');
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
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.startsWith('text/')) return '📝';
    return '📎';
  };

  if (!patientId) {
    return null;
  }

  if (error) {
    const isSessionExpired = error === SESSION_EXPIRED_MESSAGE;
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div
          className={`max-w-md rounded-lg border p-4 text-center ${
            isSessionExpired ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          <p className="mb-2 font-medium">{isSessionExpired ? 'Session Expired' : 'Error Loading Documents'}</p>
          <p className="text-sm">{error}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {isSessionExpired ? (
              <Link
                href={`/login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/documents`)}&reason=session_expired`}
                className="rounded-lg bg-amber-200 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-300"
              >
                Log in
              </Link>
            ) : (
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-red-100 px-4 py-2 text-sm font-medium transition-colors hover:bg-red-200"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <Link href={PATIENT_PORTAL_PATH} className="mr-4">
                <ArrowLeft className="h-5 w-5 text-gray-600 hover:text-gray-900" />
              </Link>
              <h1 className="text-xl font-semibold text-gray-900">My Documents</h1>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Shield className="h-4 w-4" />
              <span>Secure Portal</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Privacy Notice */}
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start">
            <Lock className="mr-3 mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
            <div className="text-sm text-blue-900">
              <p className="mb-1 font-semibold">Your documents are secure</p>
              <p>
                All documents you upload are encrypted and only accessible by you and your
                healthcare provider. We comply with HIPAA regulations to protect your health
                information.
              </p>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold">Upload New Document</h2>

          <div className="mb-4">
            <label htmlFor="category" className="mb-1 block text-sm font-medium text-gray-700">
              Document Type
            </label>
            <select
              id="category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#4fa77e] focus:ring-2 focus:ring-[#4fa77e] md:w-auto"
            >
              {documentCategories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div
            className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragActive && !isUploading ? 'border-[#4fa77e] bg-green-50' : 'border-gray-300 hover:border-gray-400'
            } ${isUploading ? 'pointer-events-none opacity-90' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-upload"
              multiple
              disabled={isUploading}
              onChange={handleChange}
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif"
            />

            {isUploading ? (
              <div className="space-y-4">
                <div className="animate-pulse">
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                </div>
                <div className="mx-auto h-2.5 w-full max-w-md rounded-full bg-gray-200">
                  <div
                    className="h-2.5 rounded-full bg-[#4fa77e] transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
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
                    className="cursor-pointer font-semibold text-[#4fa77e] hover:text-[#3f8660]"
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
            <h2 className="text-lg font-semibold">Your Documents</h2>
          </div>

          {isLoading ? (
            <div className="p-6 text-center text-gray-500">
              <div className="mx-auto mb-2 h-12 w-12 animate-spin rounded-full border-b-2 border-[#4fa77e]"></div>
              <p>Loading documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <FileText className="mx-auto mb-2 h-12 w-12 text-gray-400" />
              <p>No documents uploaded yet</p>
              <p className="mt-1 text-sm">
                Upload your medical records, lab results, and other health documents to share with
                your healthcare provider.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {documents.map((doc) => (
                <div key={doc.id} className="p-4 transition-colors hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getFileIcon(doc.mimeType)}</span>
                      <div>
                        <p className="font-medium text-gray-900">{doc.filename}</p>
                        <p className="text-sm text-gray-500">
                          {documentCategories.find((cat) => cat.value === doc.category)?.label ||
                            doc.category}{' '}
                          •{formatFileSize(doc.size)} •
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleView(doc)}
                        className="p-2 text-gray-600 transition-colors hover:text-[#4fa77e]"
                        title="View document"
                      >
                        <Eye className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="p-2 text-gray-600 transition-colors hover:text-[#4fa77e]"
                        title="Download document"
                      >
                        <Download className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-2 text-gray-600 transition-colors hover:text-red-600"
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

        {/* Instructions */}
        <div className="mt-6 rounded-lg bg-gray-50 p-4">
          <h3 className="mb-2 font-semibold text-gray-900">Tips for uploading documents:</h3>
          <ul className="space-y-1 text-sm text-gray-600">
            <li>• Make sure documents are clear and legible</li>
            <li>• Remove any sensitive information you don't want to share</li>
            <li>• Label documents with descriptive names for easy identification</li>
            <li>• Supported formats: PDF, Word documents, text files, and images</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
