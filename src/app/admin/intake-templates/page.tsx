'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

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
    return () => { cancelled = true; };
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
      }
      setShowCreate(false);
      setNewName('');
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-100 rounded w-64" />
          <div className="h-40 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Intake Form Templates
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage intake forms for your clinic
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
        >
          + New Template
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="rounded-xl border border-gray-200 p-6 bg-white space-y-4">
          <h2 className="text-lg font-semibold">Create Intake Template</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Template Name
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Weight Loss Intake"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Treatment Type
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="weight-loss">Weight Loss</option>
                <option value="hormone-therapy">Hormone Therapy</option>
                <option value="general">General Wellness</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Start From
            </label>
            <select
              value={fromLibrary}
              onChange={(e) => setFromLibrary(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="weight-loss">
                Weight Loss Template (Library)
              </option>
              <option value="">Blank Template</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
            >
              Create
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Templates list */}
      <div className="space-y-3">
        {templates.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-gray-200">
            <p className="text-gray-500">No intake templates yet</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Create your first template
            </button>
          </div>
        ) : (
          templates.map((t) => (
            <Link
              key={t.id}
              href={`/admin/intake-templates/${t.id}`}
              className="block rounded-xl border border-gray-100 p-5 hover:border-gray-200 transition-colors bg-white"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{t.name}</h3>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        t.isActive
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-xs text-gray-400">v{t.version}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {t.treatmentType} &middot;{' '}
                    {t._count?.submissions ?? 0} submissions &middot;{' '}
                    {t._count?.drafts ?? 0} active drafts
                  </p>
                </div>
                <svg
                  className="w-5 h-5 text-gray-300"
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
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
