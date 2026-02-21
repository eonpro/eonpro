'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Plus,
  Download,
  Edit,
  Calendar,
  User,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

interface SOAPNote {
  id: number;
  patientId: number;
  patientName: string;
  visitDate: string;
  chiefComplaint?: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  status: 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'LOCKED' | 'ARCHIVED';
  provider?: string;
  followUpDate?: string;
  createdAt: string;
  updatedAt: string;
  approvedBy?: number;
  approvedAt?: string;
}

export default function ProviderSOAPNotesPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNote, setSelectedNote] = useState<SOAPNote | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [soapNotes, setSoapNotes] = useState<SOAPNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Handler for creating a new SOAP note
  const handleNewNote = () => {
    // Navigate to patients list to select a patient for new SOAP note
    router.push('/provider/patients?action=new-soap-note');
  };

  // Handler for editing an existing note
  const handleEditNote = (noteId: number) => {
    // Open note in edit mode via query param
    router.push(`/provider/soap-notes?edit=${noteId}`);
  };

  // Handler for completing and signing a draft note
  const handleCompleteAndSign = async (noteId: number) => {
    if (
      !confirm(
        'Are you sure you want to complete and sign this note? This action cannot be undone.'
      )
    )
      return;

    setActionLoading(true);
    try {
      const response = await apiFetch(`/api/soap-notes/${noteId}/sign`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to sign note');
      }

      // Refresh the list
      await fetchSOAPNotes();
      setSelectedNote(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to complete and sign note');
    } finally {
      setActionLoading(false);
    }
  };

  // Handler for exporting a note as PDF
  const handleExportPDF = async (noteId: number) => {
    try {
      const response = await apiFetch(`/api/soap-notes/${noteId}/export`);

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soap-note-${noteId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export PDF');
    }
  };

  const fetchSOAPNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all SOAP notes for the clinic
      const response = await apiFetch('/api/soap-notes/list');

      if (!response.ok) {
        if (response.status === 404) {
          // Endpoint might not exist yet - show empty state
          setSoapNotes([]);
          return;
        }
        throw new Error('Failed to fetch SOAP notes');
      }

      const data = await response.json();
      setSoapNotes(data.data || []);
    } catch (err) {
      console.error('Error fetching SOAP notes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load SOAP notes');
      setSoapNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSOAPNotes();
  }, [fetchSOAPNotes]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
      case 'LOCKED':
        return 'bg-green-100 text-green-800';
      case 'PENDING_REVIEW':
        return 'bg-blue-100 text-blue-800';
      case 'ARCHIVED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'completed';
      case 'LOCKED':
        return 'signed';
      case 'PENDING_REVIEW':
        return 'pending';
      case 'ARCHIVED':
        return 'archived';
      default:
        return 'draft';
    }
  };

  const filteredNotes = soapNotes.filter((note) => {
    const matchesSearch =
      normalizedIncludes(note.patientName || '', searchTerm) ||
      normalizedIncludes(note.subjective || '', searchTerm) ||
      normalizedIncludes(note.assessment || '', searchTerm);

    let matchesFilter = filterStatus === 'all';
    if (filterStatus === 'draft') matchesFilter = note.status === 'DRAFT';
    if (filterStatus === 'completed') matchesFilter = note.status === 'APPROVED';
    if (filterStatus === 'signed') matchesFilter = note.status === 'LOCKED';
    if (filterStatus === 'pending') matchesFilter = note.status === 'PENDING_REVIEW';

    return matchesSearch && (filterStatus === 'all' || matchesFilter);
  });

  const draftCount = soapNotes.filter((n) => n.status === 'DRAFT').length;
  const completedCount = soapNotes.filter((n) => n.status === 'APPROVED').length;
  const signedCount = soapNotes.filter((n) => n.status === 'LOCKED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileText className="h-6 w-6" />
            SOAP Notes
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchSOAPNotes}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleNewNote}
              className="flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-white hover:brightness-90"
            >
              <Plus className="h-4 w-4" />
              New SOAP Note
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search by patient or complaint..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border py-2 pl-4 pr-4 focus:ring-2 focus:ring-[var(--brand-primary)]"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border px-4 py-2 focus:ring-2 focus:ring-[var(--brand-primary)]"
          >
            <option value="all">All Notes</option>
            <option value="draft">Drafts</option>
            <option value="completed">Completed</option>
            <option value="signed">Signed</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-[var(--brand-primary)]">{soapNotes.length}</div>
          <div className="text-sm text-gray-600">Total Notes</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-yellow-600">{draftCount}</div>
          <div className="text-sm text-gray-600">Drafts</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-green-600">{completedCount}</div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-blue-600">{signedCount}</div>
          <div className="text-sm text-gray-600">Signed</div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Notes List */}
        <div className="col-span-2 rounded-lg bg-white shadow">
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <h3 className="mb-2 text-lg font-medium text-gray-900">No SOAP Notes</h3>
                <p className="mb-4 text-gray-500">
                  {searchTerm || filterStatus !== 'all'
                    ? 'No notes match your search criteria.'
                    : 'SOAP notes will appear here when created for patients.'}
                </p>
                <p className="text-sm text-gray-400">
                  Create SOAP notes from patient records or during consultations.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredNotes.map((note) => (
                  <div
                    key={note.id}
                    onClick={() => setSelectedNote(note)}
                    className={`cursor-pointer rounded-lg border p-4 transition-shadow hover:shadow-md ${
                      selectedNote?.id === note.id ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-light)]' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="font-medium">{note.patientName}</span>
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${getStatusColor(note.status)}`}
                          >
                            {getStatusLabel(note.status)}
                          </span>
                        </div>
                        <div className="mb-2 text-lg font-medium text-gray-900">
                          {note.chiefComplaint ||
                            note.assessment?.substring(0, 50) ||
                            'Clinical Note'}
                        </div>
                        <div className="mb-2 line-clamp-2 text-sm text-gray-600">
                          <strong>S:</strong> {note.subjective}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(note.createdAt).toLocaleDateString()}
                          </span>
                          {note.followUpDate && (
                            <span>
                              Follow-up: {new Date(note.followUpDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded p-2 text-gray-600 hover:bg-gray-100">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button className="rounded p-2 text-gray-600 hover:bg-gray-100">
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Selected Note Details */}
        <div className="rounded-lg bg-white shadow">
          <div className="p-6">
            {selectedNote ? (
              <>
                <h3 className="mb-4 font-semibold">SOAP Note Details</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Chief Complaint</label>
                    <p className="mt-1 text-sm">
                      {selectedNote.chiefComplaint ||
                        selectedNote.assessment?.substring(0, 100) ||
                        '—'}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Subjective</label>
                    <p className="mt-1 text-sm">{selectedNote.subjective}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Objective</label>
                    <p className="mt-1 text-sm">{selectedNote.objective}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Assessment</label>
                    <p className="mt-1 text-sm">{selectedNote.assessment}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Plan</label>
                    <p className="mt-1 text-sm">{selectedNote.plan}</p>
                  </div>
                  {selectedNote.followUpDate && (
                    <div>
                      <label className="text-sm font-semibold text-gray-700">Follow-up</label>
                      <p className="mt-1 text-sm">
                        {new Date(selectedNote.followUpDate).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  <div className="space-y-2 pt-3">
                    {selectedNote.status === 'DRAFT' && (
                      <button
                        onClick={() => handleCompleteAndSign(selectedNote.id)}
                        disabled={actionLoading}
                        className="w-full rounded bg-green-100 px-3 py-2 text-green-700 hover:bg-green-200 disabled:opacity-50"
                      >
                        {actionLoading ? 'Processing...' : 'Complete & Sign'}
                      </button>
                    )}
                    {selectedNote.status === 'APPROVED' && (
                      <button
                        onClick={() => handleCompleteAndSign(selectedNote.id)}
                        disabled={actionLoading}
                        className="w-full rounded bg-blue-100 px-3 py-2 text-blue-700 hover:bg-blue-200 disabled:opacity-50"
                      >
                        {actionLoading ? 'Processing...' : 'Add Signature'}
                      </button>
                    )}
                    {(selectedNote.status === 'DRAFT' ||
                      selectedNote.status === 'PENDING_REVIEW') && (
                      <button
                        onClick={() => handleEditNote(selectedNote.id)}
                        className="w-full rounded bg-[var(--brand-primary-light)] px-3 py-2 text-[var(--brand-primary)] hover:bg-[var(--brand-primary-light)]"
                      >
                        Edit Note
                      </button>
                    )}
                    <button
                      onClick={() => handleExportPDF(selectedNote.id)}
                      className="w-full rounded bg-gray-100 px-3 py-2 text-gray-700 hover:bg-gray-200"
                    >
                      Export PDF
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-500">
                <FileText className="mx-auto mb-2 h-12 w-12 text-gray-300" />
                <p>Select a SOAP note to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
