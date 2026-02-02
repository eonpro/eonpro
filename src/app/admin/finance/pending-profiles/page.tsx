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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pending Profiles</h2>
          <p className="text-sm text-gray-500 mt-1">
            Review and complete patient profiles created from Stripe payments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={bulkSyncFromStripe}
            disabled={bulkSyncing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Sync Results Banner */}
      {syncResults && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="p-2 bg-amber-50 rounded-lg w-fit">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mt-4">
              {stats.pendingCompletion}
            </h3>
            <p className="text-sm text-gray-500 mt-1">Pending Completion</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="p-2 bg-green-50 rounded-lg w-fit">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mt-4">{stats.active}</h3>
            <p className="text-sm text-gray-500 mt-1">Active Profiles</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="p-2 bg-blue-50 rounded-lg w-fit">
              <GitMerge className="h-5 w-5 text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mt-4">{stats.merged}</h3>
            <p className="text-sm text-gray-500 mt-1">Merged</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="p-2 bg-gray-50 rounded-lg w-fit">
              <Archive className="h-5 w-5 text-gray-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mt-4">{stats.archived}</h3>
            <p className="text-sm text-gray-500 mt-1">Archived</p>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Profiles List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Profiles Requiring Action ({profiles.length})
          </h3>
        </div>

        {profiles.length === 0 ? (
          <div className="p-12 text-center">
            <UserPlus className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No pending profiles found</p>
            <p className="text-sm text-gray-400 mt-1">
              All patient profiles are complete
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-amber-50 rounded-lg">
                        <User className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">
                          {profile.firstName} {profile.lastName}
                          {(profile.firstName === 'Unknown' ||
                            profile.lastName === 'Customer') && (
                            <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                              Incomplete Name
                            </span>
                          )}
                        </h4>
                        <p className="text-sm text-gray-500">
                          ID: {profile.patientId || `#${profile.id}`}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="h-4 w-4 text-gray-400" />
                        <span
                          className={
                            profile.email.includes('@placeholder.local')
                              ? 'text-amber-600'
                              : ''
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
                          {formatCurrency(profile.totalPayments)} ({profile.invoiceCount}{' '}
                          invoice{profile.invoiceCount !== 1 ? 's' : ''})
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>Created {formatDate(profile.createdAt)}</span>
                      </div>
                    </div>

                    {/* Match Candidates */}
                    {profile.matchCandidates && profile.matchCandidates.length > 0 && (
                      <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                        <p className="text-xs font-medium text-blue-700 mb-2">
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
                              className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded ${getConfidenceColor(
                                candidate.confidence
                              )}`}
                            >
                              {candidate.firstName} {candidate.lastName}
                              <span className="opacity-60">
                                ({candidate.matchType})
                              </span>
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
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => openCompleteModal(profile)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
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
                        className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <GitMerge className="h-4 w-4" />
                        Merge
                      </button>
                    )}
                    <button
                      onClick={() => handleArchive(profile)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Complete Profile
              </h3>
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

            <p className="text-sm text-gray-600 mb-4">
              Update the missing information to complete this patient profile.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  value={completeForm.firstName}
                  onChange={(e) =>
                    setCompleteForm({ ...completeForm, firstName: e.target.value })
                  }
                  placeholder="Enter first name"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  value={completeForm.lastName}
                  onChange={(e) =>
                    setCompleteForm({ ...completeForm, lastName: e.target.value })
                  }
                  placeholder="Enter last name"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={completeForm.email}
                  onChange={(e) =>
                    setCompleteForm({ ...completeForm, email: e.target.value })
                  }
                  placeholder="Enter email address"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={completeForm.phone}
                  onChange={(e) =>
                    setCompleteForm({ ...completeForm, phone: e.target.value })
                  }
                  placeholder="Enter phone number"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCompleteModal(false);
                  setSelectedProfile(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleComplete}
                disabled={
                  processing ||
                  (!completeForm.firstName &&
                    !completeForm.lastName &&
                    !completeForm.email)
                }
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Merge Profile
              </h3>
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

            <div className="p-3 bg-amber-50 rounded-lg mb-4">
              <p className="text-sm text-amber-700">
                <strong>Source Profile:</strong> {selectedProfile.firstName}{' '}
                {selectedProfile.lastName} ({selectedProfile.email})
              </p>
              <p className="text-xs text-amber-600 mt-1">
                This profile will be merged into the selected target and deleted.
              </p>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Select the existing patient to merge this profile into:
            </p>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {selectedProfile.matchCandidates?.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => handleMerge(candidate.id)}
                  disabled={processing}
                  className="w-full flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`px-2 py-1 text-xs rounded ${getConfidenceColor(
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

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowMergeModal(false);
                  setSelectedProfile(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
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
