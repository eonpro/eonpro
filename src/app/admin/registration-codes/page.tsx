'use client';

import { useState, useEffect } from 'react';
import {
  Key,
  Plus,
  Copy,
  Check,
  X,
  Trash2,
  Edit2,
  RefreshCw,
  Users,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  Link2,
  ExternalLink,
} from 'lucide-react';
import { isBrowser } from '@/lib/utils/ssr-safe';

interface RegistrationCode {
  id: number;
  code: string;
  description: string | null;
  usageLimit: number | null;
  usageCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  clinic: {
    id: number;
    name: string;
    subdomain: string;
  };
  remainingUses: number | null;
  isExpired: boolean;
  isLimitReached: boolean;
}

export default function RegistrationCodesPage() {
  const [codes, setCodes] = useState<RegistrationCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCode, setEditingCode] = useState<RegistrationCode | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    usageLimit: '',
    expiresAt: '',
    isActive: true,
  });

  useEffect(() => {
    loadCodes();
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadCodes = async () => {
    try {
      const response = await fetch('/api/admin/registration-codes');
      if (response.ok) {
        const data = await response.json();
        setCodes(data.codes || []);
      }
    } catch (error) {
      console.error('Failed to load codes:', error);
      showToast('Failed to load registration codes', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyLink = (code: RegistrationCode) => {
    if (!isBrowser) return;
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/register?code=${code.code}`;
    navigator.clipboard.writeText(link);
    showToast('Registration link copied!');
  };

  const resetForm = () => {
    setFormData({
      code: '',
      description: '',
      usageLimit: '',
      expiresAt: '',
      isActive: true,
    });
  };

  const handleCreateCode = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/registration-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: formData.code || undefined,
          description: formData.description || undefined,
          usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null,
          expiresAt: formData.expiresAt || null,
          isActive: formData.isActive,
        }),
      });

      if (response.ok) {
        showToast('Registration code created successfully!');
        setShowCreateModal(false);
        resetForm();
        loadCodes();
      } else {
        const error = await response.json();
        showToast(error.error || 'Failed to create code', 'error');
      }
    } catch (error) {
      showToast('Failed to create code', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCode = async () => {
    if (!editingCode) return;

    setSaving(true);
    try {
      const response = await fetch('/api/admin/registration-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCode.id,
          description: formData.description || undefined,
          usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null,
          expiresAt: formData.expiresAt || null,
          isActive: formData.isActive,
        }),
      });

      if (response.ok) {
        showToast('Registration code updated successfully!');
        setShowEditModal(false);
        setEditingCode(null);
        resetForm();
        loadCodes();
      } else {
        const error = await response.json();
        showToast(error.error || 'Failed to update code', 'error');
      }
    } catch (error) {
      showToast('Failed to update code', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (code: RegistrationCode) => {
    try {
      const response = await fetch('/api/admin/registration-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: code.id,
          isActive: !code.isActive,
        }),
      });

      if (response.ok) {
        showToast(`Code ${code.isActive ? 'disabled' : 'enabled'} successfully`);
        loadCodes();
      }
    } catch (error) {
      showToast('Failed to update code', 'error');
    }
  };

  const handleDeleteCode = async (code: RegistrationCode) => {
    if (!confirm(`Are you sure you want to delete the code "${code.code}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/registration-codes?id=${code.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showToast('Code deleted successfully');
        loadCodes();
      } else {
        const error = await response.json();
        showToast(error.error || 'Failed to delete code', 'error');
      }
    } catch (error) {
      showToast('Failed to delete code', 'error');
    }
  };

  const openEditModal = (code: RegistrationCode) => {
    setEditingCode(code);
    setFormData({
      code: code.code,
      description: code.description || '',
      usageLimit: code.usageLimit?.toString() || '',
      expiresAt: code.expiresAt ? code.expiresAt.split('T')[0] : '',
      isActive: code.isActive,
    });
    setShowEditModal(true);
  };

  const getStatusBadge = (code: RegistrationCode) => {
    if (!code.isActive) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
          <X className="h-3 w-3" />
          Disabled
        </span>
      );
    }
    if (code.isExpired) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
          <Clock className="h-3 w-3" />
          Expired
        </span>
      );
    }
    if (code.isLimitReached) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
          <AlertCircle className="h-3 w-3" />
          Limit Reached
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <CheckCircle className="h-3 w-3" />
        Active
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 flex items-center gap-3 rounded-xl px-5 py-4 text-white shadow-2xl ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-gray-900'
          }`}
        >
          {toast.type === 'error' ? (
            <X className="h-5 w-5" />
          ) : (
            <Check className="h-5 w-5" />
          )}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registration Codes</h1>
          <p className="mt-1 text-gray-600">
            Manage codes that allow patients to self-register with your clinic
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreateModal(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow-lg transition-all hover:bg-emerald-700 hover:shadow-xl"
        >
          <Plus className="h-5 w-5" />
          Create Code
        </button>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
              <Key className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{codes.length}</p>
              <p className="text-sm text-gray-500">Total Codes</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <CheckCircle className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {codes.filter((c) => c.isActive && !c.isExpired && !c.isLimitReached).length}
              </p>
              <p className="text-sm text-gray-500">Active</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {codes.reduce((sum, c) => sum + c.usageCount, 0)}
              </p>
              <p className="text-sm text-gray-500">Total Registrations</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100">
              <AlertCircle className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {codes.filter((c) => c.isExpired || c.isLimitReached).length}
              </p>
              <p className="text-sm text-gray-500">Expired/Limit Reached</p>
            </div>
          </div>
        </div>
      </div>

      {/* Codes List */}
      {codes.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <Key className="mx-auto mb-4 h-16 w-16 text-gray-300" />
          <h3 className="text-xl font-semibold text-gray-900">No Registration Codes</h3>
          <p className="mt-2 text-gray-500">
            Create your first registration code to allow patients to sign up
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition-all hover:bg-emerald-700"
          >
            <Plus className="h-5 w-5" />
            Create Your First Code
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Code
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Description
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Usage
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Expires
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {codes.map((code) => (
                <tr key={code.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <code className="rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-sm font-semibold text-gray-900">
                        {code.code}
                      </code>
                      <button
                        onClick={() => handleCopyCode(code.code)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        title="Copy code"
                      >
                        {copiedCode === code.code ? (
                          <Check className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleCopyLink(code)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        title="Copy registration link"
                      >
                        <Link2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">
                      {code.description || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <span className="font-semibold text-gray-900">{code.usageCount}</span>
                      {code.usageLimit && (
                        <span className="text-gray-500"> / {code.usageLimit}</span>
                      )}
                      {!code.usageLimit && (
                        <span className="text-gray-400"> (unlimited)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">
                      {code.expiresAt
                        ? new Date(code.expiresAt).toLocaleDateString()
                        : 'Never'}
                    </span>
                  </td>
                  <td className="px-6 py-4">{getStatusBadge(code)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggleActive(code)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          code.isActive
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        }`}
                      >
                        {code.isActive ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={() => openEditModal(code)}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCode(code)}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100">
            <ExternalLink className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-blue-900">How Registration Codes Work</h3>
            <p className="mt-1 text-sm text-blue-700">
              Share your registration code with patients. They can enter it at{' '}
              <code className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-xs">
                {isBrowser ? window.location.origin : ''}/register
              </code>{' '}
              to create an account linked to your clinic. You can set usage limits and expiration
              dates to control access.
            </p>
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2">
            <div className="overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Create Registration Code</h2>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-5 p-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Code (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value.toUpperCase() })
                    }
                    placeholder="Leave blank to auto-generate"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 font-mono uppercase focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Letters and numbers only. Auto-generated if left blank.
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="e.g., Website registration, Marketing campaign"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Usage Limit
                    </label>
                    <input
                      type="number"
                      value={formData.usageLimit}
                      onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                      placeholder="Unlimited"
                      min="1"
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Expires On
                    </label>
                    <input
                      type="date"
                      value={formData.expiresAt}
                      onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="isActive" className="text-sm text-gray-700">
                    Active immediately after creation
                  </label>
                </div>
              </div>

              <div className="flex gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-xl border border-gray-300 px-4 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCode}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Code
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit Modal */}
      {showEditModal && editingCode && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowEditModal(false);
              setEditingCode(null);
            }}
          />
          <div className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2">
            <div className="overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Edit Registration Code</h2>
                    <code className="mt-1 rounded bg-gray-200 px-2 py-0.5 font-mono text-sm">
                      {editingCode.code}
                    </code>
                  </div>
                  <button
                    onClick={() => {
                      setShowEditModal(false);
                      setEditingCode(null);
                    }}
                    className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="space-y-5 p-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="e.g., Website registration, Marketing campaign"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Usage Limit
                    </label>
                    <input
                      type="number"
                      value={formData.usageLimit}
                      onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                      placeholder="Unlimited"
                      min="1"
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Current usage: {editingCode.usageCount}
                    </p>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      Expires On
                    </label>
                    <input
                      type="date"
                      value={formData.expiresAt}
                      onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="editIsActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="editIsActive" className="text-sm text-gray-700">
                    Code is active
                  </label>
                </div>
              </div>

              <div className="flex gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingCode(null);
                  }}
                  className="flex-1 rounded-xl border border-gray-300 px-4 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateCode}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
