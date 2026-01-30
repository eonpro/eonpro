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
  const option = METRIC_OPTIONS.find(m => m.value === metric);
  return option?.icon || Trophy;
};

const getMetricLabel = (metric: string) => {
  const option = METRIC_OPTIONS.find(m => m.value === metric);
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
          prizeValueCents: formData.prizeValueCents ? parseInt(formData.prizeValueCents) * 100 : null,
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
  const activeCount = competitions.filter(c => c.status === 'ACTIVE').length;
  const scheduledCount = competitions.filter(c => c.status === 'SCHEDULED').length;
  const completedCount = competitions.filter(c => c.status === 'COMPLETED').length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/admin/affiliates"
            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm mb-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Affiliates
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Competitions</h1>
          <p className="text-gray-500 mt-1">Create and manage affiliate competitions</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Competition
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-green-900">{activeCount}</p>
              <p className="text-sm text-green-600">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-blue-50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-blue-900">{scheduledCount}</p>
              <p className="text-sm text-blue-600">Scheduled</p>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-gray-900">{completedCount}</p>
              <p className="text-sm text-gray-600">Completed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {['', 'ACTIVE', 'SCHEDULED', 'COMPLETED', 'CANCELLED'].map((status) => (
          <button
            key={status || 'all'}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent"></div>
        </div>
      ) : competitions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No competitions yet</h3>
          <p className="text-gray-500 mb-4">Create your first competition to engage your affiliates</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
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
                className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                      <Trophy className="w-6 h-6 text-amber-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{competition.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                          {competition.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <MetricIcon className="w-4 h-4" />
                          {getMetricLabel(competition.metric)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(competition.startDate)} - {formatDate(competition.endDate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {competition.participantCount} participants
                        </span>
                      </div>
                      {competition.prizeDescription && (
                        <p className="text-sm text-amber-600 mt-2 flex items-center gap-1">
                          <Trophy className="w-4 h-4" />
                          Prize: {competition.prizeDescription}
                          {competition.prizeValueCents && ` (${formatCurrency(competition.prizeValueCents)})`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Top 3 Preview */}
                  {competition.topParticipants.length > 0 && (
                    <div className="hidden md:flex items-center gap-2">
                      {competition.topParticipants.slice(0, 3).map((p, i) => (
                        <div
                          key={p.affiliateId}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                            i === 0 ? 'bg-amber-50' : i === 1 ? 'bg-gray-100' : 'bg-orange-50'
                          }`}
                        >
                          <Medal className={`w-4 h-4 ${
                            i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : 'text-orange-400'
                          }`} />
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
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {competition.status !== 'COMPLETED' && competition.status !== 'CANCELLED' && (
                      <button
                        onClick={() => handleDelete(competition.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Cancel"
                      >
                        <Trash2 className="w-4 h-4" />
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Create Competition</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {formError && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Competition Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., January Sales Sprint"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe the competition..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                          formData.metric === option.value
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-sm">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prize Description
                </label>
                <input
                  type="text"
                  value={formData.prizeDescription}
                  onChange={(e) => setFormData({ ...formData, prizeDescription: e.target.value })}
                  placeholder="e.g., $500 bonus, Gift card, etc."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prize Value ($)
                </label>
                <input
                  type="number"
                  value={formData.prizeValueCents}
                  onChange={(e) => setFormData({ ...formData, prizeValueCents: e.target.value })}
                  placeholder="500"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoEnrollAll"
                  checked={formData.autoEnrollAll}
                  onChange={(e) => setFormData({ ...formData, autoEnrollAll: e.target.checked })}
                  className="w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                />
                <label htmlFor="autoEnrollAll" className="text-sm text-gray-700">
                  Auto-enroll all active affiliates
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-900">{selectedCompetition.name}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[selectedCompetition.status].bg} ${STATUS_COLORS[selectedCompetition.status].text}`}>
                      {selectedCompetition.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {formatDate(selectedCompetition.startDate)} - {formatDate(selectedCompetition.endDate)}
                  </p>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Competition Info */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Metric</p>
                  <p className="font-medium text-gray-900">{getMetricLabel(selectedCompetition.metric)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Participants</p>
                  <p className="font-medium text-gray-900">{selectedCompetition.participantCount}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Prize</p>
                  <p className="font-medium text-gray-900">
                    {selectedCompetition.prizeDescription || 'None'}
                  </p>
                </div>
              </div>

              {/* Standings */}
              <h3 className="font-semibold text-gray-900 mb-3">Current Standings</h3>
              {selectedCompetition.standings.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No participants yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedCompetition.standings.map((entry, index) => (
                    <div
                      key={entry.affiliateId}
                      className={`flex items-center justify-between p-3 rounded-lg ${
                        index === 0 ? 'bg-amber-50' :
                        index === 1 ? 'bg-gray-100' :
                        index === 2 ? 'bg-orange-50' :
                        'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                          index === 0 ? 'bg-amber-200 text-amber-800' :
                          index === 1 ? 'bg-gray-200 text-gray-700' :
                          index === 2 ? 'bg-orange-200 text-orange-800' :
                          'bg-white text-gray-600'
                        }`}>
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
