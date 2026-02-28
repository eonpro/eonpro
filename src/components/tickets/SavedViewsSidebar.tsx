'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bookmark, Plus, Trash2, Eye, Filter, Users, AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface SavedView {
  id: number;
  name: string;
  description?: string | null;
  icon?: string | null;
  filters: Record<string, unknown>;
  isPersonal: boolean;
  isDefault: boolean;
}

interface SavedViewsSidebarProps {
  currentFilters: Record<string, unknown>;
  onApplyView: (filters: Record<string, unknown>) => void;
}

const DEFAULT_VIEWS = [
  { id: 'my-tickets', name: 'My Tickets', icon: 'user', filters: { myTickets: true } },
  { id: 'unassigned', name: 'Unassigned', icon: 'users', filters: { isUnassigned: true } },
  { id: 'high-priority', name: 'High Priority', icon: 'alert', filters: { priority: ['P0_CRITICAL', 'P1_URGENT', 'P2_HIGH'] } },
  { id: 'sla-breach', name: 'SLA Breaching', icon: 'clock', filters: { hasSlaBreach: true } },
];

const ICON_MAP: Record<string, typeof Bookmark> = {
  user: Eye,
  users: Users,
  alert: AlertTriangle,
  clock: Clock,
};

export default function SavedViewsSidebar({ currentFilters, onApplyView }: SavedViewsSidebarProps) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchViews = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/tickets/views');
      if (res.ok) {
        const data = await res.json();
        setViews(data.views || []);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  const handleSaveView = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/tickets/views', {
        method: 'POST',
        body: JSON.stringify({
          name: saveName.trim(),
          filters: currentFilters,
          isPersonal: true,
        }),
      });
      if (res.ok) {
        setSaveName('');
        setShowSaveForm(false);
        await fetchViews();
      }
    } catch {
      // Silently handle
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteView = async (id: number) => {
    try {
      await apiFetch(`/api/tickets/views/${id}`, { method: 'DELETE' });
      await fetchViews();
    } catch {
      // Silently handle
    }
  };

  return (
    <div className="w-56 flex-shrink-0 space-y-4">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Quick Views</h3>
        <div className="space-y-0.5">
          {DEFAULT_VIEWS.map((view) => {
            const Icon = ICON_MAP[view.icon] || Filter;
            return (
              <button
                key={view.id}
                onClick={() => onApplyView(view.filters)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <Icon className="h-4 w-4 text-gray-400" />
                {view.name}
              </button>
            );
          })}
        </div>
      </div>

      {(views.length > 0 || !loading) && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Saved Views</h3>
          {loading ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            </div>
          ) : views.length === 0 ? (
            <p className="px-3 text-xs text-gray-400">No saved views yet</p>
          ) : (
            <div className="space-y-0.5">
              {views.map((view) => (
                <div key={view.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => onApplyView(view.filters as Record<string, unknown>)}
                    className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <Bookmark className="h-4 w-4 text-gray-400" />
                    <span className="truncate">{view.name}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteView(view.id)}
                    className="rounded p-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
                    title="Delete view"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Save Current View */}
      {showSaveForm ? (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="View name..."
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            autoFocus
          />
          <div className="flex gap-1">
            <button
              onClick={handleSaveView}
              disabled={saving || !saveName.trim()}
              className="flex-1 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setShowSaveForm(false); setSaveName(''); }}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowSaveForm(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700"
        >
          <Plus className="h-4 w-4" />
          Save Current View
        </button>
      )}
    </div>
  );
}
