'use client';

/**
 * Achievements Page
 * Shows patient's achievements, streaks, points, and challenges
 */

import { useEffect, useState } from 'react';
import {
  Trophy,
  Flame,
  Star,
  Target,
  Medal,
  Zap,
  ChevronRight,
  Lock,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import Link from 'next/link';
import { portalFetch, getPortalResponseError, SESSION_EXPIRED_MESSAGE } from '@/lib/api/patient-portal-client';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { safeParseJson } from '@/lib/utils/safe-json';
import { logger } from '@/lib/logger';

interface Achievement {
  id: number;
  code: string;
  name: string;
  description: string;
  category: string;
  tier: string;
  icon: string | null;
  points: number;
  isUnlocked: boolean;
  progress: number;
  unlockedAt?: string;
}

interface StreakInfo {
  streakType: string;
  currentStreak: number;
  longestStreak: number;
  isActive: boolean;
  freezesRemaining: number;
}

interface PointsInfo {
  totalPoints: number;
  currentLevel: number;
  levelName: string;
  pointsToNextLevel: number;
  levelProgress: number;
}

interface Challenge {
  id: number;
  name: string;
  description: string;
  targetValue: number;
  targetUnit: string;
  currentProgress: number;
  isJoined: boolean;
  isCompleted: boolean;
  daysRemaining: number;
  participantCount: number;
  points: number;
}

// Tier colors
const TIER_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  BRONZE: { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-700' },
  SILVER: { bg: 'bg-gray-100', border: 'border-gray-400', text: 'text-gray-700' },
  GOLD: { bg: 'bg-yellow-100', border: 'border-yellow-500', text: 'text-yellow-700' },
  PLATINUM: { bg: 'bg-slate-100', border: 'border-slate-400', text: 'text-slate-700' },
  DIAMOND: { bg: 'bg-cyan-100', border: 'border-cyan-400', text: 'text-cyan-700' },
};

// Streak type icons and names
const STREAK_INFO: Record<string, { icon: typeof Flame; name: string; color: string }> = {
  WEIGHT_LOG: { icon: TrendingUp, name: 'Weight Logging', color: 'text-green-500' },
  WATER_LOG: { icon: Zap, name: 'Hydration', color: 'text-blue-500' },
  EXERCISE_LOG: { icon: Target, name: 'Exercise', color: 'text-orange-500' },
  DAILY_CHECK_IN: { icon: CheckCircle, name: 'Check-in', color: 'text-[var(--brand-primary)]' },
  MEDICATION_TAKEN: { icon: Medal, name: 'Medication', color: 'text-pink-500' },
};

export default function AchievementsPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [activeTab, setActiveTab] = useState<'achievements' | 'streaks' | 'challenges'>(
    'achievements'
  );
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [streaks, setStreaks] = useState<StreakInfo[]>([]);
  const [points, setPoints] = useState<PointsInfo | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setError(null);
      const [achievementsRes, streaksRes, pointsRes, challengesRes] = await Promise.all([
        portalFetch('/api/patient-portal/gamification/achievements'),
        portalFetch('/api/patient-portal/gamification/streaks'),
        portalFetch('/api/patient-portal/gamification/points'),
        portalFetch('/api/patient-portal/gamification/challenges'),
      ]);
      const sessionErr =
        getPortalResponseError(achievementsRes) ??
        getPortalResponseError(streaksRes) ??
        getPortalResponseError(pointsRes) ??
        getPortalResponseError(challengesRes);
      if (sessionErr) {
        setError(sessionErr);
        setLoading(false);
        return;
      }

      if (achievementsRes.ok) {
        const data = await safeParseJson(achievementsRes);
        setAchievements(
          data !== null && typeof data === 'object' && 'achievements' in data
            ? ((data as { achievements?: Achievement[] }).achievements ?? [])
            : []
        );
      }

      if (streaksRes.ok) {
        const data = await safeParseJson(streaksRes);
        setStreaks(
          data !== null && typeof data === 'object' && 'streaks' in data
            ? ((data as { streaks?: StreakInfo[] }).streaks ?? [])
            : []
        );
      }

      if (pointsRes.ok) {
        const data = await safeParseJson(pointsRes);
        setPoints(
          data !== null && typeof data === 'object' && 'points' in data
            ? ((data as { points?: PointsInfo }).points ?? null)
            : null
        );
      }

      if (challengesRes.ok) {
        const data = await safeParseJson(challengesRes);
        setChallenges(
          data !== null && typeof data === 'object' && 'challenges' in data
            ? ((data as { challenges?: Challenge[] }).challenges ?? [])
            : []
        );
      }
    } catch (error) {
      logger.error('Failed to fetch gamification data', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      setError('Failed to load achievements. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const joinChallenge = async (challengeId: number) => {
    try {
      const res = await portalFetch('/api/patient-portal/gamification/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', challengeId }),
      });

      if (res.ok) {
        setChallenges((prev) =>
          prev.map((c) =>
            c.id === challengeId
              ? { ...c, isJoined: true, participantCount: c.participantCount + 1 }
              : c
          )
        );
      }
    } catch (error) {
      logger.error('Failed to join challenge', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
    }
  };

  const categories = [...new Set(achievements.map((a) => a.category))];
  const filteredAchievements = selectedCategory
    ? achievements.filter((a) => a.category === selectedCategory)
    : achievements;

  const unlockedCount = achievements.filter((a) => a.isUnlocked).length;
  const totalPoints = achievements
    .filter((a) => a.isUnlocked)
    .reduce((sum, a) => sum + a.points, 0);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    const isSessionExpired = error === SESSION_EXPIRED_MESSAGE;
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div
          className={`max-w-md rounded-lg border p-4 text-center ${
            isSessionExpired ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          <Trophy className={`mx-auto mb-3 h-12 w-12 ${isSessionExpired ? 'text-amber-300' : 'text-red-300'}`} />
          <p className="mb-2 font-medium">
            {isSessionExpired ? 'Session Expired' : 'Error Loading Achievements'}
          </p>
          <p className="text-sm">{error}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {isSessionExpired ? (
              <Link
                href={`/login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/achievements`)}&reason=session_expired`}
                className="rounded-lg bg-amber-200 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-300"
              >
                Log in
              </Link>
            ) : (
              <button
                onClick={() => {
                  setLoading(true);
                  fetchData();
                }}
                className="rounded-lg bg-red-100 px-4 py-2 text-sm font-medium transition-colors hover:bg-red-200"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 pb-24 md:p-6">
      {/* Header with Points */}
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Achievements</h1>
        <p className="text-gray-600">Track your progress and earn rewards</p>
      </div>

      {/* Points Card */}
      {points && (
        <div
          className="mb-6 rounded-2xl p-6 text-white"
          style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-white/80">Total Points</p>
              <p className="text-3xl font-bold">{points.totalPoints.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-white/80">Level {points.currentLevel}</p>
              <p className="text-xl font-semibold">{points.levelName}</p>
            </div>
          </div>

          {/* Level Progress */}
          {points.pointsToNextLevel > 0 && (
            <div>
              <div className="mb-1 flex justify-between text-sm text-white/80">
                <span>Progress to next level</span>
                <span>{points.pointsToNextLevel} pts to go</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full rounded-full bg-white transition-all"
                  style={{ width: `${points.levelProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {[
          { id: 'achievements', label: 'Achievements', icon: Trophy },
          { id: 'streaks', label: 'Streaks', icon: Flame },
          { id: 'challenges', label: 'Challenges', icon: Target },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 font-medium transition-colors ${
              activeTab === tab.id ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={activeTab === tab.id ? { backgroundColor: primaryColor } : {}}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Achievements Tab */}
      {activeTab === 'achievements' && (
        <div>
          {/* Stats */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                <span className="text-sm text-gray-600">Unlocked</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {unlockedCount} / {achievements.length}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <Star className="h-5 w-5 text-[var(--brand-primary)]" />
                <span className="text-sm text-gray-600">Points Earned</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{totalPoints}</p>
            </div>
          </div>

          {/* Category Filter */}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                !selectedCategory ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                  selectedCategory === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {cat.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Achievement Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {filteredAchievements.map((achievement) => {
              const tierColor = TIER_COLORS[achievement.tier] || TIER_COLORS.BRONZE;

              return (
                <div
                  key={achievement.id}
                  className={`rounded-xl border-2 bg-white p-4 shadow-sm transition-all ${
                    achievement.isUnlocked
                      ? `${tierColor.border} ${tierColor.bg}`
                      : 'border-gray-100 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                        achievement.isUnlocked ? tierColor.bg : 'bg-gray-100'
                      }`}
                    >
                      {achievement.isUnlocked ? (
                        <Trophy className={`h-6 w-6 ${tierColor.text}`} />
                      ) : (
                        <Lock className="h-6 w-6 text-gray-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold text-gray-900">{achievement.name}</h3>
                        {achievement.isUnlocked && (
                          <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-500" />
                        )}
                      </div>
                      <p className="line-clamp-2 text-sm text-gray-600">
                        {achievement.description}
                      </p>

                      {/* Progress bar for locked achievements */}
                      {!achievement.isUnlocked && achievement.progress > 0 && (
                        <div className="mt-2">
                          <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${achievement.progress}%`,
                                backgroundColor: primaryColor,
                              }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            {achievement.progress}% complete
                          </p>
                        </div>
                      )}

                      <div className="mt-2 flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${tierColor.bg} ${tierColor.text}`}
                        >
                          {achievement.tier}
                        </span>
                        <span className="text-xs text-gray-500">+{achievement.points} pts</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Streaks Tab */}
      {activeTab === 'streaks' && (
        <div className="space-y-4">
          {streaks.length === 0 ? (
            <div className="rounded-2xl bg-white py-12 text-center">
              <Flame className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <h3 className="mb-1 font-semibold text-gray-900">No streaks yet</h3>
              <p className="text-sm text-gray-600">
                Start logging your activities to build streaks!
              </p>
            </div>
          ) : (
            streaks.map((streak) => {
              const info = STREAK_INFO[streak.streakType] || {
                icon: Flame,
                name: streak.streakType,
                color: 'text-gray-500',
              };
              const Icon = info.icon;

              return (
                <div key={streak.streakType} className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-xl ${
                        streak.isActive ? 'bg-orange-100' : 'bg-gray-100'
                      }`}
                    >
                      <Icon
                        className={`h-7 w-7 ${streak.isActive ? info.color : 'text-gray-400'}`}
                      />
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{info.name}</h3>
                        {streak.isActive && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-4">
                        <div>
                          <span className="text-2xl font-bold" style={{ color: primaryColor }}>
                            {streak.currentStreak}
                          </span>
                          <span className="ml-1 text-sm text-gray-600">day streak</span>
                        </div>
                        <div className="text-sm text-gray-500">
                          Best: {streak.longestStreak} days
                        </div>
                      </div>
                    </div>

                    {/* Freeze indicator */}
                    {streak.freezesRemaining > 0 && (
                      <div className="text-center">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                          <span className="text-sm font-bold text-blue-600">
                            {streak.freezesRemaining}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">Freeze</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Streak Tips */}
          <div className="rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 p-4">
            <h4 className="mb-2 font-semibold text-gray-900">Streak Tips</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <Flame className="mt-0.5 h-4 w-4 text-orange-500" />
                Log daily to build your streak
              </li>
              <li className="flex items-start gap-2">
                <Zap className="mt-0.5 h-4 w-4 text-yellow-500" />
                Use a streak freeze to save your progress if you miss a day
              </li>
              <li className="flex items-start gap-2">
                <Star className="mt-0.5 h-4 w-4 text-[var(--brand-primary)]" />
                Reach 7, 30, and 100 day milestones for bonus points!
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Challenges Tab */}
      {activeTab === 'challenges' && (
        <div className="space-y-4">
          {challenges.length === 0 ? (
            <div className="rounded-2xl bg-white py-12 text-center">
              <Target className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <h3 className="mb-1 font-semibold text-gray-900">No active challenges</h3>
              <p className="text-sm text-gray-600">Check back soon for new challenges!</p>
            </div>
          ) : (
            challenges.map((challenge) => (
              <div key={challenge.id} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-xl ${
                      challenge.isCompleted ? 'bg-green-100' : 'bg-blue-100'
                    }`}
                  >
                    {challenge.isCompleted ? (
                      <CheckCircle className="h-7 w-7 text-green-600" />
                    ) : (
                      <Target className="h-7 w-7 text-blue-600" />
                    )}
                  </div>

                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{challenge.name}</h3>
                    <p className="mt-0.5 text-sm text-gray-600">{challenge.description}</p>

                    {/* Progress */}
                    {challenge.isJoined && (
                      <div className="mt-3">
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-gray-600">
                            {challenge.currentProgress} / {challenge.targetValue}{' '}
                            {challenge.targetUnit}
                          </span>
                          <span className="font-medium" style={{ color: primaryColor }}>
                            {Math.round((challenge.currentProgress / challenge.targetValue) * 100)}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, (challenge.currentProgress / challenge.targetValue) * 100)}%`,
                              backgroundColor: challenge.isCompleted ? '#22c55e' : primaryColor,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-4">
                      <span className="text-sm text-gray-500">
                        {challenge.daysRemaining} days left
                      </span>
                      <span className="text-sm text-gray-500">
                        {challenge.participantCount} participants
                      </span>
                      <span className="text-sm font-medium text-[var(--brand-primary)]">
                        +{challenge.points} pts
                      </span>
                    </div>
                  </div>

                  {!challenge.isJoined && (
                    <button
                      onClick={() => joinChallenge(challenge.id)}
                      className="rounded-xl px-4 py-2 font-medium text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Join
                    </button>
                  )}

                  {challenge.isJoined && !challenge.isCompleted && (
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
