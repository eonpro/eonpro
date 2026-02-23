'use client';

/**
 * Sales Rep Intake Links
 *
 * Create and manage shareable intake URLs. Stats: clicks, intakes, conversions.
 */

import { useEffect, useState, useCallback } from 'react';
import { Copy, Check, Plus, Link2, MousePointer, FileText, ShoppingBag } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

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

export default function SalesRepLinksPage() {
  const [data, setData] = useState<LinksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  const copyLink = async (code: string, id: string) => {
    const base = data?.baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    const url = `${base}/intake?rep=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      setCreateError('Enter a name for the link');
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const res = await apiFetch('/api/sales-rep/ref-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setNewName('');
        await fetchLinks();
      } else {
        const err = await res.json();
        setCreateError(err.error || 'Failed to create link');
      }
    } catch {
      setCreateError('Something went wrong');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
      </div>
    );
  }

  const refCodes = data?.refCodes ?? [];
  const baseUrl = data?.baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">My Intake Links</h1>
        {data?.canCreateMore && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            New link
          </button>
        )}
      </div>

      <p className="mb-6 text-sm text-gray-500">
        Share these links with prospects. When they complete intake, they’ll be assigned to you and counted in your stats.
      </p>

      {creating && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-medium text-gray-900">Create new link</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Link name (e.g. Instagram)</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Instagram"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewName(''); setCreateError(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
          {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
        </div>
      )}

      {refCodes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-12 text-center">
          <Link2 className="mx-auto mb-3 h-12 w-12 text-gray-400" />
          <p className="text-gray-600">No intake links yet.</p>
          <p className="mt-1 text-sm text-gray-500">Create a link to share with prospects.</p>
          {data?.canCreateMore && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Plus className="h-4 w-4" />
              Create first link
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-4">
          {refCodes.map((code) => {
            const url = `${baseUrl}/intake?rep=${encodeURIComponent(code.code)}`;
            const isCopied = copiedId === code.id;
            return (
              <li
                key={code.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
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
                    onClick={() => copyLink(code.code, code.id)}
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
