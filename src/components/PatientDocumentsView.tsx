"use client";

import { useState, useCallback, useEffect } from "react";
import { Upload, FileText, Trash2, Download, Eye } from "lucide-react";
import { logger } from '@/lib/logger';

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
  patientName 
}: PatientDocumentsViewProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState("medical-records");
  const [dragActive, setDragActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch existing documents on component mount
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setIsLoading(true);
        // Get the auth token from localStorage (set by demo login)
        const token = localStorage.getItem('auth-token') || '';
        
        const response = await fetch(`/api/patients/${patientId}/documents`, {
          credentials: 'include',
          headers: {
            'Authorization': `Bearer ${token}`,
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setDocuments(data);
        } else if (response.status === 401) {
          logger.error("Unauthorized access to documents");
          // In a real app, redirect to login
        }
      } catch (error: any) {
    // @ts-ignore
   
        logger.error("Error fetching documents:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDocuments();
  }, [patientId]);

  const documentCategories = [
    { value: "medical-records", label: "Medical Records" },
    { value: "lab-results", label: "Lab Results" },
    { value: "insurance", label: "Insurance Documents" },
    { value: "consent-forms", label: "Consent Forms" },
    { value: "prescriptions", label: "Prescriptions" },
    { value: "imaging", label: "Imaging Results" },
    { value: "other", label: "Other" },
  ];

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
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
      formData.append("files", file);
    });
    formData.append("patientId", patientId.toString());
    formData.append("category", selectedCategory);

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

      // Get the auth token from localStorage
      const token = localStorage.getItem('auth-token') || '';
      
      const response = await fetch(`/api/patients/${patientId}/documents`, {
        method: "POST",
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (progressInterval) clearInterval(progressInterval);
      setUploadProgress(100);

      if (response.ok) {
        const newDocuments = await response.json();
        setDocuments([...documents, ...newDocuments]);
        
        // Reset after successful upload
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
        }, 500);
      } else {
        throw new Error("Upload failed");
      }
    } catch (error: any) {
      // Always clear the interval on error
      if (progressInterval) clearInterval(progressInterval);
    // @ts-ignore
   
      logger.error("Upload error:", error);
      setIsUploading(false);
      setUploadProgress(0);
      alert("Failed to upload documents. Please try again.");
    }
  };

  const handleDelete = async (documentId: number) => {
    if (!confirm("Are you sure you want to delete this document?")) {
      return;
    }

    try {
      // Get the auth token from localStorage
      const token = localStorage.getItem('auth-token') || '';
      
      const response = await fetch(`/api/patients/${patientId}/documents/${documentId}`, {
        method: "DELETE",
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setDocuments(documents.filter((doc: any) => doc.id !== documentId));
      } else {
        throw new Error("Delete failed");
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error("Delete error:", error);
      alert("Failed to delete document. Please try again.");
    }
  };

  const handleView = async (doc: Document) => {
    try {
      // Get the auth token from localStorage
      const token = localStorage.getItem('auth-token') || '';
      
      // Fetch the document with authentication
      const response = await fetch(`/api/patients/${patientId}/documents/${doc.id}`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      
      if (response.ok) {
        // Create a blob URL and open in new tab
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        window.open(url, "_blank");
        // Note: We don't revoke the URL immediately as the new tab needs it
        // The URL will be garbage collected when the tab is closed
      } else {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        alert(`Failed to view document: ${error.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      logger.error("View error:", error);
      alert("Failed to view document. Please try again.");
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      // Get the auth token from localStorage
      const token = localStorage.getItem('auth-token') || '';
      
      const response = await fetch(`/api/patients/${patientId}/documents/${doc.id}/download`, {
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error("Download error:", error);
      alert("Failed to download document. Please try again.");
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown size";
    const sizes = ["Bytes", "KB", "MB", "GB"];
    if (bytes === 0) return "0 Byte";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + " " + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return "🖼️";
    if (mimeType === "application/pdf") return "📄";
    if (mimeType.startsWith("text/")) return "📝";
    return "📎";
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Upload Documents</h2>
        
        <div className="mb-4">
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
            Document Category
          </label>
          <select
            id="category"
            value={selectedCategory}
            onChange={(e: any) => setSelectedCategory(e.target.value)}
            className="w-full md:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none focus:border-transparent"
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
          className="relative border-2 border-dashed rounded-lg p-8 text-center transition-colors"
          style={{
            borderColor: dragActive ? 'var(--brand-primary, #4fa77e)' : '#d1d5db',
            backgroundColor: dragActive ? 'var(--brand-primary-light, rgba(79, 167, 126, 0.05))' : 'transparent'
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
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%`, backgroundColor: 'var(--brand-primary, #4fa77e)' }}
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
                  className="font-semibold cursor-pointer transition-opacity hover:opacity-80"
                  style={{ color: 'var(--brand-primary, #4fa77e)' }}
                >
                  Click to upload
                </label>{" "}
                or drag and drop
              </p>
              <p className="text-xs text-gray-500 mt-1">
                PDF, DOC, DOCX, TXT, JPG, PNG, GIF up to 10MB
              </p>
            </>
          )}
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Documents</h2>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-gray-500">
            <div
              className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-2"
              style={{ borderColor: 'var(--brand-primary, #4fa77e)' }}
            ></div>
            <p>Loading documents...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-2" />
            <p>No documents uploaded yet</p>
          </div>
        ) : (
          <div className="divide-y">
            {documents.map((doc: any) => (
              <div key={doc.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{getFileIcon(doc.mimeType)}</span>
                    <div>
                      <p className="font-medium text-gray-900">{doc.filename}</p>
                      <p className="text-sm text-gray-500">
                        {documentCategories.find((cat: any) => cat.value === doc.category)?.label || doc.category} • 
                        {formatFileSize(doc.size)} • 
                        {new Date(doc.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleView(doc)}
                      className="p-2 text-gray-600 rounded-lg transition-colors"
                      style={{ '--hover-color': 'var(--brand-primary, #4fa77e)' } as React.CSSProperties}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                        e.currentTarget.style.backgroundColor = 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
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
                      className="p-2 text-gray-600 rounded-lg transition-colors"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                        e.currentTarget.style.backgroundColor = 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
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
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
