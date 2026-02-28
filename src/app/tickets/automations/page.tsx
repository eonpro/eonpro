'use client';

/**
 * Automation Rules Management Page
 * ================================
 *
 * Visual rule builder for ticket automations.
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, BookOpen, Trash2, Pencil, Loader2, ArrowLeft, ToggleLeft, ToggleRight, Play } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface AutomationRule {
  id: number;
  name: string;
  description?: string | null;
  trigger: string;
  conditions: Array<{ field: string; operator: string; value: unknown }>;
  actions: Array<{ action: string; params: Record<string, unknown> }>;
  priority: number;
  stopOnMatch: boolean;
  isActive: boolean;
  executionCount: number;
  lastExecutedAt?: string | null;
  lastError?: string | null;
  createdBy: { id: number; firstName: string; lastName: string };
}

const TRIGGERS = [
  { value: 'ON_CREATE', label: 'When ticket is created' },
  { value: 'ON_UPDATE', label: 'When ticket is updated' },
  { value: 'ON_STATUS_CHANGE', label: 'When status changes' },
  { value: 'ON_ASSIGNMENT', label: 'When ticket is assigned' },
  { value: 'ON_PRIORITY_CHANGE', label: 'When priority changes' },
  { value: 'ON_COMMENT_ADDED', label: 'When comment is added' },
  { value: 'ON_SLA_WARNING', label: 'On SLA breach warning' },
  { value: 'ON_SLA_BREACH', label: 'On SLA breach' },
  { value: 'ON_REOPEN', label: 'When ticket is reopened' },
];

const CONDITION_FIELDS = [
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'category', label: 'Category' },
  { value: 'source', label: 'Source' },
  { value: 'assignedToId', label: 'Assignee' },
  { value: 'teamId', label: 'Team' },
  { value: 'title', label: 'Title' },
];

const OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'in', label: 'is one of' },
  { value: 'is_set', label: 'is set' },
  { value: 'is_not_set', label: 'is not set' },
];

const ACTION_TYPES = [
  { value: 'SET_PRIORITY', label: 'Set Priority' },
  { value: 'SET_STATUS', label: 'Set Status' },
  { value: 'SET_CATEGORY', label: 'Set Category' },
  { value: 'ASSIGN_TO_USER', label: 'Assign to User' },
  { value: 'ASSIGN_TO_TEAM', label: 'Assign to Team' },
  { value: 'ADD_TAG', label: 'Add Tag' },
  { value: 'REMOVE_TAG', label: 'Remove Tag' },
  { value: 'ADD_INTERNAL_NOTE', label: 'Add Internal Note' },
];

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    trigger: 'ON_CREATE',
    conditions: [{ field: 'priority', operator: 'equals', value: '' }] as Array<{ field: string; operator: string; value: string }>,
    actions: [{ action: 'SET_PRIORITY', params: {} as Record<string, string> }] as Array<{ action: string; params: Record<string, string> }>,
    priority: 100,
    stopOnMatch: false,
  });

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/tickets/automations');
      if (res.ok) {
        const d = await res.json();
        setRules(d.automations || []);
      }
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const url = editingId ? `/api/tickets/automations/${editingId}` : '/api/tickets/automations';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, { method, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setShowForm(false);
      setEditingId(null);
      resetForm();
      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally { setSaving(false); }
  };

  const resetForm = () => {
    setForm({
      name: '', description: '', trigger: 'ON_CREATE',
      conditions: [{ field: 'priority', operator: 'equals', value: '' }],
      actions: [{ action: 'SET_PRIORITY', params: {} }],
      priority: 100, stopOnMatch: false,
    });
  };

  const handleToggle = async (id: number, isActive: boolean) => {
    await apiFetch(`/api/tickets/automations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !isActive }),
    });
    await fetchRules();
  };

  const handleDelete = async (id: number) => {
    await apiFetch(`/api/tickets/automations/${id}`, { method: 'DELETE' });
    await fetchRules();
  };

  const addCondition = () => {
    setForm({ ...form, conditions: [...form.conditions, { field: 'status', operator: 'equals', value: '' }] });
  };

  const removeCondition = (i: number) => {
    setForm({ ...form, conditions: form.conditions.filter((_, idx) => idx !== i) });
  };

  const addAction = () => {
    setForm({ ...form, actions: [...form.actions, { action: 'ADD_TAG', params: {} }] });
  };

  const removeAction = (i: number) => {
    setForm({ ...form, actions: form.actions.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => { window.location.href = '/tickets'; }} className="rounded-lg p-1 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Automations</h1>
            <p className="text-sm text-gray-500">Rules that run automatically on ticket events</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); resetForm(); setError(null); }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Rule
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Edit Rule' : 'New Automation Rule'}</h2>
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Rule Name *</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Trigger *</label>
              <select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="What does this rule do?" />
          </div>

          {/* Conditions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Conditions (all must match)</label>
              <button type="button" onClick={addCondition} className="text-sm text-blue-600 hover:text-blue-700">+ Add Condition</button>
            </div>
            <div className="space-y-2">
              {form.conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={c.field} onChange={(e) => { const conds = [...form.conditions]; conds[i] = { ...conds[i], field: e.target.value }; setForm({ ...form, conditions: conds }); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    {CONDITION_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select value={c.operator} onChange={(e) => { const conds = [...form.conditions]; conds[i] = { ...conds[i], operator: e.target.value }; setForm({ ...form, conditions: conds }); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {!['is_set', 'is_not_set'].includes(c.operator) && (
                    <input type="text" value={c.value} onChange={(e) => { const conds = [...form.conditions]; conds[i] = { ...conds[i], value: e.target.value }; setForm({ ...form, conditions: conds }); }} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Value" />
                  )}
                  {form.conditions.length > 1 && (
                    <button type="button" onClick={() => removeCondition(i)} className="rounded p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Actions</label>
              <button type="button" onClick={addAction} className="text-sm text-blue-600 hover:text-blue-700">+ Add Action</button>
            </div>
            <div className="space-y-2">
              {form.actions.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={a.action} onChange={(e) => { const acts = [...form.actions]; acts[i] = { action: e.target.value, params: {} }; setForm({ ...form, actions: acts }); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    {ACTION_TYPES.map((at) => <option key={at.value} value={at.value}>{at.label}</option>)}
                  </select>
                  <input
                    type="text"
                    value={Object.values(a.params)[0] || ''}
                    onChange={(e) => {
                      const acts = [...form.actions];
                      const paramKey = a.action.includes('TAG') ? 'tag' : a.action.includes('NOTE') || a.action.includes('COMMENT') ? 'content' : a.action.toLowerCase().replace('set_', '').replace('assign_to_', '') + (a.action.includes('USER') ? 'Id' : a.action.includes('TEAM') ? 'Id' : '');
                      acts[i] = { ...acts[i], params: { [paramKey]: e.target.value } };
                      setForm({ ...form, actions: acts });
                    }}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Value"
                  />
                  {form.actions.length > 1 && (
                    <button type="button" onClick={() => removeAction(i)} className="rounded p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.stopOnMatch} onChange={(e) => setForm({ ...form, stopOnMatch: e.target.checked })} className="rounded border-gray-300" />
              Stop processing other rules after this one matches
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : editingId ? 'Update Rule' : 'Create Rule'}</button>
          </div>
        </form>
      )}

      {/* Rules List */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <BookOpen className="h-12 w-12 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">No automation rules yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{rule.name}</h3>
                    <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
                      {TRIGGERS.find((t) => t.value === rule.trigger)?.label || rule.trigger}
                    </span>
                    {rule.executionCount > 0 && (
                      <span className="flex items-center gap-1 rounded bg-green-50 px-2 py-0.5 text-xs text-green-600">
                        <Play className="h-3 w-3" />
                        {rule.executionCount}x
                      </span>
                    )}
                  </div>
                  {rule.description && <p className="mt-0.5 text-sm text-gray-500">{rule.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {rule.conditions.map((c, i) => (
                      <span key={i} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {c.field} {c.operator} {String(c.value || '')}
                      </span>
                    ))}
                    <span className="text-xs text-gray-400">→</span>
                    {rule.actions.map((a, i) => (
                      <span key={i} className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                        {a.action.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                  {rule.lastError && (
                    <p className="mt-1 text-xs text-red-500">Last error: {rule.lastError}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleToggle(rule.id, rule.isActive)} title={rule.isActive ? 'Disable' : 'Enable'} className="rounded p-1 text-gray-400 hover:text-gray-600">
                    {rule.isActive ? <ToggleRight className="h-5 w-5 text-green-500" /> : <ToggleLeft className="h-5 w-5" />}
                  </button>
                  <button onClick={() => handleDelete(rule.id)} className="rounded p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
