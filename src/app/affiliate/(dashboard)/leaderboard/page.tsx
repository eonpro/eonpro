'use client';

/**
 * Affiliate Leaderboard Page
 *
 * Shows global rankings, active competitions, and the user's position.
 * Supports multiple metrics and time periods.
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Medal,
  Crown,
  TrendingUp,
  Clock,
  Users,
  MousePointer,
  ShoppingCart,
  DollarSign,
  Percent,
  UserPlus,
  ChevronDown,
  Star,
  Flame,
  Target,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface LeaderboardEntry {
  rank: number;
  affiliateId: number;
  displayName: string;
  value: number;
  formattedValue: string;
  isCurrentUser: boolean;
}

interface Competition {
  id: number;
  name: string;
  description: string | null;
  metric: string;
  startDate: string;
  endDate: string;
  status: string;
  prizeDescription: string | null;
  prizeValueCents: number | null;
  participantCount: number;
  isParticipating: boolean;
  myRank: number | null;
  myScore: number;
  myFormattedScore: string | null;
  timeRemainingMs: number | null;
  timeToStartMs: number | null;
  topParticipants: Array<{
    rank: number;
    displayName: string;
    value: number;
    formattedValue: string;
    isCurrentUser: boolean;
  }>;
}

interface CurrentUser {
  rank: number;
  value: number;
  totalParticipants: number;
  isOptedIn: boolean;
  leaderboardAlias: string | null;
}

const METRICS = [
  { value: 'CLICKS', label: 'Clicks', icon: MousePointer },
  { value: 'CONVERSIONS', label: 'Sales', icon: ShoppingCart },
  { value: 'REVENUE', label: 'Revenue', icon: DollarSign },
];

const PERIODS = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all_time', label: 'All Time' },
];

const formatTimeRemaining = (ms: number): string => {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(cents / 100);
};

// Rank badge component
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 shadow-lg shadow-amber-200">
        <Crown className="h-5 w-5 text-white" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gray-300 to-gray-400">
        <Medal className="h-5 w-5 text-white" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-300 to-orange-500">
        <Medal className="h-5 w-5 text-white" />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100">
      <span className="font-bold text-gray-600">{rank}</span>
    </div>
  );
}

export default function LeaderboardPage() {
  // State
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [competitions, setCompetitions] = useState<{
    active: Competition[];
    upcoming: Competition[];
  }>({
    active: [],
    upcoming: [],
  });
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState('CONVERSIONS');
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [showMetricDropdown, setShowMetricDropdown] = useState(false);
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);

  // Fetch leaderboard
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [leaderboardRes, competitionsRes] = await Promise.all([
          apiFetch(`/api/affiliate/leaderboard?metric=${selectedMetric}&period=${selectedPeriod}`),
          apiFetch('/api/affiliate/competitions'),
        ]);

        if (leaderboardRes.ok) {
          const data = await leaderboardRes.json();
          setLeaderboard(data.leaderboard || []);
          setCurrentUser(data.currentUser || null);
        }

        if (competitionsRes.ok) {
          const data = await competitionsRes.json();
          setCompetitions({
            active: data.active || [],
            upcoming: data.upcoming || [],
          });
        }
      } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedMetric, selectedPeriod]);

  const selectedMetricObj = METRICS.find((m) => m.value === selectedMetric) || METRICS[1];
  const selectedPeriodObj = PERIODS.find((p) => p.value === selectedPeriod) || PERIODS[1];
  const MetricIcon = selectedMetricObj.icon;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
              <Trophy className="h-5 w-5 text-amber-500" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">Leaderboard</h1>
          </div>
          <p className="text-gray-500">See how you rank against other partners</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
        {/* Your Position Card */}
        {currentUser && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 p-6 text-white"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="mb-1 text-sm text-gray-400">Your Position</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">#{currentUser.rank}</span>
                  <span className="text-gray-400">of {currentUser.totalParticipants}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="mb-1 text-sm text-gray-400">{selectedMetricObj.label}</p>
                <p className="text-2xl font-semibold">
                  {selectedMetric === 'REVENUE'
                    ? formatCurrency(currentUser.value)
                    : currentUser.value.toLocaleString()}
                </p>
              </div>
            </div>

            {!currentUser.isOptedIn && (
              <div className="mt-4 border-t border-gray-700 pt-4">
                <p className="text-sm text-gray-400">
                  You're shown as "Partner #{currentUser.rank}" on the public leaderboard.
                </p>
                <Link
                  href="/affiliate/account"
                  className="mt-2 inline-block text-sm text-amber-400 hover:text-amber-300"
                >
                  Opt in to show your name →
                </Link>
              </div>
            )}
          </motion.div>
        )}

        {/* Active Competitions */}
        {competitions.active.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Flame className="h-5 w-5 text-orange-500" />
              Active Competitions
            </h2>
            <div className="space-y-3">
              {competitions.active.map((comp) => (
                <div key={comp.id} className="rounded-2xl border border-gray-100 bg-white p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{comp.name}</h3>
                      <p className="mt-1 text-sm text-gray-500">{comp.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm font-medium text-orange-500">
                        <Clock className="h-4 w-4" />
                        {comp.timeRemainingMs
                          ? formatTimeRemaining(comp.timeRemainingMs)
                          : 'Ending soon'}
                      </div>
                      {comp.prizeDescription && (
                        <p className="mt-1 flex items-center justify-end gap-1 text-xs text-amber-600">
                          <Trophy className="h-3 w-3" />
                          {comp.prizeDescription}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* My standing */}
                  {comp.isParticipating && (
                    <div className="mb-4 rounded-xl bg-green-50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-green-700">Your Rank</span>
                        <span className="font-bold text-green-900">
                          #{comp.myRank || '-'} • {comp.myFormattedScore}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Top 3 */}
                  <div className="space-y-2">
                    {comp.topParticipants.map((entry) => (
                      <div
                        key={entry.rank}
                        className={`flex items-center justify-between rounded-lg p-2 ${
                          entry.isCurrentUser ? 'bg-amber-50' : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <RankBadge rank={entry.rank} />
                          <span
                            className={`font-medium ${entry.isCurrentUser ? 'text-amber-900' : 'text-gray-900'}`}
                          >
                            {entry.displayName}
                            {entry.isCurrentUser && ' (You)'}
                          </span>
                        </div>
                        <span className="font-semibold text-gray-900">{entry.formattedValue}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Upcoming Competitions */}
        {competitions.upcoming.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Target className="h-5 w-5 text-blue-500" />
              Upcoming Competitions
            </h2>
            <div className="space-y-3">
              {competitions.upcoming.map((comp) => (
                <div
                  key={comp.id}
                  className="rounded-2xl border border-gray-100 bg-white p-5 opacity-75"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{comp.name}</h3>
                      <p className="mt-1 text-sm text-gray-500">{comp.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm font-medium text-blue-500">
                        <Clock className="h-4 w-4" />
                        Starts in{' '}
                        {comp.timeToStartMs ? formatTimeRemaining(comp.timeToStartMs) : 'soon'}
                      </div>
                      {comp.prizeDescription && (
                        <p className="mt-1 flex items-center justify-end gap-1 text-xs text-amber-600">
                          <Trophy className="h-3 w-3" />
                          {comp.prizeDescription}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Global Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl bg-white"
        >
          {/* Filters */}
          <div className="border-b border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Global Rankings</h2>
              <div className="flex gap-2">
                {/* Metric Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowMetricDropdown(!showMetricDropdown);
                      setShowPeriodDropdown(false);
                    }}
                    className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                  >
                    <MetricIcon className="h-4 w-4" />
                    {selectedMetricObj.label}
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  {showMetricDropdown && (
                    <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
                      {METRICS.map((metric) => {
                        const Icon = metric.icon;
                        return (
                          <button
                            key={metric.value}
                            onClick={() => {
                              setSelectedMetric(metric.value);
                              setShowMetricDropdown(false);
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                              selectedMetric === metric.value
                                ? 'font-medium text-gray-900'
                                : 'text-gray-600'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            {metric.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Period Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowPeriodDropdown(!showPeriodDropdown);
                      setShowMetricDropdown(false);
                    }}
                    className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                  >
                    {selectedPeriodObj.label}
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  {showPeriodDropdown && (
                    <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-100 bg-white py-1 shadow-lg">
                      {PERIODS.map((period) => (
                        <button
                          key={period.value}
                          onClick={() => {
                            setSelectedPeriod(period.value);
                            setShowPeriodDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                            selectedPeriod === period.value
                              ? 'font-medium text-gray-900'
                              : 'text-gray-600'
                          }`}
                        >
                          {period.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Leaderboard List */}
          <div className="divide-y divide-gray-100">
            {leaderboard.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                <p className="text-gray-500">No rankings yet for this period</p>
              </div>
            ) : (
              leaderboard.map((entry, index) => (
                <motion.div
                  key={entry.affiliateId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={`flex items-center justify-between p-4 ${
                    entry.isCurrentUser ? 'bg-amber-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <RankBadge rank={entry.rank} />
                    <div>
                      <p
                        className={`font-medium ${entry.isCurrentUser ? 'text-amber-900' : 'text-gray-900'}`}
                      >
                        {entry.displayName}
                        {entry.isCurrentUser && (
                          <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-800">
                            You
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="font-semibold text-gray-900">{entry.formattedValue}</span>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
