"use client";

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
  Search,
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
      const response = await fetch('/api/v2/aws/s3/list?' + new URLSearchParams({
        category: selectedCategory !== 'all' ? selectedCategory : '',
        accessLevel: selectedAccessLevel !== 'all' ? selectedAccessLevel : '',
      }));

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
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         doc.patientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         doc.tags?.some((tag: any) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
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
      [FileCategory.LAB_RESULTS]: 'bg-purple-100 text-purple-800',
      [FileCategory.PRESCRIPTIONS]: 'bg-green-100 text-green-800',
      [FileCategory.IMAGING]: 'bg-indigo-100 text-indigo-800',
      [FileCategory.INSURANCE]: 'bg-yellow-100 text-yellow-800',
      [FileCategory.CONSENT_FORMS]: 'bg-pink-100 text-pink-800',
      [FileCategory.INTAKE_FORMS]: 'bg-cyan-100 text-cyan-800',
      [FileCategory.OTHER]: 'bg-gray-100 text-gray-800',
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  // Get access level icon
  const getAccessIcon = (level: FileAccessLevel) => {
    switch (level) {
      case FileAccessLevel.PUBLIC:
        return <Shield className="w-4 h-4 text-green-500" />;
      case FileAccessLevel.PRIVATE:
        return <Lock className="w-4 h-4 text-red-500" />;
      default:
        return <Shield className="w-4 h-4 text-yellow-500" />;
    }
  };

  return (
    <Feature feature="AWS_S3_STORAGE">
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Cloud className="h-8 w-8 text-blue-600" />
                <h1 className="text-3xl font-bold text-gray-900">Document Storage</h1>
              </div>
              <button
                onClick={() => setShowUploader(!showUploader)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Upload className="w-5 h-5" />
                <span>Upload Files</span>
              </button>
            </div>
            <p className="text-gray-600 mt-2">
              Secure HIPAA-compliant cloud storage for medical documents
            </p>
          </div>

          {/* Upload Section */}
          {showUploader && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Upload Documents</h2>
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(e: any) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e: any) => setSelectedCategory(e.target.value as FileCategory | 'all')}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                onChange={(e: any) => setSelectedAccessLevel(e.target.value as FileAccessLevel | 'all')}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className={`p-2 rounded ${view === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}
                >
                  <List className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setView('grid')}
                  className={`p-2 rounded ${view === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}
                >
                  <Grid className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Documents List/Grid */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {loading ? (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-4">Loading documents...</p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No documents found</p>
              </div>
            ) : view === 'list' ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Document
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Patient
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Size
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Uploaded
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Access
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredDocuments.map((doc: any) => (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <FileText className="w-5 h-5 text-gray-400 mr-2" />
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {doc.name}
                              </div>
                              {doc.version && (
                                <div className="text-xs text-gray-500">
                                  v{doc.version}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(doc.category)}`}>
                            {doc.category.replace(/-/g, ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {doc.patientName || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatFileSize(doc.size)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {formatDate(doc.uploadedAt)}
                          </div>
                          <div className="text-xs text-gray-500">
                            by {doc.uploadedBy}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-1">
                            {getAccessIcon(doc.accessLevel)}
                            <span className="text-xs text-gray-500">
                              {doc.accessLevel}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-400 hover:text-blue-600"
                            >
                              <Eye className="w-4 h-4" />
                            </a>
                            <a
                              href={doc.url}
                              download={doc.name}
                              className="text-gray-400 hover:text-green-600"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                            <button className="text-gray-400 hover:text-yellow-600">
                              <Archive className="w-4 h-4" />
                            </button>
                            <button className="text-gray-400 hover:text-red-600">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-6">
                {filteredDocuments.map((doc: any) => (
                  <div
                    key={doc.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => setSelectedDocument(doc)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <FileText className="w-8 h-8 text-gray-400" />
                      {getAccessIcon(doc.accessLevel)}
                    </div>
                    <h3 className="font-medium text-gray-900 truncate mb-1">
                      {doc.name}
                    </h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getCategoryColor(doc.category)}`}>
                      {doc.category.replace(/-/g, ' ')}
                    </span>
                    <div className="mt-3 space-y-1">
                      <div className="text-xs text-gray-500">
                        {formatFileSize(doc.size)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(doc.uploadedAt)}
                      </div>
                      {doc.patientName && (
                        <div className="text-xs text-gray-500">
                          Patient: {doc.patientName}
                        </div>
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
                          <Eye className="w-4 h-4" />
                        </a>
                        <a
                          href={doc.url}
                          download={doc.name}
                          onClick={(e: any) => e.stopPropagation()}
                          className="text-gray-400 hover:text-green-600"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                      <button
                        onClick={(e: any) => {
                          e.stopPropagation();
                          // Handle delete
                        }}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Storage Stats */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Documents</p>
                  <p className="text-2xl font-bold text-gray-900">{documents.length}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Storage</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {formatFileSize(documents.reduce((sum, doc) => sum + doc.size, 0))}
                  </p>
                </div>
                <Cloud className="w-8 h-8 text-green-500" />
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Last Upload</p>
                  <p className="text-sm font-medium text-gray-900">
                    {documents.length > 0
                      ? formatDate(documents[0].uploadedAt)
                      : 'No uploads yet'}
                  </p>
                </div>
                <Clock className="w-8 h-8 text-purple-500" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Feature>
  );
}
