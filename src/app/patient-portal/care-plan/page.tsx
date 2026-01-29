'use client';

/**
 * Patient Care Plan Page
 * Shows the patient's personalized care plan with goals, activities, and progress
 */

import { useEffect, useState } from 'react';
import {
  Target,
  CheckCircle,
  Clock,
  ChevronRight,
  FileText,
  Calendar,
  TrendingUp,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import Link from 'next/link';

interface CarePlanGoal {
  id: number;
  name: string;
  description: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  targetDate: string | null;
  status: string;
  progress: number;
}

interface CarePlanActivity {
  id: number;
  name: string;
  description: string;
  frequency: string;
  status: string;
  lastCompletedAt: string | null;
}

interface CarePlan {
  id: number;
  name: string;
  description: string;
  status: string;
  startDate: string;
  endDate: string | null;
  phase: string;
  goals: CarePlanGoal[];
  activities: CarePlanActivity[];
  nextMilestone: string | null;
  providerNotes: string | null;
}

export default function CarePlanPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [carePlan, setCarePlan] = useState<CarePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'goals' | 'activities'>('overview');

  useEffect(() => {
    fetchCarePlan();
  }, []);

  const fetchCarePlan = async () => {
    try {
      const res = await fetch('/api/patient-portal/care-plan');
      if (res.ok) {
        const data = await res.json();
        setCarePlan(data.carePlan);
      }
    } catch (error) {
      console.error('Failed to fetch care plan:', error);
    } finally {
      setLoading(false);
    }
  };

  const completeActivity = async (activityId: number) => {
    try {
      const res = await fetch('/api/patient-portal/care-plan/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId, action: 'complete' }),
      });

      if (res.ok) {
        fetchCarePlan(); // Refresh
      }
    } catch (error) {
      console.error('Failed to complete activity:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!carePlan) {
    return (
      <div className="p-6 max-w-2xl mx-auto text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center">
          <FileText className="w-10 h-10 text-gray-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">No Care Plan Yet</h1>
        <p className="text-gray-600 mb-6">
          Your care team hasn&apos;t created a personalized care plan for you yet. This will be
          available after your initial consultation.
        </p>
        <Link
          href="/patient-portal/appointments"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white"
          style={{ backgroundColor: primaryColor }}
        >
          <Calendar className="w-5 h-5" />
          Book Consultation
        </Link>
      </div>
    );
  }

  const overallProgress =
    carePlan.goals.length > 0
      ? Math.round(carePlan.goals.reduce((sum, g) => sum + g.progress, 0) / carePlan.goals.length)
      : 0;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{carePlan.name}</h1>
        <p className="text-gray-600 mt-1">{carePlan.description}</p>
      </div>

      {/* Progress Overview Card */}
      <div
        className="rounded-2xl p-6 mb-6 text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white/80 text-sm">Overall Progress</p>
            <p className="text-4xl font-bold">{overallProgress}%</p>
          </div>
          <div className="text-right">
            <p className="text-white/80 text-sm">Current Phase</p>
            <p className="text-lg font-semibold">{carePlan.phase}</p>
          </div>
        </div>

        <div className="h-3 bg-white/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all"
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {carePlan.nextMilestone && (
          <div className="mt-4 pt-4 border-t border-white/20">
            <p className="text-white/80 text-sm">Next Milestone</p>
            <p className="font-medium">{carePlan.nextMilestone}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {[
          { id: 'overview', label: 'Overview', icon: FileText },
          { id: 'goals', label: 'Goals', icon: Target },
          { id: 'activities', label: 'Activities', icon: CheckCircle },
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

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-5 h-5 text-blue-500" />
                <span className="text-gray-600 text-sm">Goals</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {carePlan.goals.filter((g) => g.status === 'COMPLETED').length} / {carePlan.goals.length}
              </p>
              <p className="text-sm text-gray-500">completed</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-gray-600 text-sm">Activities</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {carePlan.activities.filter((a) => a.status === 'COMPLETED').length}
              </p>
              <p className="text-sm text-gray-500">this week</p>
            </div>
          </div>

          {/* Provider Notes */}
          {carePlan.providerNotes && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">From Your Care Team</h3>
                  <p className="text-gray-700 text-sm mt-1">{carePlan.providerNotes}</p>
                </div>
              </div>
            </div>
          )}

          {/* Top Goals Preview */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Active Goals</h3>
            <div className="space-y-3">
              {carePlan.goals
                .filter((g) => g.status === 'IN_PROGRESS')
                .slice(0, 3)
                .map((goal) => (
                  <div key={goal.id} className="bg-white rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900">{goal.name}</h4>
                      <span className="text-sm font-semibold" style={{ color: primaryColor }}>
                        {goal.progress}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${goal.progress}%`, backgroundColor: primaryColor }}
                      />
                    </div>
                    <p className="text-sm text-gray-500 mt-2">
                      {goal.currentValue} / {goal.targetValue} {goal.unit}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Goals Tab */}
      {activeTab === 'goals' && (
        <div className="space-y-4">
          {carePlan.goals.map((goal) => (
            <div key={goal.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                    goal.status === 'COMPLETED' ? 'bg-green-100' : 'bg-blue-100'
                  }`}
                >
                  {goal.status === 'COMPLETED' ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <Target className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900">{goal.name}</h4>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${
                        goal.status === 'COMPLETED'
                          ? 'bg-green-100 text-green-700'
                          : goal.status === 'IN_PROGRESS'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {goal.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{goal.description}</p>

                  {goal.status !== 'COMPLETED' && (
                    <>
                      <div className="mt-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">
                            {goal.currentValue} / {goal.targetValue} {goal.unit}
                          </span>
                          <span className="font-medium" style={{ color: primaryColor }}>
                            {goal.progress}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${goal.progress}%`, backgroundColor: primaryColor }}
                          />
                        </div>
                      </div>
                      {goal.targetDate && (
                        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Target: {new Date(goal.targetDate).toLocaleDateString()}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activities Tab */}
      {activeTab === 'activities' && (
        <div className="space-y-4">
          {carePlan.activities.map((activity) => (
            <div key={activity.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => activity.status !== 'COMPLETED' && completeActivity(activity.id)}
                  disabled={activity.status === 'COMPLETED'}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    activity.status === 'COMPLETED'
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 hover:border-green-500'
                  }`}
                >
                  {activity.status === 'COMPLETED' && <CheckCircle className="w-4 h-4" />}
                </button>
                <div className="flex-1">
                  <h4
                    className={`font-medium ${
                      activity.status === 'COMPLETED' ? 'text-gray-500 line-through' : 'text-gray-900'
                    }`}
                  >
                    {activity.name}
                  </h4>
                  <p className="text-sm text-gray-600 mt-0.5">{activity.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {activity.frequency}
                    </span>
                    {activity.lastCompletedAt && (
                      <span>Last: {new Date(activity.lastCompletedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
