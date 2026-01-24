'use client';

import { useEffect, useState } from 'react';
import {
  Link as LinkIcon,
  Copy,
  Check,
  Plus,
  ExternalLink,
  QrCode,
  Trash2,
  Edit,
} from 'lucide-react';

interface RefCode {
  id: number;
  refCode: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  clicks?: number;
  conversions?: number;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function RefCodesPage() {
  const [refCodes, setRefCodes] = useState<RefCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState<string | null>(null);
  const [newCode, setNewCode] = useState({ refCode: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRefCodes();
  }, []);

  const fetchRefCodes = async () => {
    const token = localStorage.getItem('auth-token') || localStorage.getItem('affiliate-token');
    
    try {
      const response = await fetch('/api/affiliate/ref-codes', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setRefCodes(data.refCodes || []);
      }
    } catch (error) {
      console.error('Failed to fetch ref codes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async (code: string) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}?ref=${code}`;
    
    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (e) {
      console.error('Failed to copy');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    const token = localStorage.getItem('auth-token') || localStorage.getItem('affiliate-token');

    try {
      const response = await fetch('/api/affiliate/ref-codes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newCode),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create ref code');
      }

      setShowCreateModal(false);
      setNewCode({ refCode: '', description: '' });
      fetchRefCodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setCreating(false);
    }
  };

  const generateQrCode = (code: string): string => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}?ref=${code}`;
    // Using QR code API (can be replaced with local generation)
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`;
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Referral Codes</h1>
          <p className="mt-1 text-gray-500">Manage your tracking links</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-700"
        >
          <Plus className="h-5 w-5" />
          New Ref Code
        </button>
      </div>

      {/* Ref Codes Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {refCodes.map((ref) => (
          <div
            key={ref.id}
            className={`rounded-2xl bg-white p-6 shadow-sm ${
              !ref.isActive ? 'opacity-60' : ''
            }`}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="font-mono text-lg font-bold text-gray-900">
                  {ref.refCode}
                </p>
                {ref.description && (
                  <p className="mt-1 text-sm text-gray-500">{ref.description}</p>
                )}
              </div>
              {!ref.isActive && (
                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                  Inactive
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="mb-4 flex gap-4 text-sm">
              <div>
                <span className="text-gray-500">Clicks</span>
                <span className="ml-2 font-semibold text-gray-900">
                  {ref.clicks || 0}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Conversions</span>
                <span className="ml-2 font-semibold text-gray-900">
                  {ref.conversions || 0}
                </span>
              </div>
            </div>

            {/* Link preview */}
            <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2">
              <p className="truncate text-xs text-gray-500">
                {window.location.origin}?ref={ref.refCode}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => handleCopyLink(ref.refCode)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-violet-50 py-2 text-sm font-medium text-violet-600 hover:bg-violet-100"
              >
                {copiedCode === ref.refCode ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy Link
                  </>
                )}
              </button>
              <button
                onClick={() => setShowQrModal(ref.refCode)}
                className="flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
              >
                <QrCode className="h-5 w-5" />
              </button>
              <a
                href={`${window.location.origin}?ref=${ref.refCode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
              >
                <ExternalLink className="h-5 w-5" />
              </a>
            </div>
          </div>
        ))}
      </div>

      {refCodes.length === 0 && (
        <div className="rounded-2xl bg-white py-12 text-center shadow-sm">
          <LinkIcon className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-gray-500">No referral codes yet</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            Create Your First Code
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Create Ref Code</h2>
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Ref Code *
                </label>
                <input
                  type="text"
                  required
                  value={newCode.refCode}
                  onChange={(e) => setNewCode(c => ({ 
                    ...c, 
                    refCode: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '')
                  }))}
                  placeholder="e.g., SUMMER2026"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Letters, numbers, underscores, and hyphens only
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <input
                  type="text"
                  value={newCode.description}
                  onChange={(e) => setNewCode(c => ({ ...c, description: e.target.value }))}
                  placeholder="e.g., Summer campaign 2026"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setError(null);
                  }}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-lg bg-violet-600 py-2 font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center">
            <h2 className="mb-4 text-xl font-bold text-gray-900">QR Code</h2>
            <p className="mb-4 font-mono text-sm text-gray-500">{showQrModal}</p>
            
            <div className="mb-4 flex justify-center">
              <img
                src={generateQrCode(showQrModal)}
                alt={`QR code for ${showQrModal}`}
                className="h-64 w-64 rounded-lg"
              />
            </div>

            <p className="mb-4 text-xs text-gray-500">
              Scan to visit your referral link
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowQrModal(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <a
                href={generateQrCode(showQrModal)}
                download={`qr-${showQrModal}.png`}
                className="flex-1 rounded-lg bg-violet-600 py-2 font-medium text-white hover:bg-violet-700"
              >
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
