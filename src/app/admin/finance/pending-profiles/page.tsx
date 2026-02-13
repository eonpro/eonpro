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
} from 'lucide-react';

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
}

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
      return 'bg-green-100 text-green-700';
    case 'medium':
      return 'bg-yellow-100 text-yellow-700';
    case 'low':
      return 'bg-gray-100 text-gray-600';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

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
  });
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<{
    updated: number;
    failed: number;
    remaining: number;
  } | null>(null);

  const bulkSyncFromStripe = async () => {
    setBulkSyncing(true);
    setSyncResults(null);
    try {
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('token');

      const response = await fetch('/api/admin/sync-stripe-profiles', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ dryRun: false, limit: 50 }),
      });

      if (response.ok) {
        const data = await response.json();
        setSyncResults({
          updated: data.summary.updated,
          failed: data.summary.failed,
          remaining: data.summary.remaining,
        });
        // Reload profiles
        loadProfiles();
      }
    } catch (error) {
      console.error('Failed to bulk sync:', error);
    } finally {
      setBulkSyncing(false);
    }
  };

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('token');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const params = new URLSearchParams({
        status: 'PENDING_COMPLETION',
        ...(searchQuery && { search: searchQuery }),
      });

      const response = await fetch(`/api/finance/pending-profiles?${params}`, {
        credentials: 'include',
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setProfiles(data.profiles);
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to load pending profiles:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const handleComplete = async () => {
    if (!selectedProfile) return;
    setProcessing(true);

    try {
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('token');

      const response = await fetch('/api/finance/pending-profiles', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          patientId: selectedProfile.id,
          action: 'complete',
          updates: {
            ...(completeForm.firstName && { firstName: completeForm.firstName }),
            ...(completeForm.lastName && { lastName: completeForm.lastName }),
            ...(completeForm.email && { email: completeForm.email }),
            ...(completeForm.phone && { phone: completeForm.phone }),
          },
        }),
      });

      if (response.ok) {
        setShowCompleteModal(false);
        setSelectedProfile(null);
        setCompleteForm({ firstName: '', lastName: '', email: '', phone: '' });
        loadProfiles();
      }
    } catch (error) {
      console.error('Failed to complete profile:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleMerge = async (targetPatientId: number) => {
    if (!selectedProfile) return;
    setProcessing(true);

    try {
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('token');

      const response = await fetch('/api/finance/pending-profiles', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          patientId: selectedProfile.id,
          action: 'merge',
          targetPatientId,
        }),
      });

      if (response.ok) {
        setShowMergeModal(false);
        setSelectedProfile(null);
        loadProfiles();
      }
    } catch (error) {
      console.error('Failed to merge profile:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleArchive = async (profile: PendingProfile) => {
    if (!confirm('Are you sure you want to archive this profile?')) return;
    setProcessing(true);

    try {
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('token');

      const response = await fetch('/api/finance/pending-profiles', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          patientId: profile.id,
          action: 'archive',
        }),
      });

      if (response.ok) {
        loadProfiles();
      }
    } catch (error) {
      console.error('Failed to archive profile:', error);
    } finally {
      setProcessing(false);
    }
  };

  const openCompleteModal = (profile: PendingProfile) => {
    setSelectedProfile(profile);
    setCompleteForm({
      firstName: profile.firstName === 'Unknown' ? '' : profile.firstName,
      lastName: profile.lastName === 'Customer' ? '' : profile.lastName,
      email: profile.email.includes('@placeholder.local') ? '' : profile.email,
      phone: profile.phone || '',
    });
    setShowCompleteModal(true);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pending Profiles</h2>
          <p className="mt-1 text-sm text-gray-500">
            Review and complete patient profiles created from Stripe payments
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

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="w-fit rounded-lg bg-amber-50 p-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <h3 className="mt-4 text-2xl font-bold text-gray-900">{stats.pendingCompletion}</h3>
            <p className="mt-1 text-sm text-gray-500">Pending Completion</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="w-fit rounded-lg bg-green-50 p-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <h3 className="mt-4 text-2xl font-bold text-gray-900">{stats.active}</h3>
            <p className="mt-1 text-sm text-gray-500">Active Profiles</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="w-fit rounded-lg bg-blue-50 p-2">
              <GitMerge className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="mt-4 text-2xl font-bold text-gray-900">{stats.merged}</h3>
            <p className="mt-1 text-sm text-gray-500">Merged</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="w-fit rounded-lg bg-gray-50 p-2">
              <Archive className="h-5 w-5 text-gray-600" />
            </div>
            <h3 className="mt-4 text-2xl font-bold text-gray-900">{stats.archived}</h3>
            <p className="mt-1 text-sm text-gray-500">Archived</p>
          </div>
        </div>
      )}

      {/* Search and Filters */}
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
        <div className="border-b border-gray-200 p-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Profiles Requiring Action ({profiles.length})
          </h3>
        </div>

        {profiles.length === 0 ? (
          <div className="p-12 text-center">
            <UserPlus className="mx-auto mb-3 h-12 w-12 text-gray-300" />
            <p className="text-gray-500">No pending profiles found</p>
            <p className="mt-1 text-sm text-gray-400">All patient profiles are complete</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {profiles.map((profile) => (
              <div key={profile.id} className="p-4 transition-colors hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-3">
                      <div className="rounded-lg bg-amber-50 p-2">
                        <User className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">
                          {profile.firstName} {profile.lastName}
                          {(profile.firstName === 'Unknown' || profile.lastName === 'Customer') && (
                            <span className="ml-2 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-600">
                              Incomplete Name
                            </span>
                          )}
                        </h4>
                        <p className="text-sm text-gray-500">
                          ID: {profile.patientId || `#${profile.id}`}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span
                          className={
                            profile.email.includes('@placeholder.local') ? 'text-amber-600' : ''
                          }
                        >
                          {profile.email.includes('@placeholder.local')
                            ? 'No email'
                            : profile.email}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="h-4 w-4 text-gray-400" />
                        <span>{profile.phone || 'No phone'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        <span>
                          {formatCurrency(profile.totalPayments)} ({profile.invoiceCount} invoice
                          {profile.invoiceCount !== 1 ? 's' : ''})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>Created {formatDate(profile.createdAt)}</span>
                      </div>
                    </div>

                    {/* Match Candidates */}
                    {profile.matchCandidates && profile.matchCandidates.length > 0 && (
                      <div className="mt-3 rounded-lg bg-blue-50 p-3">
                        <p className="mb-2 text-xs font-medium text-blue-700">
                          Potential Matches Found:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {profile.matchCandidates.map((candidate) => (
                            <button
                              key={candidate.id}
                              onClick={() => {
                                setSelectedProfile(profile);
                                setShowMergeModal(true);
                              }}
                              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${getConfidenceColor(
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
                  <div className="ml-4 flex items-center gap-2">
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

      {/* Complete Profile Modal */}
      {showCompleteModal && selectedProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Complete Profile</h3>
              <button
                onClick={() => {
                  setShowCompleteModal(false);
                  setSelectedProfile(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-4 text-sm text-gray-600">
              Update the missing information to complete this patient profile.
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">First Name</label>
                <input
                  type="text"
                  value={completeForm.firstName}
                  onChange={(e) => setCompleteForm({ ...completeForm, firstName: e.target.value })}
                  placeholder="Enter first name"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Last Name</label>
                <input
                  type="text"
                  value={completeForm.lastName}
                  onChange={(e) => setCompleteForm({ ...completeForm, lastName: e.target.value })}
                  placeholder="Enter last name"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={completeForm.email}
                  onChange={(e) => setCompleteForm({ ...completeForm, email: e.target.value })}
                  placeholder="Enter email address"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
                <input
                  type="tel"
                  value={completeForm.phone}
                  onChange={(e) => setCompleteForm({ ...completeForm, phone: e.target.value })}
                  placeholder="Enter phone number"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
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
      )}

      {/* Merge Modal */}
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
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-lg bg-amber-50 p-3">
              <p className="text-sm text-amber-700">
                <strong>Source Profile:</strong> {selectedProfile.firstName}{' '}
                {selectedProfile.lastName} ({selectedProfile.email})
              </p>
              <p className="mt-1 text-xs text-amber-600">
                This profile will be merged into the selected target and deleted.
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
                      className={`rounded px-2 py-1 text-xs ${getConfidenceColor(
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
                    <GitMerge className="h-4 w-4" />
                    <span className="text-sm">Merge</span>
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
