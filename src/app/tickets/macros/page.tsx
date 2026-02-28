'use client';

/**
 * Macros Management Page
 * ======================
 *
 * Create and manage ticket macros for one-click responses.
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, Zap, Trash2, Pencil, Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface Macro {
  id: number;
  name: string;
  description?: string | null;
  category?: string | null;
  responseContent: string;
  setStatus?: string | null;
  setPriority?: string | null;
  setCategory?: string | null;
  addTags: string[];
  removeTags: string[];
  isPersonal: boolean;
  usageCount: number;
  lastUsedAt?: string | null;
  createdBy: { id: number; firstName: string; lastName: string };
}

const STATUSES = ['', 'OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'PENDING_INTERNAL', 'ON_HOLD', 'RESOLVED', 'CLOSED'];
const PRIORITIES = ['', 'P0_CRITICAL', 'P1_URGENT', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW', 'P5_PLANNING'];

export default function MacrosPage() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', description: '', responseContent: '', setStatus: '', setPriority: '', isPersonal: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMacros = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/tickets/macros');
      if (res.ok) {
        const data = await res.json();
        setMacros(data.macros || []);
      }
    } catch {
      // Handle silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMacros(); }, [fetchMacros]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.responseContent.trim()) {
      setError('Name and response content are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url = editingId ? `/api/tickets/macros/${editingId}` : '/api/tickets/macros';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          responseContent: form.responseContent.trim(),
          setStatus: form.setStatus || undefined,
          setPriority: form.setPriority || undefined,
          isPersonal: form.isPersonal,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to save macro');
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ name: '', description: '', responseContent: '', setStatus: '', setPriority: '', isPersonal: false });
      await fetchMacros();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (macro: Macro) => {
    setEditingId(macro.id);
    setForm({
      name: macro.name,
      description: macro.description || '',
      responseContent: macro.responseContent,
      setStatus: macro.setStatus || '',
      setPriority: macro.setPriority || '',
      isPersonal: macro.isPersonal,
    });
    setShowForm(true);
    setError(null);
  };

  const handleDelete = async (id: number) => {
    await apiFetch(`/api/tickets/macros/${id}`, { method: 'DELETE' });
    await fetchMacros();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => { window.location.href = '/tickets'; }} className="rounded-lg p-1 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Macros</h1>
            <p className="text-sm text-gray-500">One-click responses and actions for tickets</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', description: '', responseContent: '', setStatus: '', setPriority: '', isPersonal: false }); setError(null); }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Macro
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Edit Macro' : 'New Macro'}</h2>
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Shipping Delay Response" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Optional description" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Response Content *</label>
            <textarea value={form.responseContent} onChange={(e) => setForm({ ...form, responseContent: e.target.value })} required rows={4} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="This message will be added as a comment when the macro is applied..." />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Set Status</label>
              <select value={form.setStatus} onChange={(e) => setForm({ ...form, setStatus: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">No change</option>
                {STATUSES.filter(Boolean).map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Set Priority</label>
              <select value={form.setPriority} onChange={(e) => setForm({ ...form, setPriority: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">No change</option>
                {PRIORITIES.filter(Boolean).map((p) => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2">
                <input type="checkbox" checked={form.isPersonal} onChange={(e) => setForm({ ...form, isPersonal: e.target.checked })} className="rounded border-gray-300" />
                <span className="text-sm text-gray-700">Personal (only visible to me)</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : editingId ? 'Update Macro' : 'Create Macro'}</button>
          </div>
        </form>
      )}

      {/* Macros List */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : macros.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Zap className="h-12 w-12 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">No macros yet. Create your first one-click response.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {macros.map((macro) => (
            <div key={macro.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">{macro.name}</h3>
                  {macro.description && <p className="mt-0.5 text-sm text-gray-500">{macro.description}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleEdit(macro)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(macro.id)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-3 rounded bg-gray-50 p-2 text-xs text-gray-600 line-clamp-3">{macro.responseContent}</div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {macro.setStatus && <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-600">{macro.setStatus.replace(/_/g, ' ')}</span>}
                {macro.setPriority && <span className="rounded bg-orange-50 px-1.5 py-0.5 text-xs text-orange-600">{macro.setPriority.replace(/_/g, ' ')}</span>}
                {macro.isPersonal && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">Personal</span>}
                <span className="ml-auto text-xs text-gray-400">Used {macro.usageCount}x</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
