'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import BeccaAILoader from './BeccaAILoader';
import { logger } from '@/lib/logger';

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
  currentProviderId 
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

  // Helper to get auth headers for API calls
  const getAuthHeaders = (): HeadersInit => {
    const token = localStorage.getItem('auth-token') ||
                  localStorage.getItem('super_admin-token') ||
                  localStorage.getItem('admin-token') ||
                  localStorage.getItem('provider-token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  // Fetch SOAP notes
  useEffect(() => {
    fetchSOAPNotes();
  }, [patientId]);

  const fetchSOAPNotes = async () => {
    try {
      setLoading(true);
      const headers = getAuthHeaders();
      const response = await fetch(`/api/soap-notes?patientId=${patientId}&includeRevisions=false`, {
        credentials: 'include',
        headers,
      });
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
      const headers = getAuthHeaders();
      // Use the new /api/soap-notes/generate endpoint which has better logic
      // for handling both intake forms and invoice metadata (Heyflow patients)
      const response = await fetch('/api/soap-notes/generate', {
        method: 'POST',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
        }),
      });
      
      const data = await response.json();
      
      if (data.ok) {
        await fetchSOAPNotes();
        // Find the newly created note to display
        if (data.soapNote?.id) {
          const notesResponse = await fetch(`/api/soap-notes?patientId=${patientId}&includeRevisions=false`, {
            credentials: 'include',
            headers,
          });
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
    if (!selectedNote || !currentProviderId) return;
    
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/soap-notes/${selectedNote.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          providerId: currentProviderId,
          password: approvalPassword,
        }),
      });
      
      const data = await response.json();
      
      if (data.ok) {
        await fetchSOAPNotes();
        setShowApprovalModal(false);
        setApprovalPassword('');
      } else {
        setError(data.error);
      }
    } catch (err: any) {
    // @ts-ignore
   
      setError('Failed to approve SOAP note');
      logger.error('Error approving SOAP note:', err);
    }
  };

  // Edit approved SOAP note
  const handleEdit = async () => {
    if (!selectedNote) return;
    
    try {
      const headers = getAuthHeaders();
      const response = await fetch(`/api/soap-notes/${selectedNote.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          password: editPassword,
          updates: editContent,
          changeReason: editReason,
          editorEmail: 'doctor@clinic.com', // Get from session
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
      const headers = getAuthHeaders();
      const response = await fetch(`/api/soap-notes/${noteId}?format=text`, {
        credentials: 'include',
        headers,
      });
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
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <BeccaAILoader 
          text="Loading SOAP notes..."
          size="medium"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">SOAP Notes</h2>
        <div className="flex items-center space-x-4">
          {/* Generate Button */}
          <button
            onClick={handleGenerateFromIntake}
            disabled={isGenerating}
            className="inline-flex items-center px-4 py-2 bg-[#4fa77e] text-white text-sm font-medium rounded-lg hover:bg-[#3f8660] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
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
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
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
              <div className="text-center py-12 text-gray-500">
                <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
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
                    className="inline-flex items-center px-4 py-2 bg-[#4fa77e] text-white text-sm font-medium rounded-lg hover:bg-[#3f8660] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
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
              className="bg-white border rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedNote(note)}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center space-x-3">
                    <h3 className="font-semibold">
                      SOAP Note #{note.id}
                    </h3>
                    {getStatusBadge(note.status)}
                    {note.generatedByAI && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-[#4fa77e] border border-[#4fa77e]/20">
                        Generated by Becca AI™
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Created: {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                  </p>
                  {note.approvedByProvider && (
                    <p className="text-sm text-gray-600 mt-1">
                      Approved by: Dr. {note.approvedByProvider.firstName} {note.approvedByProvider.lastName}
                      {note.approvedAt && ` on ${format(new Date(note.approvedAt), 'MMM d, yyyy')}`}
                    </p>
                  )}
                </div>
                <div className="flex space-x-2">
                  {note.status === 'DRAFT' && currentProviderId && (
                    <button
                      onClick={(e: any) => {
                        e.stopPropagation();
                        setSelectedNote(note);
                        setShowApprovalModal(true);
                      }}
                      className="px-3 py-1 bg-[#4fa77e] text-white text-sm rounded hover:bg-[#3f8660]"
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
                      className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    onClick={(e: any) => {
                      e.stopPropagation();
                      handleExport(note.id);
                    }}
                    className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
                  >
                    Export
                  </button>
                </div>
              </div>

              {/* SOAP Content Preview */}
              <div className="space-y-3 text-sm">
                <div>
                  <span className="font-semibold">Subjective:</span>
                  <p className="text-gray-700 line-clamp-2">{note.subjective}</p>
                </div>
                <div>
                  <span className="font-semibold">Objective:</span>
                  <p className="text-gray-700 line-clamp-2">{note.objective}</p>
                </div>
              </div>
            </div>
          ));
        })()}
      </div>

      {/* Detail Modal */}
      {selectedNote && !showApprovalModal && !showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-2xl font-bold">SOAP Note #{selectedNote.id}</h2>
              <button
                onClick={() => setSelectedNote(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-lg mb-2">Subjective</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedNote.subjective}</p>
              </div>
              
              <div>
                <h3 className="font-semibold text-lg mb-2">Objective</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedNote.objective}</p>
              </div>
              
              <div>
                <h3 className="font-semibold text-lg mb-2">Assessment</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedNote.assessment}</p>
              </div>
              
              <div>
                <h3 className="font-semibold text-lg mb-2">Plan</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{selectedNote.plan}</p>
              </div>
              
              {selectedNote.medicalNecessity && (
                <div>
                  <h3 className="font-semibold text-lg mb-2">Medical Necessity for Compounded GLP-1</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedNote.medicalNecessity}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* Approval Modal */}
      {showApprovalModal && selectedNote && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Approve SOAP Note</h2>
            <p className="text-gray-600 mb-4">
              By approving this SOAP note, you are confirming its accuracy and locking it for future edits.
              Please set a password that will be required for any future modifications.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Set Edit Password (min 8 characters)
              </label>
              <input
                type="password"
                value={approvalPassword}
                onChange={(e: any) => setApprovalPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                placeholder="Enter password"
              />
            </div>
            
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowApprovalModal(false);
                  setApprovalPassword('');
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={approvalPassword.length < 12}
                className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] disabled:opacity-50"
              >
                Approve & Lock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedNote && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4">Edit Approved SOAP Note</h2>
            <p className="text-yellow-600 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              This SOAP note has been approved. Password verification is required to make edits.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Edit Password
                </label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e: any) => setEditPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  placeholder="Enter the password set during approval"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Edit
                </label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e: any) => setEditReason(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  placeholder="Describe why this edit is necessary"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subjective
                </label>
                <textarea
                  value={editContent.subjective}
                  onChange={(e: any) => setEditContent({...editContent, subjective: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  rows={4}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Objective
                </label>
                <textarea
                  value={editContent.objective}
                  onChange={(e: any) => setEditContent({...editContent, objective: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  rows={4}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assessment
                </label>
                <textarea
                  value={editContent.assessment}
                  onChange={(e: any) => setEditContent({...editContent, assessment: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  rows={4}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Plan
                </label>
                <textarea
                  value={editContent.plan}
                  onChange={(e: any) => setEditContent({...editContent, plan: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  rows={4}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Medical Necessity for Compounded GLP-1
                </label>
                <textarea
                  value={editContent.medicalNecessity}
                  onChange={(e: any) => setEditContent({...editContent, medicalNecessity: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
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
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEdit}
                  disabled={!editPassword || !editReason}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
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
