'use client';

/**
 * Admin Competition Management Page
 *
 * Create, manage, and view affiliate competitions with live standings.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Trophy,
  Plus,
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  MousePointer,
  ShoppingCart,
  Percent,
  UserPlus,
  Clock,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Eye,
  X,
  Medal,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface Competition {
  id: number;
  name: string;
  description: string | null;
  metric: string;
  startDate: string;
  endDate: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  prizeDescription: string | null;
  prizeValueCents: number | null;
  participantCount: number;
  topParticipants: Array<{
    affiliateId: number;
    displayName: string;
    currentValue: number;
    rank: number | null;
  }>;
}

interface CompetitionDetail extends Competition {
  standings: Array<{
    rank: number;
    affiliateId: number;
    displayName: string;
    currentValue: number;
    formattedValue: string;
  }>;
}

const METRIC_OPTIONS = [
  { value: 'CLICKS', label: 'Most Clicks', icon: MousePointer },
  { value: 'CONVERSIONS', label: 'Most Sales', icon: ShoppingCart },
  { value: 'REVENUE', label: 'Highest Revenue', icon: DollarSign },
  { value: 'CONVERSION_RATE', label: 'Best Conversion Rate', icon: Percent },
  { value: 'NEW_CUSTOMERS', label: 'Most New Customers', icon: UserPlus },
];

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: typeof Clock }> = {
  SCHEDULED: { bg: 'bg-blue-50', text: 'text-blue-700', icon: Clock },
  ACTIVE: { bg: 'bg-green-50', text: 'text-green-700', icon: TrendingUp },
  COMPLETED: { bg: 'bg-gray-50', text: 'text-gray-700', icon: CheckCircle },
  CANCELLED: { bg: 'bg-red-50', text: 'text-red-700', icon: XCircle },
};

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(cents / 100);
};

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatDateForInput = (dateStr: string) => {
  return new Date(dateStr).toISOString().split('T')[0];
};

const getMetricIcon = (metric: string) => {
  const option = METRIC_OPTIONS.find((m) => m.value === metric);
  return option?.icon || Trophy;
};

const getMetricLabel = (metric: string) => {
  const option = METRIC_OPTIONS.find((m) => m.value === metric);
  return option?.label || metric;
};

export default function CompetitionsPage() {
  // List state
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCompetition, setSelectedCompetition] = useState<CompetitionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    metric: 'CONVERSIONS',
    startDate: '',
    endDate: '',
    prizeDescription: '',
    prizeValueCents: '',
    autoEnrollAll: true,
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Fetch competitions
  const fetchCompetitions = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);

      const res = await apiFetch(`/api/admin/competitions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCompetitions(data.competitions || []);
      }
    } catch (error) {
      console.error('Failed to fetch competitions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompetitions();
  }, [statusFilter]);

  // Fetch competition detail
  const fetchCompetitionDetail = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/api/admin/competitions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedCompetition({
          ...data.competition,
          standings: data.standings,
          participantCount: data.participantCount,
        });
        setShowDetailModal(true);
      }
    } catch (error) {
      console.error('Failed to fetch competition:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  // Create competition
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      const res = await apiFetch('/api/admin/competitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          prizeValueCents: formData.prizeValueCents
            ? parseInt(formData.prizeValueCents) * 100
            : null,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setFormData({
          name: '',
          description: '',
          metric: 'CONVERSIONS',
          startDate: '',
          endDate: '',
          prizeDescription: '',
          prizeValueCents: '',
          autoEnrollAll: true,
        });
        fetchCompetitions();
      } else {
        const data = await res.json();
        setFormError(data.error || 'Failed to create competition');
      }
    } catch (error) {
      setFormError('Failed to create competition');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete/Cancel competition
  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to cancel this competition?')) return;

    try {
      const res = await apiFetch(`/api/admin/competitions/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchCompetitions();
        if (showDetailModal && selectedCompetition?.id === id) {
          setShowDetailModal(false);
        }
      }
    } catch (error) {
      console.error('Failed to delete competition:', error);
    }
  };

  // Stats
  const activeCount = competitions.filter((c) => c.status === 'ACTIVE').length;
  const scheduledCount = competitions.filter((c) => c.status === 'SCHEDULED').length;
  const completedCount = competitions.filter((c) => c.status === 'COMPLETED').length;

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/admin/affiliates"
            className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Affiliates
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Competitions</h1>
          <p className="mt-1 text-gray-500">Create and manage affiliate competitions</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700"
        >
          <Plus className="h-4 w-4" />
          New Competition
        </button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-green-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-green-900">{activeCount}</p>
              <p className="text-sm text-green-600">Active</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-blue-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-blue-900">{scheduledCount}</p>
              <p className="text-sm text-blue-600">Scheduled</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-gray-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-200">
              <CheckCircle className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{completedCount}</p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-2">
        {['', 'ACTIVE', 'SCHEDULED', 'COMPLETED', 'CANCELLED'].map((status) => (
          <button
            key={status || 'all'}
            onClick={() => setStatusFilter(status)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {status || 'All'}
          </button>
        ))}
      </div>

      {/* Competition List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent"></div>
        </div>
      ) : competitions.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Trophy className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">No competitions yet</h3>
          <p className="mb-4 text-gray-500">
            Create your first competition to engage your affiliates
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            Create Competition
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {competitions.map((competition) => {
            const MetricIcon = getMetricIcon(competition.metric);
            const statusStyle = STATUS_COLORS[competition.status];
            const StatusIcon = statusStyle.icon;

            return (
              <div
                key={competition.id}
                className="rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-gray-300"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
                      <Trophy className="h-6 w-6 text-amber-500" />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{competition.name}</h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                        >
                          {competition.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <MetricIcon className="h-4 w-4" />
                          {getMetricLabel(competition.metric)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(competition.startDate)} - {formatDate(competition.endDate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {competition.participantCount} participants
                        </span>
                      </div>
                      {competition.prizeDescription && (
                        <p className="mt-2 flex items-center gap-1 text-sm text-amber-600">
                          <Trophy className="h-4 w-4" />
                          Prize: {competition.prizeDescription}
                          {competition.prizeValueCents &&
                            ` (${formatCurrency(competition.prizeValueCents)})`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Top 3 Preview */}
                  {competition.topParticipants.length > 0 && (
                    <div className="hidden items-center gap-2 md:flex">
                      {competition.topParticipants.slice(0, 3).map((p, i) => (
                        <div
                          key={p.affiliateId}
                          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${
                            i === 0 ? 'bg-amber-50' : i === 1 ? 'bg-gray-100' : 'bg-orange-50'
                          }`}
                        >
                          <Medal
                            className={`h-4 w-4 ${
                              i === 0
                                ? 'text-amber-500'
                                : i === 1
                                  ? 'text-gray-400'
                                  : 'text-orange-400'
                            }`}
                          />
                          <span className="text-sm font-medium text-gray-700">
                            {p.displayName.split(' ')[0]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fetchCompetitionDetail(competition.id)}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="View Details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {competition.status !== 'COMPLETED' && competition.status !== 'CANCELLED' && (
                      <button
                        onClick={() => handleDelete(competition.id)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Cancel"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white">
            <div className="border-b border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Create Competition</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 p-6">
              {formError && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Competition Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., January Sales Sprint"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe the competition..."
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Competition Metric *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {METRIC_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, metric: option.value })}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                          formData.metric === option.value
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-gray-200 text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-sm">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">End Date *</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Prize Description
                </label>
                <input
                  type="text"
                  value={formData.prizeDescription}
                  onChange={(e) => setFormData({ ...formData, prizeDescription: e.target.value })}
                  placeholder="e.g., $500 bonus, Gift card, etc."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Prize Value ($)
                </label>
                <input
                  type="number"
                  value={formData.prizeValueCents}
                  onChange={(e) => setFormData({ ...formData, prizeValueCents: e.target.value })}
                  placeholder="500"
                  min="0"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoEnrollAll"
                  checked={formData.autoEnrollAll}
                  onChange={(e) => setFormData({ ...formData, autoEnrollAll: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <label htmlFor="autoEnrollAll" className="text-sm text-gray-700">
                  Auto-enroll all active affiliates
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Competition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedCompetition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white">
            <div className="border-b border-gray-100 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">
                      {selectedCompetition.name}
                    </h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[selectedCompetition.status].bg} ${STATUS_COLORS[selectedCompetition.status].text}`}
                    >
                      {selectedCompetition.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatDate(selectedCompetition.startDate)} -{' '}
                    {formatDate(selectedCompetition.endDate)}
                  </p>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Competition Info */}
              <div className="mb-6 grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="mb-1 text-xs text-gray-500">Metric</p>
                  <p className="font-medium text-gray-900">
                    {getMetricLabel(selectedCompetition.metric)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="mb-1 text-xs text-gray-500">Participants</p>
                  <p className="font-medium text-gray-900">
                    {selectedCompetition.participantCount}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="mb-1 text-xs text-gray-500">Prize</p>
                  <p className="font-medium text-gray-900">
                    {selectedCompetition.prizeDescription || 'None'}
                  </p>
                </div>
              </div>

              {/* Standings */}
              <h3 className="mb-3 font-semibold text-gray-900">Current Standings</h3>
              {selectedCompetition.standings.length === 0 ? (
                <div className="rounded-lg bg-gray-50 py-8 text-center">
                  <Users className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  <p className="text-gray-500">No participants yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedCompetition.standings.map((entry, index) => (
                    <div
                      key={entry.affiliateId}
                      className={`flex items-center justify-between rounded-lg p-3 ${
                        index === 0
                          ? 'bg-amber-50'
                          : index === 1
                            ? 'bg-gray-100'
                            : index === 2
                              ? 'bg-orange-50'
                              : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${
                            index === 0
                              ? 'bg-amber-200 text-amber-800'
                              : index === 1
                                ? 'bg-gray-200 text-gray-700'
                                : index === 2
                                  ? 'bg-orange-200 text-orange-800'
                                  : 'bg-white text-gray-600'
                          }`}
                        >
                          {entry.rank}
                        </div>
                        <span className="font-medium text-gray-900">{entry.displayName}</span>
                      </div>
                      <span className="font-semibold text-gray-900">{entry.formattedValue}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
