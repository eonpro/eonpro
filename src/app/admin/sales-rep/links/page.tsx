'use client';

/**
 * Intake Links Management
 *
 * Create and manage shareable intake URLs with sales rep attribution.
 * Accessible to sales reps (own links) and admins/staff (any rep).
 */

import { useEffect, useState, useCallback } from 'react';
import {
  Copy,
  Check,
  Plus,
  Link2,
  MousePointer,
  FileText,
  ShoppingBag,
  ChevronDown,
  X,
  Send,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { useAuth } from '@/lib/auth/AuthContext';

interface RefCodeItem {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  clickCount: number;
  intakeCount: number;
  conversionCount: number;
  lastClickAt: string | null;
  createdAt: string;
}

interface LinksData {
  baseUrl: string;
  refCodes: RefCodeItem[];
  canCreateMore: boolean;
  maxCodes: number;
}

interface SalesRepOption {
  id: number;
  name: string;
}

interface TemplateOption {
  id: number;
  name: string;
  treatmentType: string;
}

const ADMIN_ROLES = ['super_admin', 'admin', 'staff'];

export default function IntakeLinksPage() {
  const { user } = useAuth();
  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role) : false;
  const isSalesRep = user?.role === 'sales_rep';

  const [data, setData] = useState<LinksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clientOrigin, setClientOrigin] = useState('');
  useEffect(() => { setClientOrigin(window.location.origin); }, []);

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [flowType, setFlowType] = useState<'wizard' | 'questionnaire'>('wizard');
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [clinicSlug, setClinicSlug] = useState('');
  const [templateSlug, setTemplateSlug] = useState('weight-loss');
  const [selectedSalesRepId, setSelectedSalesRepId] = useState<number | null>(null);
  const [patientEmail, setPatientEmail] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copiedGenerated, setCopiedGenerated] = useState(false);

  // Simple ref code creation (legacy)
  const [showSimpleCreate, setShowSimpleCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [simpleCreateError, setSimpleCreateError] = useState<string | null>(null);
  const [creatingSimple, setCreatingSimple] = useState(false);

  // Dropdown data
  const [salesReps, setSalesReps] = useState<SalesRepOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);

  const fetchLinks = useCallback(async () => {
    try {
      const res = await apiFetch('/api/sales-rep/ref-codes');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        setData({ baseUrl: '', refCodes: [], canCreateMore: true, maxCodes: 10 });
      }
    } catch {
      setData({ baseUrl: '', refCodes: [], canCreateMore: true, maxCodes: 10 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch('/api/admin/users?role=SALES_REP&status=ACTIVE&limit=100')
      .then(async (res) => {
        if (res.ok) {
          const json = await res.json();
          const users = json.users || json.data || json;
          if (Array.isArray(users)) {
            setSalesReps(
              users.map((u: any) => ({ id: u.id, name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email }))
            );
          }
        }
      })
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (flowType !== 'questionnaire') return;
    apiFetch('/api/intake-forms/templates')
      .then(async (res) => {
        if (res.ok) {
          const json = await res.json();
          const items = json.templates || json.data || json;
          if (Array.isArray(items)) {
            setTemplates(items.map((t: any) => ({ id: t.id, name: t.name, treatmentType: t.treatmentType })));
          }
        }
      })
      .catch(() => {});
  }, [flowType]);

  const copyLink = async (url: string, id: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSimpleCreate = async () => {
    if (!newName.trim()) { setSimpleCreateError('Enter a name for the link'); return; }
    setSimpleCreateError(null);
    setCreatingSimple(true);
    try {
      const res = await apiFetch('/api/sales-rep/ref-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setNewName('');
        setShowSimpleCreate(false);
        await fetchLinks();
      } else {
        const err = await res.json();
        setSimpleCreateError(err.error || 'Failed to create link');
      }
    } catch {
      setSimpleCreateError('Something went wrong');
    } finally {
      setCreatingSimple(false);
    }
  };

  const handleGenerate = async () => {
    setCreateError(null);
    setGeneratedUrl(null);
    setCopiedGenerated(false);
    setGenerating(true);

    try {
      const payload: Record<string, unknown> = { flowType };

      if (flowType === 'questionnaire') {
        if (!selectedTemplate) { setCreateError('Select a form template'); setGenerating(false); return; }
        payload.templateId = selectedTemplate;
        if (patientEmail) payload.patientEmail = patientEmail;
      } else {
        if (!clinicSlug.trim()) { setCreateError('Enter a clinic slug'); setGenerating(false); return; }
        payload.clinicSlug = clinicSlug.trim();
        payload.templateSlug = templateSlug.trim() || 'weight-loss';
      }

      if (selectedSalesRepId) payload.salesRepId = selectedSalesRepId;

      const res = await apiFetch('/api/intake-links/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok && json.url) {
        setGeneratedUrl(json.url);
        if (flowType === 'wizard') await fetchLinks();
      } else {
        setCreateError(json.error || 'Failed to generate link');
      }
    } catch {
      setCreateError('Something went wrong');
    } finally {
      setGenerating(false);
    }
  };

  const copyGenerated = async () => {
    if (!generatedUrl) return;
    try { await navigator.clipboard.writeText(generatedUrl); } catch {
      const el = document.createElement('textarea');
      el.value = generatedUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiedGenerated(true);
    setTimeout(() => setCopiedGenerated(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
      </div>
    );
  }

  const refCodes = data?.refCodes ?? [];
  const baseUrl = data?.baseUrl || clientOrigin;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {isAdmin ? 'Intake Links' : 'My Intake Links'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Create shareable links that auto-attribute intakes for commission tracking.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setShowCreateForm(true); setShowSimpleCreate(false); }}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Send className="h-4 w-4" />
            Custom link
          </button>
          {(isSalesRep || isAdmin) && data?.canCreateMore && (
            <button
              type="button"
              onClick={() => { setShowSimpleCreate(true); setShowCreateForm(false); }}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
              Quick ref code
            </button>
          )}
        </div>
      </div>

      {/* ---- Custom Link Generator ---- */}
      {showCreateForm && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Generate Custom Intake Link</h2>
            <button
              type="button"
              onClick={() => { setShowCreateForm(false); setGeneratedUrl(null); setCreateError(null); }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Flow type */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Intake type</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFlowType('wizard')}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                    flowType === 'wizard'
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Multi-step wizard
                </button>
                <button
                  type="button"
                  onClick={() => setFlowType('questionnaire')}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                    flowType === 'questionnaire'
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Questionnaire form
                </button>
              </div>
            </div>

            {/* Wizard options */}
            {flowType === 'wizard' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Clinic slug</label>
                  <input
                    type="text"
                    value={clinicSlug}
                    onChange={(e) => setClinicSlug(e.target.value)}
                    placeholder="e.g. eonmeds, ot, wellmedr"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Template slug</label>
                  <select
                    value={templateSlug}
                    onChange={(e) => setTemplateSlug(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                  >
                    <option value="weight-loss">Weight Loss</option>
                    <option value="peptides">Peptides</option>
                  </select>
                </div>
              </div>
            )}

            {/* Questionnaire options */}
            {flowType === 'questionnaire' && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Form template</label>
                  <div className="relative">
                    <select
                      value={selectedTemplate ?? ''}
                      onChange={(e) => setSelectedTemplate(e.target.value ? parseInt(e.target.value, 10) : null)}
                      className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                    >
                      <option value="">Select a template...</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.treatmentType})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Patient email <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="email"
                    value={patientEmail}
                    onChange={(e) => setPatientEmail(e.target.value)}
                    placeholder="patient@example.com"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                  />
                </div>
              </div>
            )}

            {/* Sales rep picker (admin only) */}
            {isAdmin && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Attribute to sales rep <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedSalesRepId ?? ''}
                    onChange={(e) => setSelectedSalesRepId(e.target.value ? parseInt(e.target.value, 10) : null)}
                    className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                  >
                    <option value="">Self (current user)</option>
                    {salesReps.map((rep) => (
                      <option key={rep.id} value={rep.id}>
                        {rep.name} (ID: {rep.id})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            )}

            {createError && <p className="text-sm text-red-600">{createError}</p>}

            {/* Generated URL */}
            {generatedUrl && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="mb-1.5 text-sm font-medium text-green-800">Link generated</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-white px-2.5 py-1.5 text-xs font-mono text-gray-700 border border-green-200">
                    {generatedUrl}
                  </code>
                  <button
                    type="button"
                    onClick={copyGenerated}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800"
                  >
                    {copiedGenerated ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedGenerated ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate link'}
            </button>
          </div>
        </div>
      )}

      {/* ---- Simple Ref Code Creator ---- */}
      {showSimpleCreate && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium text-gray-900">Create quick ref code</h2>
            <button
              type="button"
              onClick={() => { setShowSimpleCreate(false); setNewName(''); setSimpleCreateError(null); }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-gray-500">Link name (e.g. Instagram)</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Instagram"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleSimpleCreate}
              disabled={creatingSimple}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {creatingSimple ? 'Creating...' : 'Create'}
            </button>
          </div>
          {simpleCreateError && <p className="mt-2 text-sm text-red-600">{simpleCreateError}</p>}
        </div>
      )}

      {/* ---- Existing Ref Codes ---- */}
      {refCodes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-12 text-center">
          <Link2 className="mx-auto mb-3 h-12 w-12 text-gray-400" />
          <p className="text-gray-600">No intake links yet.</p>
          <p className="mt-1 text-sm text-gray-500">Create a link to share with prospects.</p>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            Create first link
          </button>
        </div>
      ) : (
        <ul className="space-y-4">
          {refCodes.map((code) => {
            const url = `${baseUrl}/intake?rep=${encodeURIComponent(code.code)}`;
            const isCopied = copiedId === code.id;
            return (
              <li key={code.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{code.name || code.code}</span>
                      {code.isDefault && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">Default</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm text-gray-500 font-mono">{url}</p>
                    <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <MousePointer className="h-4 w-4" /> {code.clickCount} clicks
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-4 w-4" /> {code.intakeCount} intakes
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ShoppingBag className="h-4 w-4" /> {code.conversionCount} conversions
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyLink(url, code.id)}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {isCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    {isCopied ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-xs text-gray-400">
        Links created: {refCodes.length} / {data?.maxCodes ?? 10}
      </p>
    </div>
  );
}
