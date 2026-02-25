'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import BeccaAILoader from './BeccaAILoader';
import { logger } from '@/lib/logger';
import { apiFetch } from '@/lib/api/fetch';

interface SOAPNote {
  id: number;
  createdAt: string;
  updatedAt: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  medicalNecessity?: string;
  status: string;
  sourceType: string;
  generatedByAI: boolean;
  approvedBy?: number;
  approvedAt?: string;
  lockedAt?: string;
  approvedByProvider?: {
    firstName: string;
    lastName: string;
    titleLine?: string;
  };
  intakeDocument?: {
    filename: string;
    createdAt: string;
  };
}

interface PatientSOAPNotesViewProps {
  patientId: number;
  currentProviderId?: number;
}

export default function PatientSOAPNotesView({
  patientId,
  currentProviderId,
}: PatientSOAPNotesViewProps) {
  const [soapNotes, setSOAPNotes] = useState<SOAPNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<SOAPNote | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [approvalPassword, setApprovalPassword] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editReason, setEditReason] = useState('');
  const [showOnlyApproved, setShowOnlyApproved] = useState(false);
  const [editContent, setEditContent] = useState({
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
    medicalNecessity: '',
  });

  // Fetch SOAP notes
  useEffect(() => {
    fetchSOAPNotes();
  }, [patientId]);

  const fetchSOAPNotes = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(
        `/api/soap-notes?patientId=${patientId}&includeRevisions=false`
      );
      const data = await response.json();

      if (data.ok) {
        setSOAPNotes(data.data);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError('Failed to load SOAP notes');
      logger.error('Error fetching SOAP notes:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generate SOAP note from intake or invoice metadata
  const handleGenerateFromIntake = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await apiFetch('/api/soap-notes/generate', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        await fetchSOAPNotes();
        if (data.soapNote?.id) {
          const notesResponse = await apiFetch(
            `/api/soap-notes?patientId=${patientId}&includeRevisions=false`
          );
          const notesData = await notesResponse.json();
          if (notesData.ok && notesData.data?.length > 0) {
            const newNote = notesData.data.find((n: SOAPNote) => n.id === data.soapNote.id);
            if (newNote) {
              setSelectedNote(newNote);
            }
          }
        }
      } else {
        // Show the actual error from the API
        console.error('[SOAP Generation Error]', data);
        const errorMessage = data.error || data.message || 'Failed to generate SOAP note';

        // Provide helpful context based on action
        if (data.action === 'no_data') {
          setError(`No intake data available. ${errorMessage}`);
        } else if (data.action === 'existing') {
          setError('A SOAP note already exists for this patient.');
          await fetchSOAPNotes(); // Refresh to show existing note
        } else if (data.action === 'failed') {
          setError(`Generation failed: ${errorMessage}`);
        } else {
          setError(errorMessage);
        }
      }
    } catch (err: any) {
      setError('Failed to generate SOAP note. Please try again.');
      logger.error('Error generating SOAP note:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Approve SOAP note
  const handleApprove = async () => {
    if (!selectedNote) return;

    try {
      const response = await apiFetch(`/api/soap-notes/${selectedNote.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          password: approvalPassword,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        await fetchSOAPNotes();
        setShowApprovalModal(false);
        setApprovalPassword('');
        // Update selected note with approval info
        if (data.soapNote) {
          setSelectedNote((prev) => (prev ? { ...prev, ...data.soapNote } : null));
        }
      } else {
        // Handle specific error codes
        if (data.code === 'PROVIDER_NOT_FOUND') {
          setError(
            'Your user account is not linked to a provider profile. Please contact your administrator.'
          );
        } else {
          setError(data.error || 'Failed to approve SOAP note');
        }
      }
    } catch (err: any) {
      setError('Failed to approve SOAP note');
      logger.error('Error approving SOAP note:', err);
    }
  };

  // Edit approved SOAP note
  const handleEdit = async () => {
    if (!selectedNote) return;

    try {
      const response = await apiFetch(`/api/soap-notes/${selectedNote.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'edit',
          password: editPassword,
          updates: editContent,
          changeReason: editReason,
          editorEmail: 'doctor@clinic.com',
        }),
      });

      const data = await response.json();

      if (data.ok) {
        await fetchSOAPNotes();
        setShowEditModal(false);
        setEditPassword('');
        setEditReason('');
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      // @ts-ignore

      setError('Failed to edit SOAP note');
      logger.error('Error editing SOAP note:', err);
    }
  };

  // Export SOAP note as text
  const handleExport = async (noteId: number) => {
    try {
      const response = await apiFetch(`/api/soap-notes/${noteId}?format=text`);
      const text = await response.text();

      // Create download
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soap-note-${noteId}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      // @ts-ignore

      logger.error('Error exporting SOAP note:', err);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      DRAFT: { color: 'bg-gray-100 text-gray-700', label: 'Draft' },
      PENDING_REVIEW: { color: 'bg-yellow-100 text-yellow-700', label: 'Pending Review' },
      APPROVED: { color: 'bg-green-100 text-green-700', label: 'Approved' },
      LOCKED: { color: 'bg-red-100 text-red-700', label: 'Locked' },
      ARCHIVED: { color: 'bg-gray-100 text-gray-500', label: 'Archived' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.DRAFT;

    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}
      >
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <BeccaAILoader text="Loading SOAP notes..." size="medium" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">SOAP Notes</h2>
        <div className="flex items-center space-x-4">
          {/* Generate Button */}
          <button
            onClick={handleGenerateFromIntake}
            disabled={isGenerating}
            className="inline-flex items-center rounded-lg bg-[#4fa77e] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3f8660] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <svg
                  className="-ml-1 mr-2 h-4 w-4 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                Generate SOAP Note
              </>
            )}
          </button>
          {/* Filter Toggle */}
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={showOnlyApproved}
              onChange={(e: any) => setShowOnlyApproved(e.target.checked)}
              className="rounded border-gray-300 text-[#4fa77e] focus:ring-[#4fa77e]"
            />
            <span className="text-gray-700">Show only approved</span>
          </label>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-600">
          {error}
        </div>
      )}

      {/* AI Generation Loading Overlay */}
      {isGenerating && (
        <BeccaAILoader
          text="Generating SOAP Note"
          subText="Becca AI is analyzing the intake form and creating a comprehensive SOAP note..."
          size="large"
          fullScreen={true}
        />
      )}

      {/* SOAP Notes List */}
      <div className="space-y-4">
        {(() => {
          const filteredNotes = showOnlyApproved
            ? soapNotes.filter((note: any) => note.approvedBy)
            : soapNotes;

          if (filteredNotes.length === 0) {
            return (
              <div className="py-12 text-center text-gray-500">
                <svg
                  className="mx-auto mb-4 h-12 w-12 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="mb-4">
                  {showOnlyApproved
                    ? 'No approved SOAP notes available. Provider approval is required.'
                    : 'No SOAP notes available for this patient.'}
                </p>
                {!showOnlyApproved && (
                  <button
                    onClick={handleGenerateFromIntake}
                    disabled={isGenerating}
                    className="inline-flex items-center rounded-lg bg-[#4fa77e] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#3f8660] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <>
                        <svg
                          className="-ml-1 mr-2 h-4 w-4 animate-spin text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg
                          className="mr-2 h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        Generate SOAP Note
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          }

          return filteredNotes.map((note: any) => (
            <div
              key={note.id}
              className="cursor-pointer rounded-lg border bg-white p-6 transition-shadow hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
              onClick={() => setSelectedNote(note)}
              onKeyDown={(e) => { if (e.key === 'Enter') setSelectedNote(note); }}
              tabIndex={0}
              role="button"
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-3">
                    <h3 className="font-semibold">SOAP Note #{note.id}</h3>
                    {getStatusBadge(note.status)}
                    {note.generatedByAI && (
                      <span className="inline-flex items-center rounded-full border border-[#4fa77e]/20 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-[#4fa77e]">
                        Generated by Becca AI™
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Created: {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                  </p>
                  {note.approvedByProvider && (
                    <p className="mt-1 text-sm text-gray-600">
                      Approved by: Dr. {note.approvedByProvider.firstName}{' '}
                      {note.approvedByProvider.lastName}
                      {note.approvedAt && ` on ${format(new Date(note.approvedAt), 'MMM d, yyyy')}`}
                    </p>
                  )}
                </div>
                <div className="flex space-x-2">
                  {note.status === 'DRAFT' && (
                    <button
                      onClick={(e: any) => {
                        e.stopPropagation();
                        setSelectedNote(note);
                        setShowApprovalModal(true);
                      }}
                      className="rounded bg-[#4fa77e] px-3 py-1 text-sm text-white hover:bg-[#3f8660]"
                    >
                      Approve
                    </button>
                  )}
                  {note.status === 'APPROVED' && !note.lockedAt && (
                    <button
                      onClick={(e: any) => {
                        e.stopPropagation();
                        setSelectedNote(note);
                        setEditContent({
                          subjective: note.subjective,
                          objective: note.objective,
                          assessment: note.assessment,
                          plan: note.plan,
                          medicalNecessity: note.medicalNecessity || '',
                        });
                        setShowEditModal(true);
                      }}
                      className="rounded bg-yellow-600 px-3 py-1 text-sm text-white hover:bg-yellow-700"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={(e: any) => {
                      e.stopPropagation();
                      handleExport(note.id);
                    }}
                    className="rounded bg-gray-500 px-3 py-1 text-sm text-white hover:bg-gray-600"
                  >
                    Export
                  </button>
                </div>
              </div>

              {/* SOAP Content Preview */}
              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-semibold">Subjective:</span>
                  <p className="line-clamp-2 text-gray-700">{note.subjective}</p>
                </div>
                <div>
                  <span className="font-semibold">Objective:</span>
                  <p className="line-clamp-2 text-gray-700">{note.objective}</p>
                </div>
              </div>
            </div>
          ));
        })()}
      </div>

      {/* Detail Modal */}
      {selectedNote && !showApprovalModal && !showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6">
            <div className="mb-6 flex items-start justify-between">
              <h2 className="text-2xl font-bold">SOAP Note #{selectedNote.id}</h2>
              <button
                onClick={() => setSelectedNote(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-lg font-semibold">Subjective</h3>
                <p className="whitespace-pre-wrap text-gray-700">{selectedNote.subjective}</p>
              </div>

              <div>
                <h3 className="mb-2 text-lg font-semibold">Objective</h3>
                <p className="whitespace-pre-wrap text-gray-700">{selectedNote.objective}</p>
              </div>

              <div>
                <h3 className="mb-2 text-lg font-semibold">Assessment</h3>
                <p className="whitespace-pre-wrap text-gray-700">{selectedNote.assessment}</p>
              </div>

              <div>
                <h3 className="mb-2 text-lg font-semibold">Plan</h3>
                <p className="whitespace-pre-wrap text-gray-700">{selectedNote.plan}</p>
              </div>

              {selectedNote.medicalNecessity && (
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    Medical Necessity for Compounded GLP-1
                  </h3>
                  <p className="whitespace-pre-wrap text-gray-700">
                    {selectedNote.medicalNecessity}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showApprovalModal && selectedNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <h2 className="mb-4 text-xl font-bold">Approve SOAP Note</h2>
            <p className="mb-4 text-gray-600">
              By approving this SOAP note, you are confirming its accuracy and locking it for future
              edits. Please set a password that will be required for any future modifications.
            </p>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Set Edit Password (min 8 characters)
              </label>
              <input
                type="password"
                value={approvalPassword}
                onChange={(e: any) => setApprovalPassword(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                placeholder="Enter password"
              />
            </div>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowApprovalModal(false);
                  setApprovalPassword('');
                }}
                className="rounded-lg border px-4 py-2 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={approvalPassword.length < 12}
                className="rounded-lg bg-[#4fa77e] px-4 py-2 text-white hover:bg-[#3f8660] disabled:opacity-50"
              >
                Approve & Lock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6">
            <h2 className="mb-4 text-xl font-bold">Edit Approved SOAP Note</h2>
            <p className="mb-4 flex items-center gap-2 text-yellow-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              This SOAP note has been approved. Password verification is required to make edits.
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Edit Password
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e: any) => setEditPassword(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  placeholder="Enter the password set during approval"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Reason for Edit
                </label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e: any) => setEditReason(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  placeholder="Describe why this edit is necessary"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Subjective</label>
                <textarea
                  value={editContent.subjective}
                  onChange={(e: any) =>
                    setEditContent({ ...editContent, subjective: e.target.value })
                  }
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  rows={4}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Objective</label>
                <textarea
                  value={editContent.objective}
                  onChange={(e: any) =>
                    setEditContent({ ...editContent, objective: e.target.value })
                  }
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  rows={4}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Assessment</label>
                <textarea
                  value={editContent.assessment}
                  onChange={(e: any) =>
                    setEditContent({ ...editContent, assessment: e.target.value })
                  }
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  rows={4}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Plan</label>
                <textarea
                  value={editContent.plan}
                  onChange={(e: any) => setEditContent({ ...editContent, plan: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  rows={4}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Medical Necessity for Compounded GLP-1
                </label>
                <textarea
                  value={editContent.medicalNecessity}
                  onChange={(e: any) =>
                    setEditContent({ ...editContent, medicalNecessity: e.target.value })
                  }
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  rows={4}
                  placeholder="Explain why compounded GLP-1 with glycine is medically necessary..."
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditPassword('');
                    setEditReason('');
                  }}
                  className="rounded-lg border px-4 py-2 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEdit}
                  disabled={!editPassword || !editReason}
                  className="rounded-lg bg-yellow-600 px-4 py-2 text-white hover:bg-yellow-700 disabled:opacity-50"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
