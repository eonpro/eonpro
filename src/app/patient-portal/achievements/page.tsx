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
  DAILY_CHECK_IN: { icon: CheckCircle, name: 'Check-in', color: 'text-purple-500' },
  MEDICATION_TAKEN: { icon: Medal, name: 'Medication', color: 'text-pink-500' },
};

export default function AchievementsPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [activeTab, setActiveTab] = useState<'achievements' | 'streaks' | 'challenges'>('achievements');
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [streaks, setStreaks] = useState<StreakInfo[]>([]);
  const [points, setPoints] = useState<PointsInfo | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [achievementsRes, streaksRes, pointsRes, challengesRes] = await Promise.all([
        fetch('/api/patient-portal/gamification/achievements'),
        fetch('/api/patient-portal/gamification/streaks'),
        fetch('/api/patient-portal/gamification/points'),
        fetch('/api/patient-portal/gamification/challenges'),
      ]);

      if (achievementsRes.ok) {
        const data = await achievementsRes.json();
        setAchievements(data.achievements || []);
      }

      if (streaksRes.ok) {
        const data = await streaksRes.json();
        setStreaks(data.streaks || []);
      }

      if (pointsRes.ok) {
        const data = await pointsRes.json();
        setPoints(data);
      }

      if (challengesRes.ok) {
        const data = await challengesRes.json();
        setChallenges(data.challenges || []);
      }
    } catch (error) {
      console.error('Failed to fetch gamification data:', error);
    } finally {
      setLoading(false);
    }
  };

  const joinChallenge = async (challengeId: number) => {
    try {
      const res = await fetch('/api/patient-portal/gamification/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', challengeId }),
      });

      if (res.ok) {
        setChallenges((prev) =>
          prev.map((c) =>
            c.id === challengeId ? { ...c, isJoined: true, participantCount: c.participantCount + 1 } : c
          )
        );
      }
    } catch (error) {
      console.error('Failed to join challenge:', error);
    }
  };

  const categories = [...new Set(achievements.map((a) => a.category))];
  const filteredAchievements = selectedCategory
    ? achievements.filter((a) => a.category === selectedCategory)
    : achievements;

  const unlockedCount = achievements.filter((a) => a.isUnlocked).length;
  const totalPoints = achievements.filter((a) => a.isUnlocked).reduce((sum, a) => sum + a.points, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-24">
      {/* Header with Points */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Achievements</h1>
        <p className="text-gray-600">Track your progress and earn rewards</p>
      </div>

      {/* Points Card */}
      {points && (
        <div
          className="rounded-2xl p-6 mb-6 text-white"
          style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-white/80 text-sm">Total Points</p>
              <p className="text-3xl font-bold">{points.totalPoints.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-white/80 text-sm">Level {points.currentLevel}</p>
              <p className="text-xl font-semibold">{points.levelName}</p>
            </div>
          </div>

          {/* Level Progress */}
          {points.pointsToNextLevel > 0 && (
            <div>
              <div className="flex justify-between text-sm text-white/80 mb-1">
                <span>Progress to next level</span>
                <span>{points.pointsToNextLevel} pts to go</span>
              </div>
              <div className="h-2 bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${points.levelProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {[
          { id: 'achievements', label: 'Achievements', icon: Trophy },
          { id: 'streaks', label: 'Streaks', icon: Flame },
          { id: 'challenges', label: 'Challenges', icon: Target },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={activeTab === tab.id ? { backgroundColor: primaryColor } : {}}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Achievements Tab */}
      {activeTab === 'achievements' && (
        <div>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <span className="text-gray-600 text-sm">Unlocked</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {unlockedCount} / {achievements.length}
              </p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-5 h-5 text-purple-500" />
                <span className="text-gray-600 text-sm">Points Earned</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{totalPoints}</p>
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${
                !selectedCategory ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${
                  selectedCategory === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {cat.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Achievement Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredAchievements.map((achievement) => {
              const tierColor = TIER_COLORS[achievement.tier] || TIER_COLORS.BRONZE;

              return (
                <div
                  key={achievement.id}
                  className={`bg-white rounded-xl p-4 shadow-sm border-2 transition-all ${
                    achievement.isUnlocked
                      ? `${tierColor.border} ${tierColor.bg}`
                      : 'border-gray-100 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        achievement.isUnlocked ? tierColor.bg : 'bg-gray-100'
                      }`}
                    >
                      {achievement.isUnlocked ? (
                        <Trophy className={`w-6 h-6 ${tierColor.text}`} />
                      ) : (
                        <Lock className="w-6 h-6 text-gray-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 truncate">{achievement.name}</h3>
                        {achievement.isUnlocked && (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{achievement.description}</p>

                      {/* Progress bar for locked achievements */}
                      {!achievement.isUnlocked && achievement.progress > 0 && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${achievement.progress}%`,
                                backgroundColor: primaryColor,
                              }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{achievement.progress}% complete</p>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-2">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${tierColor.bg} ${tierColor.text}`}
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
            <div className="text-center py-12 bg-white rounded-2xl">
              <Flame className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">No streaks yet</h3>
              <p className="text-gray-600 text-sm">Start logging your activities to build streaks!</p>
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
                <div key={streak.streakType} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                        streak.isActive ? 'bg-orange-100' : 'bg-gray-100'
                      }`}
                    >
                      <Icon className={`w-7 h-7 ${streak.isActive ? info.color : 'text-gray-400'}`} />
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{info.name}</h3>
                        {streak.isActive && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <div>
                          <span className="text-2xl font-bold" style={{ color: primaryColor }}>
                            {streak.currentStreak}
                          </span>
                          <span className="text-gray-600 text-sm ml-1">day streak</span>
                        </div>
                        <div className="text-sm text-gray-500">
                          Best: {streak.longestStreak} days
                        </div>
                      </div>
                    </div>

                    {/* Freeze indicator */}
                    {streak.freezesRemaining > 0 && (
                      <div className="text-center">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-blue-600 font-bold text-sm">{streak.freezesRemaining}</span>
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
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-4">
            <h4 className="font-semibold text-gray-900 mb-2">Streak Tips</h4>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <Flame className="w-4 h-4 text-orange-500 mt-0.5" />
                Log daily to build your streak
              </li>
              <li className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-yellow-500 mt-0.5" />
                Use a streak freeze to save your progress if you miss a day
              </li>
              <li className="flex items-start gap-2">
                <Star className="w-4 h-4 text-purple-500 mt-0.5" />
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
            <div className="text-center py-12 bg-white rounded-2xl">
              <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">No active challenges</h3>
              <p className="text-gray-600 text-sm">Check back soon for new challenges!</p>
            </div>
          ) : (
            challenges.map((challenge) => (
              <div key={challenge.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-start gap-4">
                  <div
                    className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                      challenge.isCompleted ? 'bg-green-100' : 'bg-blue-100'
                    }`}
                  >
                    {challenge.isCompleted ? (
                      <CheckCircle className="w-7 h-7 text-green-600" />
                    ) : (
                      <Target className="w-7 h-7 text-blue-600" />
                    )}
                  </div>

                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{challenge.name}</h3>
                    <p className="text-sm text-gray-600 mt-0.5">{challenge.description}</p>

                    {/* Progress */}
                    {challenge.isJoined && (
                      <div className="mt-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">
                            {challenge.currentProgress} / {challenge.targetValue} {challenge.targetUnit}
                          </span>
                          <span className="font-medium" style={{ color: primaryColor }}>
                            {Math.round((challenge.currentProgress / challenge.targetValue) * 100)}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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

                    <div className="flex items-center gap-4 mt-3">
                      <span className="text-sm text-gray-500">{challenge.daysRemaining} days left</span>
                      <span className="text-sm text-gray-500">{challenge.participantCount} participants</span>
                      <span className="text-sm font-medium text-purple-600">+{challenge.points} pts</span>
                    </div>
                  </div>

                  {!challenge.isJoined && (
                    <button
                      onClick={() => joinChallenge(challenge.id)}
                      className="px-4 py-2 rounded-xl font-medium text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      Join
                    </button>
                  )}

                  {challenge.isJoined && !challenge.isCompleted && (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
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
