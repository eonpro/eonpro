'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

export interface PatientNoteItem {
  id: number;
  content: string;
  noteType: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: number;
    firstName: string;
    lastName: string;
    role: string;
    initials: string;
    roleAbbrev: string;
  } | null;
  center: string | null;
}

interface PatientNotesViewProps {
  patientId: number;
}

export default function PatientNotesView({ patientId }: PatientNotesViewProps) {
  const [notes, setNotes] = useState<PatientNoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNote, setEditingNote] = useState<PatientNoteItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [newContent, setNewContent] = useState('');
  const [newNoteType, setNewNoteType] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch(`/api/patients/${patientId}/notes`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.data)) {
        setNotes(data.data);
      } else {
        setError(data.error || 'Failed to load notes');
      }
    } catch (err) {
      setError('Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleCreate = async () => {
    const content = newContent.trim();
    if (!content) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/patients/${patientId}/notes`, {
        method: 'POST',
        body: JSON.stringify({
          content,
          noteType: newNoteType.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowAddModal(false);
        setNewContent('');
        setNewNoteType('');
        await fetchNotes();
      } else {
        setError(data.error || 'Failed to create note');
      }
    } catch {
      setError('Failed to create note');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingNote) return;
    const content = newContent.trim();
    if (!content) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/patients/${patientId}/notes/${editingNote.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          content,
          noteType: newNoteType.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setEditingNote(null);
        setNewContent('');
        setNewNoteType('');
        await fetchNotes();
      } else {
        setError(data.error || 'Failed to update note');
      }
    } catch {
      setError('Failed to update note');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (noteId: number) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/patients/${patientId}/notes/${noteId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.ok) {
        setDeleteConfirmId(null);
        await fetchNotes();
      } else {
        setError(data.error || 'Failed to delete note');
      }
    } catch {
      setError('Failed to delete note');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (note: PatientNoteItem) => {
    setEditingNote(note);
    setNewContent(note.content);
    setNewNoteType(note.noteType ?? '');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Notes</h2>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            aria-label="Filter notes"
          >
            <option>All</option>
          </select>
          <button
            type="button"
            onClick={() => {
              setShowAddModal(true);
              setNewContent('');
              setNewNoteType('');
              setError(null);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] focus:ring-offset-2"
          >
            <Plus className="h-4 w-4" />
            Note
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          Loading notes…
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          No notes yet. Add one with the &quot;+ Note&quot; button.
        </div>
      ) : (
        <ul className="space-y-4">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <p className="mb-4 whitespace-pre-wrap text-gray-900">{note.content}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                <span suppressHydrationWarning>
                  Created: {format(new Date(note.createdAt), 'M/d/yyyy h:mm a')}
                </span>
                <span className="text-gray-300">|</span>
                <span>Note Type: {note.noteType || 'None'}</span>
                <span className="text-gray-300">|</span>
                <span className="flex items-center gap-1.5">
                  Created by:{' '}
                  {note.createdBy ? (
                    <>
                      <span
                        className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-xs font-medium text-white"
                        title={`${note.createdBy.firstName} ${note.createdBy.lastName}`}
                      >
                        {note.createdBy.initials}
                      </span>
                      <span>
                        {note.createdBy.firstName} {note.createdBy.lastName} (
                        {note.createdBy.roleAbbrev})
                      </span>
                    </>
                  ) : (
                    'Unknown'
                  )}
                </span>
                {note.center && (
                  <>
                    <span className="text-gray-300">|</span>
                    <span>Center: {note.center}</span>
                  </>
                )}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(note)}
                  className="rounded p-1.5 text-[var(--brand-primary)] hover:bg-gray-100"
                  aria-label="Edit note"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {deleteConfirmId === note.id ? (
                  <span className="flex items-center gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => handleDelete(note.id)}
                      disabled={submitting}
                      className="text-red-600 hover:underline"
                    >
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(null)}
                      className="text-gray-600 hover:underline"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(note.id)}
                    className="rounded p-1.5 text-[var(--brand-primary)] hover:bg-gray-100"
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add note modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Add note</h3>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Enter note content…"
              rows={4}
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            />
            <input
              type="text"
              value={newNoteType}
              onChange={(e) => setNewNoteType(e.target.value)}
              placeholder="Note type (optional)"
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setNewContent('');
                  setNewNoteType('');
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={submitting || !newContent.trim()}
                className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit note modal */}
      {editingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Edit note</h3>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Enter note content…"
              rows={4}
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            />
            <input
              type="text"
              value={newNoteType}
              onChange={(e) => setNewNoteType(e.target.value)}
              placeholder="Note type (optional)"
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingNote(null);
                  setNewContent('');
                  setNewNoteType('');
                }}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUpdate}
                disabled={submitting || !newContent.trim()}
                className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
