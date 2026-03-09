'use client';

/**
 * Intake Form Builder — Landing Page
 *
 * Template list with visual template library cards for creating new forms.
 * Links to the full-screen builder at /admin/intake-builder/[id].
 *
 * Route: /admin/intake-builder
 * Isolation: 100% new file. Does not modify any existing pages.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  FileText,
  ArrowLeft,
  Activity,
  Heart,
  Stethoscope,
  LayoutTemplate,
  Clock,
  Users,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface TemplateRow {
  id: number;
  name: string;
  description: string | null;
  treatmentType: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  _count: { submissions: number; drafts: number };
}

const LIBRARY_TEMPLATES = [
  {
    id: 'weight-loss',
    name: 'Weight Loss Intake',
    description: 'Comprehensive GLP-1 weight loss medical intake with BMI, medical history, and medication assessment.',
    icon: Activity,
    color: 'from-emerald-500 to-teal-600',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    stats: { steps: 18, fields: 25, languages: ['EN', 'ES'] },
    treatmentType: 'weight-loss',
  },
  {
    id: 'hormone-therapy',
    name: 'Hormone Therapy',
    description: 'Hormone replacement therapy intake covering symptoms, lab history, and treatment goals.',
    icon: Heart,
    color: 'from-rose-500 to-pink-600',
    bgColor: 'bg-rose-50',
    textColor: 'text-rose-700',
    stats: { steps: 0, fields: 0, languages: ['EN'] },
    treatmentType: 'hormone-therapy',
    comingSoon: true,
  },
  {
    id: 'general',
    name: 'General Wellness',
    description: 'Standard medical intake form for general wellness visits and new patient onboarding.',
    icon: Stethoscope,
    color: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    stats: { steps: 0, fields: 0, languages: ['EN'] },
    treatmentType: 'general',
    comingSoon: true,
  },
  {
    id: 'blank',
    name: 'Blank Form',
    description: 'Start from scratch with a completely empty form. Build exactly what you need.',
    icon: LayoutTemplate,
    color: 'from-gray-500 to-gray-600',
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-700',
    stats: { steps: 0, fields: 0, languages: ['EN', 'ES'] },
    treatmentType: 'custom',
  },
];

export default function IntakeBuilderLandingPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/intake-templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => {
        if (cancelled) return;
        const raw = Array.isArray(d?.templates) ? d.templates : [];
        setTemplates(
          raw.map((t: Record<string, unknown>) => ({
            id: Number(t.id),
            name: String(t.name ?? ''),
            description: t.description != null ? String(t.description) : null,
            treatmentType: String(t.treatmentType ?? ''),
            isActive: Boolean(t.isActive),
            version: Number(t.version ?? 1),
            createdAt: t.createdAt != null ? String(t.createdAt) : '',
            _count: {
              submissions: Number((t._count as Record<string, unknown>)?.submissions ?? 0),
              drafts: Number((t._count as Record<string, unknown>)?.drafts ?? 0),
            },
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleCreateFromLibrary = useCallback(
    async (libraryId: string, treatmentType: string, name: string) => {
      setCreating(true);
      try {
        const res = await fetch('/api/admin/intake-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            treatmentType,
            fromLibrary: libraryId === 'blank' ? '' : libraryId,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const newId = data?.template?.id;
          if (newId) {
            router.push(`/admin/intake-builder/${newId}`);
            return;
          }
        }
      } catch {
        // Fallback: stay on page
      } finally {
        setCreating(false);
      }
    },
    [router],
  );

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/admin/intake-templates')}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Back to admin"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Form Builder</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Create and manage intake questionnaires
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowLibrary(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Form
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Template library modal */}
        {showLibrary && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            onClick={() => setShowLibrary(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-5 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <Sparkles className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Choose a Template</h2>
                    <p className="text-sm text-gray-500">
                      Start from a pre-built template or create a blank form
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-6 grid grid-cols-2 gap-4">
                {LIBRARY_TEMPLATES.map((lib) => (
                  <button
                    key={lib.id}
                    onClick={() => {
                      if (lib.comingSoon) return;
                      handleCreateFromLibrary(lib.id, lib.treatmentType, lib.name);
                    }}
                    disabled={creating || lib.comingSoon}
                    className={`text-left p-5 rounded-xl border-2 transition-all ${
                      lib.comingSoon
                        ? 'border-gray-100 opacity-50 cursor-not-allowed'
                        : 'border-gray-100 hover:border-indigo-300 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${lib.color} text-white shrink-0`}>
                        <lib.icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 text-sm">{lib.name}</h3>
                          {lib.comingSoon && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                              Soon
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {lib.description}
                        </p>
                        {lib.stats.steps > 0 && (
                          <div className="flex items-center gap-3 mt-2">
                            <span className="text-[10px] font-medium text-gray-400">
                              {lib.stats.steps} steps
                            </span>
                            <span className="text-[10px] font-medium text-gray-400">
                              {lib.stats.fields} fields
                            </span>
                            <div className="flex gap-1">
                              {lib.stats.languages.map((lang) => (
                                <span
                                  key={lang}
                                  className={`text-[10px] font-medium px-1 py-0.5 rounded ${lib.bgColor} ${lib.textColor}`}
                                >
                                  {lang}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setShowLibrary(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Existing templates */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-white rounded-xl p-5 border border-gray-100">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-100 rounded w-48" />
                    <div className="h-3 bg-gray-100 rounded w-32 mt-2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-indigo-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No forms yet</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
              Create your first intake questionnaire to start collecting patient information.
            </p>
            <button
              onClick={() => setShowLibrary(true)}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create First Form
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => router.push(`/admin/intake-builder/${t.id}`)}
                className="w-full text-left bg-white rounded-xl border border-gray-100 p-5 hover:border-indigo-200 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center text-white shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 truncate">{t.name}</h3>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                            t.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {t.isActive ? 'Published' : 'Draft'}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium">
                          v{t.version}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {t.treatmentType}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {t._count?.submissions ?? 0} submissions
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(t.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
