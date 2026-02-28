'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Clock, Pencil, Trash2, Loader2, ArrowLeft, Globe } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface BusinessHours {
  id: number;
  name: string;
  timezone: string;
  schedule: Array<{ dayOfWeek: number; startTime: string; endTime: string; isOpen: boolean }>;
  holidays: Array<{ date: string; name: string }>;
  isDefault: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'Pacific/Honolulu', 'UTC'];

const DEFAULT_SCHEDULE = DAYS.map((_, i) => ({
  dayOfWeek: i,
  startTime: '09:00',
  endTime: '17:00',
  isOpen: i >= 1 && i <= 5,
}));

export default function BusinessHoursPage() {
  const [items, setItems] = useState<BusinessHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', timezone: 'America/New_York', schedule: DEFAULT_SCHEDULE, holidays: [] as Array<{ date: string; name: string }>, isDefault: false });
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/tickets/business-hours');
      if (res.ok) { const d = await res.json(); setItems(d.businessHours || []); }
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError(null);
    try {
      const url = editingId ? `/api/tickets/business-hours/${editingId}` : '/api/tickets/business-hours';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, { method, body: JSON.stringify(form) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setShowForm(false); setEditingId(null); await fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleEdit = (bh: BusinessHours) => {
    setEditingId(bh.id);
    setForm({ name: bh.name, timezone: bh.timezone, schedule: bh.schedule.length ? bh.schedule : DEFAULT_SCHEDULE, holidays: bh.holidays || [], isDefault: bh.isDefault });
    setShowForm(true); setError(null);
  };

  const handleDelete = async (id: number) => {
    await apiFetch(`/api/tickets/business-hours/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  const updateScheduleDay = (dayOfWeek: number, field: string, value: unknown) => {
    setForm({ ...form, schedule: form.schedule.map((d) => d.dayOfWeek === dayOfWeek ? { ...d, [field]: value } : d) });
  };

  const addHoliday = () => {
    if (!newHolidayDate || !newHolidayName.trim()) return;
    setForm({ ...form, holidays: [...form.holidays, { date: newHolidayDate, name: newHolidayName.trim() }] });
    setNewHolidayDate(''); setNewHolidayName('');
  };

  const removeHoliday = (index: number) => {
    setForm({ ...form, holidays: form.holidays.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => { window.location.href = '/tickets'; }} className="rounded-lg p-1 hover:bg-gray-100"><ArrowLeft className="h-5 w-5 text-gray-500" /></button>
          <div><h1 className="text-2xl font-bold text-gray-900">Business Hours</h1><p className="text-sm text-gray-500">Define when your team is available for SLA tracking</p></div>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', timezone: 'America/New_York', schedule: DEFAULT_SCHEDULE, holidays: [], isDefault: false }); setError(null); }} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"><Plus className="h-4 w-4" />New Schedule</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-5">
          <h2 className="text-lg font-semibold">{editingId ? 'Edit Schedule' : 'New Business Hours'}</h2>
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div className="grid gap-4 md:grid-cols-3">
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Name *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. Standard Business Hours" /></div>
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Timezone</label><select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">{TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}</select></div>
            <div className="flex items-end pb-1"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="rounded border-gray-300" />Default schedule</label></div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Weekly Schedule</label>
            <div className="space-y-2">
              {form.schedule.map((day) => (
                <div key={day.dayOfWeek} className="flex items-center gap-3">
                  <label className="flex w-28 items-center gap-2">
                    <input type="checkbox" checked={day.isOpen} onChange={(e) => updateScheduleDay(day.dayOfWeek, 'isOpen', e.target.checked)} className="rounded border-gray-300" />
                    <span className={`text-sm ${day.isOpen ? 'font-medium text-gray-900' : 'text-gray-400'}`}>{DAYS[day.dayOfWeek]}</span>
                  </label>
                  {day.isOpen ? (
                    <>
                      <input type="time" value={day.startTime} onChange={(e) => updateScheduleDay(day.dayOfWeek, 'startTime', e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                      <span className="text-gray-400">to</span>
                      <input type="time" value={day.endTime} onChange={(e) => updateScheduleDay(day.dayOfWeek, 'endTime', e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                    </>
                  ) : (
                    <span className="text-sm text-gray-400">Closed</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Holidays</label>
            {form.holidays.length > 0 && (
              <div className="mb-2 space-y-1">
                {form.holidays.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">{h.date}</span>
                    <span className="text-gray-900">{h.name}</span>
                    <button type="button" onClick={() => removeHoliday(i)} className="text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input type="date" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
              <input type="text" value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} placeholder="Holiday name" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
              <button type="button" onClick={addHoliday} className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200">Add</button>
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
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-12"><Clock className="h-12 w-12 text-gray-300" /><p className="mt-2 text-sm text-gray-500">No business hours configured</p></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((bh) => (
            <div key={bh.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{bh.name}</h3>
                    {bh.isDefault && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">Default</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-gray-500"><Globe className="h-3 w-3" />{bh.timezone.replace(/_/g, ' ')}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleEdit(bh)} className="rounded p-1 text-gray-400 hover:text-gray-600"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(bh.id)} className="rounded p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-3 space-y-1">
                {(bh.schedule || []).map((day) => (
                  <div key={day.dayOfWeek} className="flex items-center gap-2 text-xs">
                    <span className={`w-16 ${day.isOpen ? 'font-medium text-gray-700' : 'text-gray-400'}`}>{DAYS[day.dayOfWeek].slice(0, 3)}</span>
                    {day.isOpen ? <span className="text-gray-600">{day.startTime} - {day.endTime}</span> : <span className="text-gray-400">Closed</span>}
                  </div>
                ))}
              </div>
              {bh.holidays?.length > 0 && <div className="mt-2 text-xs text-gray-500">{bh.holidays.length} holidays configured</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
