'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  AlertTriangle,
  Search,
  Loader2,
  CheckCircle,
  Archive,
  GitMerge,
  DollarSign,
  Calendar,
  Mail,
  Phone,
  User,
  Building,
  ChevronRight,
  RefreshCw,
  ExternalLink,
  X,
  Zap,
  ClipboardList,
  MapPin,
  FileText,
  Clock,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface MatchCandidate {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  matchType: 'email' | 'phone' | 'name';
  confidence: 'high' | 'medium' | 'low';
}

interface PendingProfile {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  stripeCustomerId: string | null;
  createdAt: string;
  source: string;
  sourceMetadata: Record<string, unknown> | null;
  profileStatus: string;
  notes: string | null;
  patientId: string | null;
  clinic?: { id: number; name: string; subdomain: string };
  invoiceCount: number;
  totalPayments: number;
  lastPaymentDate: string | null;
  matchCandidates?: MatchCandidate[];
}

interface Stats {
  pendingCompletion: number;
  active: number;
  merged: number;
  archived: number;
  invoicesAwaitingProfileCompletion?: number;
}

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

// ============================================================================
// Helpers
// ============================================================================

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getConfidenceColor = (confidence: string) => {
  switch (confidence) {
    case 'high':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'low':
      return 'bg-gray-100 text-gray-600 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

const getClinicBadgeColor = (subdomain?: string) => {
  switch (subdomain) {
    case 'eonmeds':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'ot':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    default:
      return 'bg-gray-50 text-gray-600 border-gray-200';
  }
};

function getAuthHeaders(): Record<string, string> {
  const token =
    localStorage.getItem('auth-token') ||
    localStorage.getItem('super_admin-token') ||
    localStorage.getItem('admin-token') ||
    localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

// ============================================================================
// Toast Component
// ============================================================================

function ToastNotification({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const bgColor =
    toast.type === 'success'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
      : toast.type === 'error'
        ? 'bg-red-50 border-red-200 text-red-800'
        : 'bg-blue-50 border-blue-200 text-blue-800';

  const Icon =
    toast.type === 'success' ? CheckCircle : toast.type === 'error' ? AlertTriangle : Zap;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${bgColor} animate-in slide-in-from-top-2`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <p className="text-sm font-medium">{toast.message}</p>
      <button onClick={onDismiss} className="ml-auto shrink-0 opacity-60 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function PendingProfilesPage() {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<PendingProfile[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<PendingProfile | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [completeForm, setCompleteForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
    address1: '',
    city: '',
    state: '',
    zip: '',
  });
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<{
    updated: number;
    failed: number;
    remaining: number;
  } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());

  // ---- Toast helpers ----
  let toastCounter = 0;
  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ---- Data fetching ----
  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: 'PENDING_COMPLETION',
        ...(searchQuery && { search: searchQuery }),
      });

      const response = await fetch(`/api/finance/pending-profiles?${params}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setProfiles(data.profiles);
        setStats(data.stats);
      } else {
        addToast('error', 'Failed to load pending profiles');
      }
    } catch {
      addToast('error', 'Network error loading profiles');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, addToast]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // ---- Bulk sync from Stripe ----
  const bulkSyncFromStripe = async () => {
    setBulkSyncing(true);
    setSyncResults(null);
    try {
      const response = await fetch('/api/admin/sync-stripe-profiles', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({ dryRun: false, limit: 50 }),
      });

      if (response.ok) {
        const data = await response.json();
        setSyncResults({
          updated: data.summary.updated,
          failed: data.summary.failed,
          remaining: data.summary.remaining,
        });
        addToast('success', `Synced ${data.summary.updated} profiles from Stripe`);
        loadProfiles();
      } else {
        addToast('error', 'Failed to sync from Stripe');
      }
    } catch {
      addToast('error', 'Network error during Stripe sync');
    } finally {
      setBulkSyncing(false);
    }
  };

  // ---- Complete profile ----
  const handleComplete = async () => {
    if (!selectedProfile) return;
    setProcessing(true);

    try {
      const updates: Record<string, string> = {};
      if (completeForm.firstName) updates.firstName = completeForm.firstName;
      if (completeForm.lastName) updates.lastName = completeForm.lastName;
      if (completeForm.email) updates.email = completeForm.email;
      if (completeForm.phone) updates.phone = completeForm.phone;
      if (completeForm.dob) updates.dob = completeForm.dob;
      if (completeForm.address1) updates.address1 = completeForm.address1;
      if (completeForm.city) updates.city = completeForm.city;
      if (completeForm.state) updates.state = completeForm.state;
      if (completeForm.zip) updates.zip = completeForm.zip;

      const response = await fetch('/api/finance/pending-profiles', {
        method: 'PATCH',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          patientId: selectedProfile.id,
          action: 'complete',
          updates,
        }),
      });

      if (response.ok) {
        setShowCompleteModal(false);
        setSelectedProfile(null);
        setCompleteForm({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          dob: '',
          address1: '',
          city: '',
          state: '',
          zip: '',
        });
        addToast(
          'success',
          `Profile completed for ${selectedProfile.firstName} ${selectedProfile.lastName}. Paid invoices will now appear in the provider Rx queue.`
        );
        loadProfiles();
      } else {
        const err = await response.json().catch(() => null);
        addToast('error', err?.error || 'Failed to complete profile');
      }
    } catch {
      addToast('error', 'Network error completing profile');
    } finally {
      setProcessing(false);
    }
  };

  // ---- Merge profile ----
  const handleMerge = async (targetPatientId: number) => {
    if (!selectedProfile) return;
    setProcessing(true);

    try {
      const response = await fetch('/api/finance/pending-profiles', {
        method: 'PATCH',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          patientId: selectedProfile.id,
          action: 'merge',
          targetPatientId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setShowMergeModal(false);
        setSelectedProfile(null);
        addToast(
          'success',
          `Profile merged successfully. ${data.recordsMoved || 0} records moved. Invoices will appear in provider Rx queue.`
        );
        loadProfiles();
      } else {
        const err = await response.json().catch(() => null);
        addToast('error', err?.error || 'Failed to merge profile');
      }
    } catch {
      addToast('error', 'Network error merging profile');
    } finally {
      setProcessing(false);
    }
  };

  // ---- Archive profile ----
  const handleArchive = async (profile: PendingProfile) => {
    if (!confirm('Are you sure you want to archive this profile? Paid invoices will remain blocked from the Rx queue.')) return;
    setProcessing(true);

    try {
      const response = await fetch('/api/finance/pending-profiles', {
        method: 'PATCH',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          patientId: profile.id,
          action: 'archive',
        }),
      });

      if (response.ok) {
        addToast('info', `Profile archived for ${profile.firstName} ${profile.lastName}`);
        loadProfiles();
      } else {
        addToast('error', 'Failed to archive profile');
      }
    } catch {
      addToast('error', 'Network error archiving profile');
    } finally {
      setProcessing(false);
    }
  };

  // ---- Open complete modal ----
  const openCompleteModal = (profile: PendingProfile) => {
    setSelectedProfile(profile);
    setCompleteForm({
      firstName: profile.firstName === 'Unknown' ? '' : profile.firstName,
      lastName: profile.lastName === 'Customer' ? '' : profile.lastName,
      email: profile.email?.includes('@placeholder.local') ? '' : profile.email,
      phone: profile.phone || '',
      dob: profile.dob === '1900-01-01' || !profile.dob ? '' : profile.dob,
      address1: profile.address1 || '',
      city: profile.city || '',
      state: profile.state || '',
      zip: profile.zip || '',
    });
    setShowCompleteModal(true);
  };

  // ---- Toggle notes ----
  const toggleNotes = (profileId: number) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  };

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Toast Notifications */}
      <div className="fixed right-4 top-4 z-[100] flex flex-col gap-2">
        {toasts.map((toast) => (
          <ToastNotification key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pending Profiles</h2>
          <p className="mt-1 text-sm text-gray-500">
            Review and complete patient profiles created from Stripe payments. Paid invoices are
            <strong className="text-amber-600"> blocked from the provider Rx queue</strong> until the
            profile is completed or merged.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={bulkSyncFromStripe}
            disabled={bulkSyncing}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {bulkSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            Sync All from Stripe
          </button>
          <button
            onClick={loadProfiles}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Sync Results Banner */}
      {syncResults && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Sync completed: {syncResults.updated} profiles updated
                  {syncResults.failed > 0 && `, ${syncResults.failed} failed`}
                </p>
                {syncResults.remaining > 0 && (
                  <p className="text-xs text-blue-700">
                    {syncResults.remaining} profiles still need attention
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setSyncResults(null)}
              className="text-blue-600 hover:text-blue-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards — 5 columns now with "Invoices Blocked" */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="rounded-lg bg-amber-100 p-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              {stats.invoicesAwaitingProfileCompletion != null &&
                stats.invoicesAwaitingProfileCompletion > 0 && (
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                    {stats.invoicesAwaitingProfileCompletion} Rx blocked
                  </span>
                )}
            </div>
            <h3 className="mt-4 text-2xl font-bold text-gray-900">{stats.pendingCompletion}</h3>
            <p className="mt-1 text-sm text-gray-500">Pending Completion</p>
          </div>

          <div className="rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-5 shadow-sm">
            <div className="rounded-lg bg-red-100 p-2 w-fit">
              <ClipboardList className="h-5 w-5 text-red-600" />
            </div>
            <h3 className="mt-4 text-2xl font-bold text-gray-900">
              {stats.invoicesAwaitingProfileCompletion ?? 0}
            </h3>
            <p className="mt-1 text-sm text-gray-500">Invoices Blocked from Rx</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="rounded-lg bg-green-50 p-2 w-fit">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <h3 className="mt-4 text-2xl font-bold text-gray-900">{stats.active}</h3>
            <p className="mt-1 text-sm text-gray-500">Active Profiles</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="rounded-lg bg-blue-50 p-2 w-fit">
              <GitMerge className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="mt-4 text-2xl font-bold text-gray-900">{stats.merged}</h3>
            <p className="mt-1 text-sm text-gray-500">Merged</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="rounded-lg bg-gray-50 p-2 w-fit">
              <Archive className="h-5 w-5 text-gray-600" />
            </div>
            <h3 className="mt-4 text-2xl font-bold text-gray-900">{stats.archived}</h3>
            <p className="mt-1 text-sm text-gray-500">Archived</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Profiles List */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Profiles Requiring Action ({profiles.length})
          </h3>
          {stats?.invoicesAwaitingProfileCompletion != null &&
            stats.invoicesAwaitingProfileCompletion > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">
                <Clock className="h-4 w-4" />
                <span className="font-medium">
                  {stats.invoicesAwaitingProfileCompletion} paid invoice
                  {stats.invoicesAwaitingProfileCompletion !== 1 ? 's' : ''} waiting for provider Rx queue
                </span>
              </div>
            )}
        </div>

        {profiles.length === 0 ? (
          <div className="p-12 text-center">
            <UserPlus className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-gray-500">No pending profiles found</p>
            <p className="mt-1 text-sm text-gray-400">
              All patient profiles are complete — invoices flow directly to the provider Rx queue
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {profiles.map((profile) => (
              <div key={profile.id} className="p-4 transition-colors hover:bg-gray-50/50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Name row with clinic badge + invoice badge */}
                    <div className="mb-2 flex items-center gap-3">
                      <div className="rounded-lg bg-amber-50 p-2">
                        <User className="h-5 w-5 text-amber-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-gray-900">
                            {profile.firstName} {profile.lastName}
                          </h4>
                          {(profile.firstName === 'Unknown' ||
                            profile.lastName === 'Customer') && (
                            <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-600">
                              Incomplete Name
                            </span>
                          )}
                          {/* Clinic badge */}
                          {profile.clinic && (
                            <span
                              className={`rounded border px-2 py-0.5 text-xs font-medium ${getClinicBadgeColor(
                                profile.clinic.subdomain
                              )}`}
                            >
                              {profile.clinic.name}
                            </span>
                          )}
                          {/* Rx queue blocked badge */}
                          {profile.invoiceCount > 0 && (
                            <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                              {profile.invoiceCount} invoice
                              {profile.invoiceCount !== 1 ? 's' : ''} blocked from Rx
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          ID: {profile.patientId || `#${profile.id}`}
                        </p>
                      </div>
                    </div>

                    {/* Details row */}
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                        <span
                          className={
                            profile.email?.includes('@placeholder.local')
                              ? 'text-amber-600'
                              : ''
                          }
                        >
                          {profile.email?.includes('@placeholder.local')
                            ? 'No email'
                            : profile.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                        <span>{profile.phone || 'No phone'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <DollarSign className="h-4 w-4 shrink-0 text-gray-400" />
                        <span>
                          {formatCurrency(profile.totalPayments)} ({profile.invoiceCount} invoice
                          {profile.invoiceCount !== 1 ? 's' : ''})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
                        <span>Created {formatDate(profile.createdAt)}</span>
                      </div>
                    </div>

                    {/* Address row */}
                    {(profile.address1 || profile.city) && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                        <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                        <span>
                          {[profile.address1, profile.city, profile.state, profile.zip]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </div>
                    )}

                    {/* Notes */}
                    {profile.notes && (
                      <button
                        onClick={() => toggleNotes(profile.id)}
                        className="mt-2 flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span className="underline">
                          {expandedNotes.has(profile.id) ? 'Hide notes' : 'Show notes'}
                        </span>
                      </button>
                    )}
                    {expandedNotes.has(profile.id) && profile.notes && (
                      <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                        {profile.notes}
                      </div>
                    )}

                    {/* Match Candidates */}
                    {profile.matchCandidates && profile.matchCandidates.length > 0 && (
                      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <p className="mb-2 text-xs font-medium text-blue-700">
                          Potential Matches Found — merge to unblock invoices:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {profile.matchCandidates.map((candidate) => (
                            <button
                              key={candidate.id}
                              onClick={() => {
                                setSelectedProfile(profile);
                                setShowMergeModal(true);
                              }}
                              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${getConfidenceColor(
                                candidate.confidence
                              )}`}
                            >
                              {candidate.firstName} {candidate.lastName}
                              <span className="opacity-60">({candidate.matchType})</span>
                              <ChevronRight className="h-3 w-3" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Stripe Info */}
                    {profile.stripeCustomerId && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                        <Building className="h-3 w-3" />
                        Stripe: {profile.stripeCustomerId}
                        <a
                          href={`https://dashboard.stripe.com/customers/${profile.stripeCustomerId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:text-emerald-700"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="ml-4 flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => openCompleteModal(profile)}
                      className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Complete
                    </button>
                    {profile.matchCandidates && profile.matchCandidates.length > 0 && (
                      <button
                        onClick={() => {
                          setSelectedProfile(profile);
                          setShowMergeModal(true);
                        }}
                        className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        <GitMerge className="h-4 w-4" />
                        Merge
                      </button>
                    )}
                    <button
                      onClick={() => handleArchive(profile)}
                      className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
                      title="Archive this profile"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* Complete Profile Modal — Enhanced with DOB + Address */}
      {/* ================================================================ */}
      {showCompleteModal && selectedProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-gray-100 p-6 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Complete Patient Profile</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  Verify and update details to send paid invoices to the provider Rx queue
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCompleteModal(false);
                  setSelectedProfile(null);
                }}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Invoice alert */}
            {selectedProfile.invoiceCount > 0 && (
              <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <ClipboardList className="h-4 w-4 shrink-0" />
                <span>
                  <strong>{selectedProfile.invoiceCount}</strong> paid invoice
                  {selectedProfile.invoiceCount !== 1 ? 's' : ''} (
                  {formatCurrency(selectedProfile.totalPayments)}) will move to the provider Rx
                  queue once this profile is completed.
                </span>
              </div>
            )}

            {/* Form */}
            <div className="max-h-[60vh] overflow-y-auto p-6 pt-4">
              <div className="space-y-4">
                {/* Name row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      First Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={completeForm.firstName}
                      onChange={(e) =>
                        setCompleteForm({ ...completeForm, firstName: e.target.value })
                      }
                      placeholder="Enter first name"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Last Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={completeForm.lastName}
                      onChange={(e) =>
                        setCompleteForm({ ...completeForm, lastName: e.target.value })
                      }
                      placeholder="Enter last name"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* Email + Phone */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={completeForm.email}
                      onChange={(e) =>
                        setCompleteForm({ ...completeForm, email: e.target.value })
                      }
                      placeholder="Enter email address"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
                    <input
                      type="tel"
                      value={completeForm.phone}
                      onChange={(e) =>
                        setCompleteForm({ ...completeForm, phone: e.target.value })
                      }
                      placeholder="Enter phone number"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                {/* DOB */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={completeForm.dob}
                    onChange={(e) => setCompleteForm({ ...completeForm, dob: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Divider */}
                <div className="flex items-center gap-2 pt-1">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-500">Address</span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>

                {/* Address */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={completeForm.address1}
                    onChange={(e) =>
                      setCompleteForm({ ...completeForm, address1: e.target.value })
                    }
                    placeholder="Enter street address"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">City</label>
                    <input
                      type="text"
                      value={completeForm.city}
                      onChange={(e) =>
                        setCompleteForm({ ...completeForm, city: e.target.value })
                      }
                      placeholder="City"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">State</label>
                    <input
                      type="text"
                      value={completeForm.state}
                      onChange={(e) =>
                        setCompleteForm({ ...completeForm, state: e.target.value })
                      }
                      placeholder="State"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">ZIP</label>
                    <input
                      type="text"
                      value={completeForm.zip}
                      onChange={(e) =>
                        setCompleteForm({ ...completeForm, zip: e.target.value })
                      }
                      placeholder="ZIP"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between border-t border-gray-100 p-6 pt-4">
              <p className="text-xs text-gray-400">
                Completing will set profile to Active and trigger SOAP note generation
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCompleteModal(false);
                    setSelectedProfile(null);
                  }}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleComplete}
                  disabled={
                    processing ||
                    (!completeForm.firstName && !completeForm.lastName && !completeForm.email)
                  }
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {processing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Complete Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Merge Modal */}
      {/* ================================================================ */}
      {showMergeModal && selectedProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Merge Profile</h3>
              <button
                onClick={() => {
                  setShowMergeModal(false);
                  setSelectedProfile(null);
                }}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-700">
                <strong>Source Profile:</strong> {selectedProfile.firstName}{' '}
                {selectedProfile.lastName} ({selectedProfile.email})
              </p>
              <p className="mt-1 text-xs text-amber-600">
                This profile&apos;s invoices and records will be transferred to the selected target
                patient, then this profile will be marked as merged. Invoices will immediately
                appear in the provider Rx queue.
              </p>
            </div>

            <p className="mb-4 text-sm text-gray-600">
              Select the existing patient to merge this profile into:
            </p>

            <div className="max-h-64 space-y-2 overflow-y-auto">
              {selectedProfile.matchCandidates?.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => handleMerge(candidate.id)}
                  disabled={processing}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded border px-2 py-1 text-xs ${getConfidenceColor(
                        candidate.confidence
                      )}`}
                    >
                      {candidate.confidence}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">
                        {candidate.firstName} {candidate.lastName}
                      </p>
                      <p className="text-xs text-gray-500">{candidate.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-600">
                    {processing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <GitMerge className="h-4 w-4" />
                    )}
                    <span className="text-sm font-medium">Merge</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowMergeModal(false);
                  setSelectedProfile(null);
                }}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
