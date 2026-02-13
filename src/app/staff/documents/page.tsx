'use client';

import { useState } from 'react';
import {
  FileText,
  Search,
  Upload,
  Download,
  Eye,
  Trash2,
  FolderOpen,
  Filter,
  Clock,
} from 'lucide-react';

interface Document {
  id: string;
  name: string;
  patientName: string;
  category:
    | 'medical-records'
    | 'lab-results'
    | 'insurance'
    | 'consent-forms'
    | 'prescriptions'
    | 'other';
  uploadedBy: string;
  uploadedAt: string;
  size: string;
  status: 'pending-review' | 'approved' | 'rejected';
}

export default function StaffDocumentsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);

  // Mock documents
  const documents: Document[] = [
    {
      id: 'DOC-001',
      name: 'Lab_Results_Johnson.pdf',
      patientName: 'Sarah Johnson',
      category: 'lab-results',
      uploadedBy: 'Dr. Smith',
      uploadedAt: '2024-01-30T09:00:00',
      size: '2.4 MB',
      status: 'approved',
    },
    {
      id: 'DOC-002',
      name: 'Insurance_Card_Chen.pdf',
      patientName: 'Michael Chen',
      category: 'insurance',
      uploadedBy: 'Reception',
      uploadedAt: '2024-01-29T14:30:00',
      size: '1.1 MB',
      status: 'pending-review',
    },
    {
      id: 'DOC-003',
      name: 'Consent_Form_Davis.pdf',
      patientName: 'Emily Davis',
      category: 'consent-forms',
      uploadedBy: 'Nurse Jane',
      uploadedAt: '2024-01-28T11:00:00',
      size: '450 KB',
      status: 'approved',
    },
    {
      id: 'DOC-004',
      name: 'Medical_History_Wilson.pdf',
      patientName: 'James Wilson',
      category: 'medical-records',
      uploadedBy: 'Dr. Brown',
      uploadedAt: '2024-01-30T10:15:00',
      size: '3.2 MB',
      status: 'pending-review',
    },
    {
      id: 'DOC-005',
      name: 'Prescription_Anderson.pdf',
      patientName: 'Lisa Anderson',
      category: 'prescriptions',
      uploadedBy: 'Dr. Smith',
      uploadedAt: '2024-01-30T08:30:00',
      size: '120 KB',
      status: 'approved',
    },
  ];

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'medical-records':
        return 'bg-blue-100 text-blue-800';
      case 'lab-results':
        return 'bg-green-100 text-green-800';
      case 'insurance':
        return 'bg-purple-100 text-purple-800';
      case 'consent-forms':
        return 'bg-yellow-100 text-yellow-800';
      case 'prescriptions':
        return 'bg-pink-100 text-pink-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.patientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || doc.category === filterCategory;
    const matchesStatus = filterStatus === 'all' || doc.status === filterStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handleSelectAll = () => {
    if (selectedDocuments.length === filteredDocuments.length) {
      setSelectedDocuments([]);
    } else {
      setSelectedDocuments(filteredDocuments.map((doc) => doc.id));
    }
  };

  const handleSelectDocument = (id: string) => {
    setSelectedDocuments((prev) =>
      prev.includes(id) ? prev.filter((docId) => docId !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileText className="h-6 w-6" />
            Document Management
          </h1>
          <button className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-white hover:bg-cyan-700">
            <Upload className="h-4 w-4" />
            Upload Document
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
            <input
              type="text"
              placeholder="Search documents or patients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border py-2 pl-10 pr-4 focus:ring-2 focus:ring-cyan-500"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg border px-4 py-2 focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All Categories</option>
            <option value="medical-records">Medical Records</option>
            <option value="lab-results">Lab Results</option>
            <option value="insurance">Insurance</option>
            <option value="consent-forms">Consent Forms</option>
            <option value="prescriptions">Prescriptions</option>
            <option value="other">Other</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border px-4 py-2 focus:ring-2 focus:ring-cyan-500"
          >
            <option value="all">All Status</option>
            <option value="pending-review">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-cyan-600">{documents.length}</div>
          <div className="text-sm text-gray-600">Total Documents</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-yellow-600">
            {documents.filter((d) => d.status === 'pending-review').length}
          </div>
          <div className="text-sm text-gray-600">Pending Review</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-green-600">
            {documents.filter((d) => d.status === 'approved').length}
          </div>
          <div className="text-sm text-gray-600">Approved</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-blue-600">
            {
              documents.filter((d) => {
                const uploadDate = new Date(d.uploadedAt);
                const today = new Date();
                return uploadDate.toDateString() === today.toDateString();
              }).length
            }
          </div>
          <div className="text-sm text-gray-600">Uploaded Today</div>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedDocuments.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-4">
          <span className="text-sm text-blue-800">
            {selectedDocuments.length} document(s) selected
          </span>
          <div className="flex gap-2">
            <button className="rounded bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50">
              Download Selected
            </button>
            <button className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-700">
              Approve Selected
            </button>
            <button className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700">
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Documents Table */}
      <div className="rounded-lg bg-white shadow">
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={
                        selectedDocuments.length === filteredDocuments.length &&
                        filteredDocuments.length > 0
                      }
                      onChange={handleSelectAll}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Document Name</th>
                  <th className="px-4 py-3 text-left">Patient</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-left">Uploaded By</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Size</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc) => (
                  <tr key={doc.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedDocuments.includes(doc.id)}
                        onChange={() => handleSelectDocument(doc.id)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{doc.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{doc.patientName}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${getCategoryColor(doc.category)}`}
                      >
                        {doc.category.replace('-', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{doc.uploadedBy}</td>
                    <td className="px-4 py-3 text-sm">
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm">{doc.size}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${getStatusColor(doc.status)}`}
                      >
                        {doc.status.replace('-', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button className="rounded p-1 text-blue-600 hover:bg-blue-50">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button className="rounded p-1 text-green-600 hover:bg-green-50">
                          <Download className="h-4 w-4" />
                        </button>
                        <button className="rounded p-1 text-red-600 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
