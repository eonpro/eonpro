'use client';

/**
 * Document Management Page
 *
 * Centralized document storage and management using AWS S3
 */

import React, { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';
import {
  FileText,
  Upload,
  Filter,
  Grid,
  List,
  Download,
  Trash2,
  Eye,
  Clock,
  User,
  Shield,
  Archive,
  ChevronDown,
  Cloud,
  Lock,
} from 'lucide-react';
import { FileUploader } from '@/components/aws/FileUploader';
import { FileCategory, FileAccessLevel } from '@/lib/integrations/aws/s3Config';
import { Feature } from '@/components/Feature';
import { normalizedIncludes } from '@/lib/utils/search';

interface Document {
  id: string;
  name: string;
  category: FileCategory;
  size: number;
  uploadedAt: Date;
  uploadedBy: string;
  accessLevel: FileAccessLevel;
  key: string;
  url: string;
  patientId?: number;
  patientName?: string;
  tags?: string[];
  lastAccessed?: Date;
  version?: number;
}

export default function DocumentManagementPage() {
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FileCategory | 'all'>('all');
  const [selectedAccessLevel, setSelectedAccessLevel] = useState<FileAccessLevel | 'all'>('all');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploader, setShowUploader] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  // Load documents on mount
  useEffect(() => {
    loadDocuments();
  }, [selectedCategory, selectedAccessLevel]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      // Fetch documents from API
      const response = await fetch(
        '/api/v2/aws/s3/list?' +
          new URLSearchParams({
            category: selectedCategory !== 'all' ? selectedCategory : '',
            accessLevel: selectedAccessLevel !== 'all' ? selectedAccessLevel : '',
          })
      );

      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (error: any) {
      // @ts-ignore

      logger.error('Failed to load documents:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter documents
  const filteredDocuments = documents.filter((doc: any) => {
    const matchesSearch =
      normalizedIncludes(doc.name || '', searchQuery) ||
      normalizedIncludes(doc.patientName || '', searchQuery) ||
      doc.tags?.some((tag: any) => normalizedIncludes(tag || '', searchQuery));

    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    const matchesAccess = selectedAccessLevel === 'all' || doc.accessLevel === selectedAccessLevel;

    return matchesSearch && matchesCategory && matchesAccess;
  });

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  // Get category color
  const getCategoryColor = (category: FileCategory): string => {
    const colors: Record<FileCategory, string> = {
      [FileCategory.MEDICAL_RECORDS]: 'bg-blue-100 text-blue-800',
      [FileCategory.LAB_RESULTS]: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
      [FileCategory.PRESCRIPTIONS]: 'bg-green-100 text-green-800',
      [FileCategory.IMAGING]: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
      [FileCategory.INSURANCE]: 'bg-yellow-100 text-yellow-800',
      [FileCategory.CONSENT_FORMS]: 'bg-pink-100 text-pink-800',
      [FileCategory.INTAKE_FORMS]: 'bg-cyan-100 text-cyan-800',
      [FileCategory.BRANDING]: 'bg-emerald-100 text-emerald-800',
      [FileCategory.PROFILE_PICTURES]: 'bg-orange-100 text-orange-800',
      [FileCategory.PATIENT_PHOTOS]: 'bg-violet-100 text-violet-800',
      [FileCategory.OTHER]: 'bg-gray-100 text-gray-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  // Get access level icon
  const getAccessIcon = (level: FileAccessLevel) => {
    switch (level) {
      case FileAccessLevel.PUBLIC:
        return <Shield className="h-4 w-4 text-green-500" />;
      case FileAccessLevel.PRIVATE:
        return <Lock className="h-4 w-4 text-red-500" />;
      default:
        return <Shield className="h-4 w-4 text-yellow-500" />;
    }
  };

  return (
    <Feature feature="AWS_S3_STORAGE">
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Cloud className="h-8 w-8 text-blue-600" />
                <h1 className="text-3xl font-bold text-gray-900">Document Storage</h1>
              </div>
              <button
                onClick={() => setShowUploader(!showUploader)}
                className="flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
              >
                <Upload className="h-5 w-5" />
                <span>Upload Files</span>
              </button>
            </div>
            <p className="mt-2 text-gray-600">
              Secure HIPAA-compliant cloud storage for medical documents
            </p>
          </div>

          {/* Upload Section */}
          {showUploader && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">Upload Documents</h2>
              <FileUploader
                onUploadComplete={(file: any) => {
                  logger.debug('File uploaded:', { value: file });
                  loadDocuments();
                }}
                maxFiles={10}
              />
            </div>
          )}

          {/* Filters */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(e: any) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 py-2 pl-4 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e: any) => setSelectedCategory(e.target.value as FileCategory | 'all')}
                className="rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Categories</option>
                {Object.values(FileCategory).map((cat: any) => (
                  <option key={cat} value={cat}>
                    {cat.replace(/-/g, ' ').toUpperCase()}
                  </option>
                ))}
              </select>

              {/* Access Level Filter */}
              <select
                value={selectedAccessLevel}
                onChange={(e: any) =>
                  setSelectedAccessLevel(e.target.value as FileAccessLevel | 'all')
                }
                className="rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Access Levels</option>
                {Object.values(FileAccessLevel).map((level: any) => (
                  <option key={level} value={level}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </option>
                ))}
              </select>

              {/* View Toggle */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setView('list')}
                  className={`rounded p-2 ${view === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}
                >
                  <List className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setView('grid')}
                  className={`rounded p-2 ${view === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}
                >
                  <Grid className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Documents List/Grid */}
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <div className="p-12 text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
                <p className="mt-4 text-gray-500">Loading documents...</p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <p className="text-gray-500">No documents found</p>
              </div>
            ) : view === 'list' ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Document
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Category
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Patient
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Size
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Uploaded
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Access
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredDocuments.map((doc: any) => (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center">
                            <FileText className="mr-2 h-5 w-5 text-gray-400" />
                            <div>
                              <div className="text-sm font-medium text-gray-900">{doc.name}</div>
                              {doc.version && (
                                <div className="text-xs text-gray-500">v{doc.version}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getCategoryColor(doc.category)}`}
                          >
                            {doc.category.replace(/-/g, ' ')}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="text-sm text-gray-900">{doc.patientName || '-'}</div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                          {formatFileSize(doc.size)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="text-sm text-gray-900">{formatDate(doc.uploadedAt)}</div>
                          <div className="text-xs text-gray-500">by {doc.uploadedBy}</div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center space-x-1">
                            {getAccessIcon(doc.accessLevel)}
                            <span className="text-xs text-gray-500">{doc.accessLevel}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-blue-600"
                            >
                              <Eye className="h-4 w-4" />
                            </a>
                            <a
                              href={doc.url}
                              download={doc.name}
                              className="text-gray-400 hover:text-green-600"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                            <button className="text-gray-400 hover:text-yellow-600">
                              <Archive className="h-4 w-4" />
                            </button>
                            <button className="text-gray-400 hover:text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredDocuments.map((doc: any) => (
                  <div
                    key={doc.id}
                    className="cursor-pointer rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-lg"
                    onClick={() => setSelectedDocument(doc)}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <FileText className="h-8 w-8 text-gray-400" />
                      {getAccessIcon(doc.accessLevel)}
                    </div>
                    <h3 className="mb-1 truncate font-medium text-gray-900">{doc.name}</h3>
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${getCategoryColor(doc.category)}`}
                    >
                      {doc.category.replace(/-/g, ' ')}
                    </span>
                    <div className="mt-3 space-y-1">
                      <div className="text-xs text-gray-500">{formatFileSize(doc.size)}</div>
                      <div className="text-xs text-gray-500">{formatDate(doc.uploadedAt)}</div>
                      {doc.patientName && (
                        <div className="text-xs text-gray-500">Patient: {doc.patientName}</div>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e: any) => e.stopPropagation()}
                          className="text-gray-400 hover:text-blue-600"
                        >
                          <Eye className="h-4 w-4" />
                        </a>
                        <a
                          href={doc.url}
                          download={doc.name}
                          onClick={(e: any) => e.stopPropagation()}
                          className="text-gray-400 hover:text-green-600"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                      </div>
                      <button
                        onClick={(e: any) => {
                          e.stopPropagation();
                          // Handle delete
                        }}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Storage Stats */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Documents</p>
                  <p className="text-2xl font-bold text-gray-900">{documents.length}</p>
                </div>
                <FileText className="h-8 w-8 text-blue-500" />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Storage</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatFileSize(documents.reduce((sum, doc) => sum + doc.size, 0))}
                  </p>
                </div>
                <Cloud className="h-8 w-8 text-green-500" />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Last Upload</p>
                  <p className="text-sm font-medium text-gray-900">
                    {documents.length > 0 ? formatDate(documents[0].uploadedAt) : 'No uploads yet'}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-[var(--brand-primary)]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Feature>
  );
}
