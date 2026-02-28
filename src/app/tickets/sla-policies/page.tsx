'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Shield, Pencil, Trash2, Loader2, ArrowLeft, Check, Clock } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface SlaPolicy {
  id: number;
  name: string;
  description?: string | null;
  priority?: string | null;
  category?: string | null;
  isDefault: boolean;
  isActive: boolean;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  respectBusinessHours: boolean;
  escalateOnBreach: boolean;
  warningThresholdPct: number;
  businessHours?: { id: number; name: string } | null;
  _count?: { ticketSlas: number };
}

const PRIORITIES = ['', 'P0_CRITICAL', 'P1_URGENT', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW', 'P5_PLANNING'];
const CATEGORIES = ['', 'PATIENT_ISSUE', 'ORDER_ISSUE', 'BILLING', 'PRESCRIPTION', 'TECHNICAL_ISSUE', 'GENERAL', 'OTHER'];

function formatTime(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function SLAPoliciesPage() {
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [businessHoursList, setBusinessHoursList] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', priority: '', category: '',
    firstResponseMinutes: '60', resolutionMinutes: '480',
    businessHoursId: '', respectBusinessHours: true,
    escalateOnBreach: true, warningThresholdPct: '80', isDefault: false,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, bhRes] = await Promise.all([
        apiFetch('/api/tickets/sla-policies'),
        apiFetch('/api/tickets/business-hours'),
      ]);
      if (pRes.ok) { const d = await pRes.json(); setPolicies(d.policies || []); }
      if (bhRes.ok) { const d = await bhRes.json(); setBusinessHoursList(d.businessHours || []); }
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError(null);
    try {
      const url = editingId ? `/api/tickets/sla-policies/${editingId}` : '/api/tickets/sla-policies';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, { method, body: JSON.stringify({
        ...form,
        firstResponseMinutes: parseInt(form.firstResponseMinutes, 10),
        resolutionMinutes: parseInt(form.resolutionMinutes, 10),
        warningThresholdPct: parseInt(form.warningThresholdPct, 10),
        businessHoursId: form.businessHoursId ? parseInt(form.businessHoursId, 10) : null,
        priority: form.priority || null,
        category: form.category || null,
      }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setShowForm(false); setEditingId(null); await fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleEdit = (p: SlaPolicy) => {
    setEditingId(p.id);
    setForm({
      name: p.name, description: p.description || '', priority: p.priority || '', category: p.category || '',
      firstResponseMinutes: String(p.firstResponseMinutes), resolutionMinutes: String(p.resolutionMinutes),
      businessHoursId: p.businessHours?.id ? String(p.businessHours.id) : '',
      respectBusinessHours: p.respectBusinessHours, escalateOnBreach: p.escalateOnBreach,
      warningThresholdPct: String(p.warningThresholdPct), isDefault: p.isDefault,
    });
    setShowForm(true); setError(null);
  };

  const handleDelete = async (id: number) => {
    await apiFetch(`/api/tickets/sla-policies/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => { window.location.href = '/tickets'; }} className="rounded-lg p-1 hover:bg-gray-100"><ArrowLeft className="h-5 w-5 text-gray-500" /></button>
          <div><h1 className="text-2xl font-bold text-gray-900">SLA Policies</h1><p className="text-sm text-gray-500">Response and resolution time targets</p></div>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', description: '', priority: '', category: '', firstResponseMinutes: '60', resolutionMinutes: '480', businessHoursId: '', respectBusinessHours: true, escalateOnBreach: true, warningThresholdPct: '80', isDefault: false }); setError(null); }} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"><Plus className="h-4 w-4" />New Policy</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold">{editingId ? 'Edit Policy' : 'New SLA Policy'}</h2>
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Name *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Description</label><input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <div><label className="mb-1 block text-sm font-medium text-gray-700">First Response (min) *</label><input type="number" value={form.firstResponseMinutes} onChange={(e) => setForm({ ...form, firstResponseMinutes: e.target.value })} required min="1" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Resolution (min) *</label><input type="number" value={form.resolutionMinutes} onChange={(e) => setForm({ ...form, resolutionMinutes: e.target.value })} required min="1" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Apply to Priority</label><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">All</option>{PRIORITIES.filter(Boolean).map((p) => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}</select></div>
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Apply to Category</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">All</option>{CATEGORIES.filter(Boolean).map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}</select></div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Business Hours</label><select value={form.businessHoursId} onChange={(e) => setForm({ ...form, businessHoursId: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">24/7</option>{businessHoursList.map((bh) => <option key={bh.id} value={bh.id}>{bh.name}</option>)}</select></div>
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Warning at (%)</label><input type="number" value={form.warningThresholdPct} onChange={(e) => setForm({ ...form, warningThresholdPct: e.target.value })} min="1" max="100" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
            <div className="flex flex-col gap-2 pt-6">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.escalateOnBreach} onChange={(e) => setForm({ ...form, escalateOnBreach: e.target.checked })} className="rounded border-gray-300" />Escalate on breach</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="rounded border-gray-300" />Default policy</label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : editingId ? 'Update' : 'Create'}</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : policies.length === 0 ? (
        <div className="flex flex-col items-center py-12"><Shield className="h-12 w-12 text-gray-300" /><p className="mt-2 text-sm text-gray-500">No SLA policies yet</p></div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Policy</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Scope</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">First Response</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Resolution</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">Escalate</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Tickets</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {policies.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{p.name}</span>
                      {p.isDefault && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">Default</span>}
                    </div>
                    {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {p.priority ? p.priority.replace(/_/g, ' ') : 'All priorities'}{p.category ? ` / ${p.category.replace(/_/g, ' ')}` : ''}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatTime(p.firstResponseMinutes)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">{formatTime(p.resolutionMinutes)}</td>
                  <td className="px-4 py-3 text-center">{p.escalateOnBreach ? <Check className="mx-auto h-4 w-4 text-green-500" /> : <span className="text-gray-300">-</span>}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{p._count?.ticketSlas || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => handleEdit(p)} className="rounded p-1 text-gray-400 hover:text-gray-600"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(p.id)} className="rounded p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
