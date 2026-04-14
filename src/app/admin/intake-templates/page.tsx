'use client';

import React, { useEffect, useState } from 'react';

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

export default function IntakeTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('weight-loss');
  const [fromLibrary, setFromLibrary] = useState('weight-loss');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/intake-templates')
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => {
        if (cancelled) return;
        const raw = Array.isArray(d?.templates) ? d.templates : [];
        const normalized: TemplateRow[] = raw.map((t: Record<string, unknown>) => ({
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
        }));
        setTemplates(normalized);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async () => {
    const res = await fetch('/api/admin/intake-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newName || `${newType} Intake`,
        treatmentType: newType,
        fromLibrary: fromLibrary || undefined,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const t = data?.template;
      if (t) {
        const row: TemplateRow = {
          id: Number(t.id),
          name: String(t.name ?? ''),
          description: t.description != null ? String(t.description) : null,
          treatmentType: String(t.treatmentType ?? ''),
          isActive: Boolean(t.isActive),
          version: Number(t.version ?? 1),
          createdAt: t.createdAt != null ? String(t.createdAt) : '',
          _count: {
            submissions: Number(t._count?.submissions ?? 0),
            drafts: Number(t._count?.drafts ?? 0),
          },
        };
        setTemplates((prev) => [row, ...prev]);
        window.location.href = `/admin/intake-builder/${row.id}`;
        return;
      }
      setShowCreate(false);
      setNewName('');
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-gray-100" />
          <div className="h-40 rounded-xl bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Intake Form Templates</h1>
          <p className="mt-1 text-sm text-gray-500">Manage intake forms for your clinic</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          + New Template
        </button>
      </div>

      {/* Create modal overlay */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-template-title"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-lg space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="create-template-title" className="text-lg font-semibold">
              Create Intake Template
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm text-gray-600">Template Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Weight Loss Intake"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">Treatment Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="weight-loss">Weight Loss</option>
                  <option value="hormone-therapy">Hormone Therapy</option>
                  <option value="general">General Wellness</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">Start From</label>
              <select
                value={fromLibrary}
                onChange={(e) => setFromLibrary(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="weight-loss">Weight Loss Template (Library)</option>
                <option value="">Blank Template</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCreate}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Templates list */}
      <div className="space-y-3">
        {templates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center">
            <p className="text-gray-500">No intake templates yet</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              Create your first template
            </button>
          </div>
        ) : (
          templates.map((t) => (
            <a
              key={t.id}
              href={`/admin/intake-builder/${t.id}`}
              className="block cursor-pointer rounded-xl border border-gray-100 bg-white p-5 transition-colors hover:border-gray-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{t.name}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-xs text-gray-400">v{t.version}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {t.treatmentType} &middot; {t._count?.submissions ?? 0} submissions &middot;{' '}
                    {t._count?.drafts ?? 0} active drafts
                  </p>
                </div>
                <svg
                  className="h-5 w-5 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
