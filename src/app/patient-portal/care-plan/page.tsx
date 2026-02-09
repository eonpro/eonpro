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
import NextLink from 'next/link';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';

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
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchCarePlan();
  }, []);

  const fetchCarePlan = async () => {
    setLoadError(null);
    try {
      const res = await portalFetch('/api/patient-portal/care-plan');
      const err = getPortalResponseError(res);
      if (err) {
        setLoadError(err);
        setLoading(false);
        return;
      }
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
      const res = await portalFetch('/api/patient-portal/care-plan/activity', {
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="flex-1 text-sm font-medium text-amber-900">{loadError}</p>
          <NextLink
            href={`/login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/care-plan`)}&reason=session_expired`}
            className="shrink-0 rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-300"
          >
            Log in
          </NextLink>
        </div>
      </div>
    );
  }

  if (!carePlan) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
          <FileText className="h-10 w-10 text-gray-400" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">No Care Plan Yet</h1>
        <p className="mb-6 text-gray-600">
          Your care team hasn&apos;t created a personalized care plan for you yet. This will be
          available after your initial consultation.
        </p>
        <NextLink
          href="/patient-portal/appointments"
          className="inline-flex items-center gap-2 rounded-xl px-6 py-3 font-medium text-white"
          style={{ backgroundColor: primaryColor }}
        >
          <Calendar className="h-5 w-5" />
          Book Consultation
        </NextLink>
      </div>
    );
  }

  const overallProgress =
    carePlan.goals.length > 0
      ? Math.round(carePlan.goals.reduce((sum, g) => sum + g.progress, 0) / carePlan.goals.length)
      : 0;

  return (
    <div className="mx-auto max-w-4xl p-4 pb-24 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{carePlan.name}</h1>
        <p className="mt-1 text-gray-600">{carePlan.description}</p>
      </div>

      {/* Progress Overview Card */}
      <div
        className="mb-6 rounded-2xl p-6 text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-white/80">Overall Progress</p>
            <p className="text-4xl font-bold">{overallProgress}%</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-white/80">Current Phase</p>
            <p className="text-lg font-semibold">{carePlan.phase}</p>
          </div>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-white/30">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {carePlan.nextMilestone && (
          <div className="mt-4 border-t border-white/20 pt-4">
            <p className="text-sm text-white/80">Next Milestone</p>
            <p className="font-medium">{carePlan.nextMilestone}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {[
          { id: 'overview', label: 'Overview', icon: FileText },
          { id: 'goals', label: 'Goals', icon: Target },
          { id: 'activities', label: 'Activities', icon: CheckCircle },
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

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <Target className="h-5 w-5 text-blue-500" />
                <span className="text-sm text-gray-600">Goals</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {carePlan.goals.filter((g) => g.status === 'COMPLETED').length} /{' '}
                {carePlan.goals.length}
              </p>
              <p className="text-sm text-gray-500">completed</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="mb-1 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm text-gray-600">Activities</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {carePlan.activities.filter((a) => a.status === 'COMPLETED').length}
              </p>
              <p className="text-sm text-gray-500">this week</p>
            </div>
          </div>

          {/* Provider Notes */}
          {carePlan.providerNotes && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                  <BookOpen className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">From Your Care Team</h3>
                  <p className="mt-1 text-sm text-gray-700">{carePlan.providerNotes}</p>
                </div>
              </div>
            </div>
          )}

          {/* Top Goals Preview */}
          <div>
            <h3 className="mb-3 font-semibold text-gray-900">Active Goals</h3>
            <div className="space-y-3">
              {carePlan.goals
                .filter((g) => g.status === 'IN_PROGRESS')
                .slice(0, 3)
                .map((goal) => (
                  <div key={goal.id} className="rounded-xl bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="font-medium text-gray-900">{goal.name}</h4>
                      <span className="text-sm font-semibold" style={{ color: primaryColor }}>
                        {goal.progress}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${goal.progress}%`, backgroundColor: primaryColor }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-gray-500">
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
            <div key={goal.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                    goal.status === 'COMPLETED' ? 'bg-green-100' : 'bg-blue-100'
                  }`}
                >
                  {goal.status === 'COMPLETED' ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <Target className="h-5 w-5 text-blue-600" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900">{goal.name}</h4>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
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
                  <p className="mt-1 text-sm text-gray-600">{goal.description}</p>

                  {goal.status !== 'COMPLETED' && (
                    <>
                      <div className="mt-3">
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="text-gray-600">
                            {goal.currentValue} / {goal.targetValue} {goal.unit}
                          </span>
                          <span className="font-medium" style={{ color: primaryColor }}>
                            {goal.progress}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${goal.progress}%`, backgroundColor: primaryColor }}
                          />
                        </div>
                      </div>
                      {goal.targetDate && (
                        <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
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
            <div key={activity.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => activity.status !== 'COMPLETED' && completeActivity(activity.id)}
                  disabled={activity.status === 'COMPLETED'}
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    activity.status === 'COMPLETED'
                      ? 'border-green-500 bg-green-500 text-white'
                      : 'border-gray-300 hover:border-green-500'
                  }`}
                >
                  {activity.status === 'COMPLETED' && <CheckCircle className="h-4 w-4" />}
                </button>
                <div className="flex-1">
                  <h4
                    className={`font-medium ${
                      activity.status === 'COMPLETED'
                        ? 'text-gray-500 line-through'
                        : 'text-gray-900'
                    }`}
                  >
                    {activity.name}
                  </h4>
                  <p className="mt-0.5 text-sm text-gray-600">{activity.description}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
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
