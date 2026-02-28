'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Users, Trash2, Pencil, Loader2, ArrowLeft, UserPlus, X, Crown } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface TeamMember { id: number; userId: number; isLead: boolean; capacity: number; user: { id: number; firstName: string; lastName: string; role: string }; }
interface Team { id: number; name: string; description?: string | null; color?: string | null; autoAssignEnabled: boolean; roundRobinEnabled: boolean; maxTicketsPerMember?: number | null; defaultSlaPolicy?: { id: number; name: string } | null; members: TeamMember[]; _count?: { tickets: number; members: number }; }
interface AvailableUser { userId: number; firstName: string; lastName: string; role: string; openTicketCount: number; }

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<AvailableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', color: '#3b82f6', autoAssignEnabled: false, roundRobinEnabled: false, maxTicketsPerMember: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, uRes] = await Promise.all([
        apiFetch('/api/tickets/teams'),
        apiFetch('/api/users/workload'),
      ]);
      if (tRes.ok) { const d = await tRes.json(); setTeams(d.teams || []); }
      if (uRes.ok) { const d = await uRes.json(); setUsers(d.workload || []); }
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError(null);
    try {
      const url = editingId ? `/api/tickets/teams/${editingId}` : '/api/tickets/teams';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, { method, body: JSON.stringify({ ...form, maxTicketsPerMember: form.maxTicketsPerMember ? parseInt(form.maxTicketsPerMember, 10) : null }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setShowForm(false); setEditingId(null); await fetchData();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
    finally { setSaving(false); }
  };

  const handleAddMember = async (teamId: number, userId: number) => {
    await apiFetch(`/api/tickets/teams/${teamId}/members`, { method: 'POST', body: JSON.stringify({ userId }) });
    await fetchData();
  };

  const handleRemoveMember = async (teamId: number, userId: number) => {
    await apiFetch(`/api/tickets/teams/${teamId}/members?userId=${userId}`, { method: 'DELETE' });
    await fetchData();
  };

  const handleToggleLead = async (teamId: number, userId: number, isLead: boolean) => {
    await apiFetch(`/api/tickets/teams/${teamId}/members`, { method: 'POST', body: JSON.stringify({ userId, isLead: !isLead }) });
    await fetchData();
  };

  const handleDelete = async (id: number) => {
    await apiFetch(`/api/tickets/teams/${id}`, { method: 'DELETE' });
    await fetchData();
  };

  const getMemberIds = (team: Team) => new Set(team.members.map((m) => m.userId));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => { window.location.href = '/tickets'; }} className="rounded-lg p-1 hover:bg-gray-100"><ArrowLeft className="h-5 w-5 text-gray-500" /></button>
          <div><h1 className="text-2xl font-bold text-gray-900">Teams</h1><p className="text-sm text-gray-500">Organize agents into teams for ticket routing</p></div>
        </div>
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: '', description: '', color: '#3b82f6', autoAssignEnabled: false, roundRobinEnabled: false, maxTicketsPerMember: '' }); setError(null); }} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"><Plus className="h-4 w-4" />New Team</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold">{editingId ? 'Edit Team' : 'New Team'}</h2>
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Name *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Description</label><input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Color</label>
              <div className="flex gap-2">{COLORS.map((c) => (<button key={c} type="button" onClick={() => setForm({ ...form, color: c })} className={`h-8 w-8 rounded-full border-2 ${form.color === c ? 'border-gray-900' : 'border-transparent'}`} style={{ backgroundColor: c }} />))}</div>
            </div>
            <div><label className="mb-1 block text-sm font-medium text-gray-700">Max Tickets / Member</label><input type="number" value={form.maxTicketsPerMember} onChange={(e) => setForm({ ...form, maxTicketsPerMember: e.target.value })} placeholder="Unlimited" min="1" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
            <div className="flex flex-col gap-2 pt-6">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.autoAssignEnabled} onChange={(e) => setForm({ ...form, autoAssignEnabled: e.target.checked })} className="rounded border-gray-300" />Auto-assign</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.roundRobinEnabled} onChange={(e) => setForm({ ...form, roundRobinEnabled: e.target.checked })} className="rounded border-gray-300" />Round-robin</label>
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
      ) : teams.length === 0 ? (
        <div className="flex flex-col items-center py-12"><Users className="h-12 w-12 text-gray-300" /><p className="mt-2 text-sm text-gray-500">No teams yet</p></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            const isExpanded = expandedTeam === team.id;
            const memberIds = getMemberIds(team);
            return (
              <div key={team.id} className="rounded-lg border border-gray-200 bg-white">
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 rounded-full" style={{ backgroundColor: team.color || '#9ca3af' }} />
                      <h3 className="font-medium text-gray-900">{team.name}</h3>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditingId(team.id); setForm({ name: team.name, description: team.description || '', color: team.color || '#3b82f6', autoAssignEnabled: team.autoAssignEnabled, roundRobinEnabled: team.roundRobinEnabled, maxTicketsPerMember: team.maxTicketsPerMember ? String(team.maxTicketsPerMember) : '' }); setShowForm(true); setError(null); }} className="rounded p-1 text-gray-400 hover:text-gray-600"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDelete(team.id)} className="rounded p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  {team.description && <p className="mt-1 text-sm text-gray-500">{team.description}</p>}
                  <div className="mt-3 flex gap-3 text-xs text-gray-500">
                    <span>{team.members.length} members</span>
                    <span>{team._count?.tickets || 0} tickets</span>
                    {team.autoAssignEnabled && <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">Auto-assign</span>}
                  </div>
                  <div className="mt-3 flex -space-x-2">
                    {team.members.slice(0, 6).map((m) => (
                      <div key={m.id} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-xs font-medium text-gray-600" title={`${m.user.firstName} ${m.user.lastName}${m.isLead ? ' (Lead)' : ''}`}>
                        {m.user.firstName[0]}{m.user.lastName[0]}
                      </div>
                    ))}
                    {team.members.length > 6 && <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-xs text-gray-500">+{team.members.length - 6}</div>}
                  </div>
                </div>
                <div className="border-t border-gray-100 px-5 py-3">
                  <button onClick={() => setExpandedTeam(isExpanded ? null : team.id)} className="text-sm font-medium text-blue-600 hover:text-blue-700">
                    {isExpanded ? 'Hide Members' : 'Manage Members'}
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t border-gray-100 p-5 space-y-3">
                    {team.members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">{m.user.firstName[0]}{m.user.lastName[0]}</span>
                          <div>
                            <span className="text-sm font-medium text-gray-900">{m.user.firstName} {m.user.lastName}</span>
                            {m.isLead && <Crown className="ml-1 inline h-3.5 w-3.5 text-yellow-500" />}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => handleToggleLead(team.id, m.userId, m.isLead)} className={`rounded px-2 py-0.5 text-xs ${m.isLead ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600 hover:bg-yellow-50'}`}>{m.isLead ? 'Lead' : 'Set Lead'}</button>
                          <button onClick={() => handleRemoveMember(team.id, m.userId)} className="rounded p-1 text-gray-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                    <div className="border-t border-gray-100 pt-3">
                      <p className="mb-2 text-xs font-medium text-gray-500">Add Member</p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {users.filter((u) => !memberIds.has(u.userId)).map((u) => (
                          <button key={u.userId} onClick={() => handleAddMember(team.id, u.userId)} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-gray-50">
                            <span>{u.firstName} {u.lastName}</span>
                            <UserPlus className="h-3.5 w-3.5 text-gray-400" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
