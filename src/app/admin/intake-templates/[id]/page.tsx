'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface TemplateDetail {
  id: number;
  name: string;
  description: string | null;
  treatmentType: string;
  isActive: boolean;
  version: number;
  metadata: Record<string, unknown> | null;
  questions: { id: number; questionText: string; questionType: string; orderIndex: number; section?: string }[];
}

export default function IntakeTemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.id as string;

  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [configJson, setConfigJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'config' | 'preview'>('overview');
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');

  useEffect(() => {
    fetch(`/api/admin/intake-templates/${templateId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.template) return;
        setTemplate(d.template);
        setEditName(d.template.name);
        setEditDescription(d.template.description ?? '');
        const formConfig = (d.template.metadata as Record<string, unknown>)?.formConfig;
        if (formConfig) {
          setConfigJson(JSON.stringify(formConfig, null, 2));
        }
      })
      .finally(() => setLoading(false));
  }, [templateId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setJsonError('');

    let formConfig: Record<string, unknown> | undefined;
    if (configJson.trim()) {
      try {
        formConfig = JSON.parse(configJson);
      } catch {
        setJsonError('Invalid JSON');
        setSaving(false);
        return;
      }
    }

    const res = await fetch(`/api/admin/intake-templates/${templateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName,
        description: editDescription || undefined,
        formConfig,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setTemplate(data.template);
    }

    setSaving(false);
  }, [templateId, editName, editDescription, configJson]);

  const handleToggleActive = useCallback(async () => {
    if (!template) return;
    const res = await fetch(`/api/admin/intake-templates/${templateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !template.isActive }),
    });
    if (res.ok) {
      setTemplate((t) => t ? { ...t, isActive: !t.isActive } : t);
    }
  }, [template, templateId]);

  if (loading) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-100 rounded w-64" />
          <div className="h-96 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <p className="text-gray-500">Template not found</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push('/admin/intake-templates')}
            className="text-sm text-gray-500 hover:text-gray-700 mb-1"
          >
            &larr; Back to templates
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{template.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            v{template.version} &middot; {template.treatmentType} &middot;{' '}
            {template.isActive ? 'Active' : 'Inactive'}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleToggleActive}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              template.isActive
                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                : 'bg-green-50 text-green-600 hover:bg-green-100'
            }`}
          >
            {template.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['overview', 'config', 'preview'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Template Name
            </label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Description
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="rounded-xl bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Statistics
            </h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {template.questions.length}
                </p>
                <p className="text-xs text-gray-500">Questions</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {template.version}
                </p>
                <p className="text-xs text-gray-500">Version</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {template.isActive ? 'Yes' : 'No'}
                </p>
                <p className="text-xs text-gray-500">Active</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Config tab — JSON editor */}
      {activeTab === 'config' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              Form Configuration (JSON)
            </label>
            {jsonError && (
              <span className="text-sm text-red-500">{jsonError}</span>
            )}
          </div>
          <textarea
            value={configJson}
            onChange={(e) => {
              setConfigJson(e.target.value);
              setJsonError('');
            }}
            rows={30}
            spellCheck={false}
            className="w-full px-4 py-3 border rounded-xl text-xs font-mono bg-gray-900 text-green-400 resize-y"
          />
          <p className="text-xs text-gray-400">
            Editing the config JSON creates a new version. Existing drafts
            continue using their started version.
          </p>
        </div>
      )}

      {/* Preview tab */}
      {activeTab === 'preview' && (
        <PreviewTab
          template={template}
          configJson={configJson}
          device={previewDevice}
          onDeviceChange={setPreviewDevice}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview Tab
// ---------------------------------------------------------------------------

function PreviewTab({
  template,
  configJson,
  device,
  onDeviceChange,
}: {
  template: TemplateDetail;
  configJson: string;
  device: 'mobile' | 'desktop';
  onDeviceChange: (d: 'mobile' | 'desktop') => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    const clinicSlug = parts.length >= 3 ? parts[0] : 'app';
    const slug = template.treatmentType || String(template.id);

    let startStep = 'start';
    if (configJson.trim()) {
      try {
        const cfg = JSON.parse(configJson);
        if (cfg.startStep) startStep = cfg.startStep;
      } catch { /* use default */ }
    }

    setPreviewUrl(`/intake/${clinicSlug}/${slug}/${startStep}`);
  }, [template, configJson]);

  const iframeWidth = device === 'mobile' ? 390 : '100%';
  const iframeHeight = device === 'mobile' ? 700 : 800;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['mobile', 'desktop'] as const).map((d) => (
              <button
                key={d}
                onClick={() => onDeviceChange(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  device === d
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {d === 'mobile' ? '📱 Mobile' : '🖥 Desktop'}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">
            {device === 'mobile' ? '390 × 700' : 'Full width'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-600 hover:underline"
            >
              Open in new tab ↗
            </a>
          )}
          <button
            onClick={() => setPreviewKey((k) => k + 1)}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Reload
          </button>
        </div>
      </div>

      {!template.isActive && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          This template is inactive. Activate it before previewing — the config
          API will return 404 for inactive templates.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-gray-100 overflow-hidden flex justify-center p-4">
        {previewUrl ? (
          <div
            className={`bg-white rounded-xl overflow-hidden shadow-lg ${
              device === 'mobile' ? 'border border-gray-300' : 'w-full'
            }`}
            style={device === 'mobile' ? { width: iframeWidth } : undefined}
          >
            <iframe
              key={previewKey}
              src={previewUrl}
              width="100%"
              height={iframeHeight}
              className="border-0"
              title="Intake form preview"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          </div>
        ) : (
          <div className="py-16 text-gray-400 text-center">
            Loading preview URL...
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Preview renders the live form. Save your changes first — the preview
        uses the last-saved configuration.
      </p>
    </div>
  );
}
