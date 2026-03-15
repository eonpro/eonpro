'use client';

import { useState, useEffect } from 'react';
import {
  FileText,
  Calendar,
  Users,
  ChevronDown,
  ChevronUp,
  Loader2,
  Shield,
  ClipboardList,
} from 'lucide-react';
import { portalFetch } from '@/lib/api/patient-portal-client';

interface VisitNote {
  id: number;
  date: string;
  provider?: string;
  summary: string;
  nextSteps?: string;
}

export default function PatientVisitNotesPage() {
  const [notes, setNotes] = useState<VisitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const res = await portalFetch('/api/patient-portal/visit-notes');
        if (res.ok) {
          const data = await res.json();
          setNotes(data.visitNotes ?? []);
        }
      } catch {
        // Non-blocking
      } finally {
        setLoading(false);
      }
    };
    void fetchNotes();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <ClipboardList className="h-5 w-5 text-blue-600" />
          Visit Notes
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Clinical notes from your appointments, approved by your provider
        </p>
      </div>

      {notes.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white py-16 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">No visit notes yet</p>
          <p className="mt-1 text-xs text-gray-400">
            Notes will appear here after your provider approves them
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white transition-shadow hover:shadow-sm"
            >
              <button
                onClick={() => setExpandedId(expandedId === note.id ? null : note.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {new Date(note.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                    {note.provider && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                        <Users className="h-3 w-3" />
                        {note.provider}
                      </p>
                    )}
                  </div>
                </div>
                {expandedId === note.id ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>

              {expandedId === note.id && (
                <div className="border-t border-gray-100 px-5 py-4">
                  <div className="space-y-4">
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Assessment
                      </p>
                      <p className="text-sm leading-relaxed text-gray-700">{note.summary}</p>
                    </div>
                    {note.nextSteps && (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Plan / Next Steps
                        </p>
                        <p className="text-sm leading-relaxed text-gray-700">{note.nextSteps}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 rounded-lg bg-gray-50 px-3 py-2">
                      <Shield className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-[11px] text-gray-500">
                        Approved clinical documentation
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
