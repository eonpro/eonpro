'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';
import { safeParseJson, safeParseJsonString } from '@/lib/utils/safe-json';
import { getMinimalPortalUserPayload, setPortalUserStorage } from '@/lib/utils/portal-user-storage';
import { logger } from '@/lib/logger';
import {
  Scale,
  TrendingDown,
  TrendingUp,
  Package,
  Pill,
  Calculator,
  BookOpen,
  ChevronRight,
  Clock,
  Activity,
  Bell,
  Ruler,
  Zap,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Video,
  Calendar,
  MapPin,
  Phone,
  CreditCard,
} from 'lucide-react';
import { useClinicBranding, usePortalFeatures } from '@/lib/contexts/ClinicBrandingContext';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import dynamic from 'next/dynamic';

const ActiveShipmentTracker = dynamic(
  () => import('@/components/patient-portal/ActiveShipmentTracker'),
  {
    ssr: false,
    loading: () => <div className="mb-6 h-[104px]" />,
  }
);
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { getPortalMode } from '@/lib/patient-portal/portal-mode';
import type { PortalMode } from '@/lib/patient-portal/types';

const LeadDashboard = dynamic(() => import('./lead-dashboard'), {
  ssr: false,
  loading: () => (
    <div className="min-h-[60dvh] animate-pulse space-y-4 p-4">
      <div className="h-8 w-48 rounded-lg bg-gray-200" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl bg-gray-100" />
        ))}
      </div>
    </div>
  ),
});

interface WeightEntry {
  dateInput: string;
  currentWeightInput: number;
}

interface IntakeVitals {
  height: string | null;
  weight: string | null;
  bmi: string | null;
}

interface PortalUserMinimal {
  id?: number;
  role?: string;
  patientId?: number;
}

interface NextReminderDisplay {
  medication: string;
  nextDose: string;
  time: string;
}

interface RecentShipmentDisplay {
  orderNumber?: string;
  status?: string;
  statusLabel?: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
  carrier?: string;
  [key: string]: unknown;
}

export default function PatientPortalDashboard() {
  const router = useRouter();
  const { branding } = useClinicBranding();
  const features = usePortalFeatures();
  const { t, language } = usePatientPortalLanguage();

  const [patient, setPatient] = useState<PortalUserMinimal | null>(null);
  const [displayName, setDisplayName] = useState<string>('Patient');
  const [weightData, setWeightData] = useState<WeightEntry[]>([]);
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [weightChange, setWeightChange] = useState<number | null>(null);
  const [recentShipment, setRecentShipment] = useState<RecentShipmentDisplay | null>(null);
  const [nextReminder, setNextReminder] = useState<NextReminderDisplay | null>(null);
  const [intakeVitals, setIntakeVitals] = useState<IntakeVitals | null>(null);
  const [photoStats, setPhotoStats] = useState<{
    totalPhotos: number;
    recentPhoto: string | null;
    idVerificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'NOT_SUBMITTED' | null;
  } | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [portalMode, setPortalMode] = useState<PortalMode | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [upcomingVideoVisit, setUpcomingVideoVisit] = useState<{
    id: number;
    title: string;
    startTime: string;
    providerName?: string;
    zoomJoinUrl?: string;
    videoLink?: string;
  } | null>(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState<
    Array<{
      id: number;
      title: string;
      startTime: string;
      type: string;
      providerName?: string;
      status: string;
    }>
  >([]);
  const [membershipPlan, setMembershipPlan] = useState<{
    planName: string;
    status: string;
    amount: number;
    interval: string;
    nextBillingDate: string | null;
  } | null>(null);

  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  const weightCardTextColor = (() => {
    const hex = accentColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.5 ? '#1f2937' : '#ffffff';
  })();

  useEffect(() => {
    // SSR guard - only access localStorage on client
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const run = async () => {
      try {
        const userJson = localStorage.getItem('user');
        if (!userJson) {
          if (!cancelled)
            router.replace(
              `/patient-login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=no_session`
            );
          return;
        }

        const userData = safeParseJsonString<{ patientId?: number; role?: string }>(userJson);
        if (!userData) {
          if (!cancelled)
            router.replace(
              `/patient-login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=invalid_session`
            );
          return;
        }
        if (!cancelled) setPatient(userData);

        // CRITICAL: Use patientId only (never user.id) so we load the correct patient's weight/overview
        let patientId: number | null = userData.patientId ?? null;
        if (patientId == null && userData.role?.toLowerCase() === 'patient') {
          const meRes = await portalFetch('/api/auth/me');
          if (meRes.ok && !cancelled) {
            const meData = await safeParseJson(meRes);
            const data = meData as { user?: { patientId?: number } } | null;
            const pid = data?.user?.patientId;
            if (typeof pid === 'number' && pid > 0) {
              patientId = pid;
              const updated = { ...userData, patientId: pid };
              setPortalUserStorage(getMinimalPortalUserPayload(updated));
              if (!cancelled) setPatient(updated);
            }
          }
        }

        if (cancelled) return;
        if (patientId != null && patientId > 0) {
          loadPatientData(patientId);
        } else {
          setDashboardLoading(false);
        }
      } catch (error) {
        logger.error('PatientPortal: failed to load user data', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
        if (!cancelled)
          router.replace(
            `/patient-login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=invalid_session`
          );
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!patient) return;
    let cancelled = false;
    portalFetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.user) return;
        const name = `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim();
        if (name) setDisplayName(name);
      })
      .catch((err) => {
        logger.warn('Failed to fetch user profile for display name', {
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [patient?.id]);

  // Detect portal mode (lead vs patient)
  useEffect(() => {
    if (!patient?.patientId) return;
    let cancelled = false;
    portalFetch('/api/patient-portal/profile/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const mode = getPortalMode(data.profileStatus ?? 'ACTIVE', data.hasCompletedIntake ?? true);
        setPortalMode(mode);
      })
      .catch(() => {
        if (!cancelled) setPortalMode('patient');
      });
    return () => {
      cancelled = true;
    };
  }, [patient?.patientId]);

  const loadPatientData = useCallback(
    async (patientId: number) => {
      setDataError(null);
      try {
        const [vitalsRes, weightRes, remindersRes, trackingRes, photosRes] = await Promise.all([
          portalFetch('/api/patient-portal/vitals'),
          portalFetch(`/api/patient-progress/weight?patientId=${patientId}`),
          portalFetch(`/api/patient-progress/medication-reminders?patientId=${patientId}`),
          portalFetch('/api/patient-portal/tracking').catch(() => null),
          portalFetch('/api/patient-portal/photos').catch(() => null),
        ]);

        portalFetch('/api/patient-portal/billing')
          .then(async (res) => {
            if (!res.ok) return;
            const data = await safeParseJson(res);
            if (data && typeof data === 'object' && 'subscription' in data) {
              const sub = (data as { subscription?: Record<string, unknown> }).subscription;
              if (sub) {
                const amountCents = typeof sub.amount === 'number' ? sub.amount : 0;
                setMembershipPlan({
                  planName: String(sub.planName || 'Subscription'),
                  status: String(sub.status || 'active'),
                  amount: amountCents / 100,
                  interval: String(sub.interval || 'month'),
                  nextBillingDate: (sub.currentPeriodEnd || sub.nextBillingDate || null) as string | null,
                });
              }
            }
          })
          .catch(() => {});

        portalFetch('/api/patient-portal/appointments?upcoming=true&type=VIDEO&limit=1')
          .then(async (res) => {
            if (!res.ok) return;
            const data = await res.json();
            const appts = data.appointments ?? data.data ?? [];
            if (appts.length > 0) {
              const apt = appts[0];
              const startTime = new Date(apt.startTime);
              const hoursUntil = (startTime.getTime() - Date.now()) / (1000 * 60 * 60);
              if (hoursUntil > 0 && hoursUntil <= 24) {
                setUpcomingVideoVisit({
                  id: apt.id,
                  title: apt.title || apt.reason || 'Video Consultation',
                  startTime: apt.startTime,
                  providerName:
                    apt.providerName ??
                    (apt.provider
                      ? `${apt.provider.firstName} ${apt.provider.lastName}`
                      : undefined),
                  zoomJoinUrl: apt.zoomJoinUrl,
                  videoLink: apt.videoLink,
                });
              }
            }
          })
          .catch(() => {});

        portalFetch('/api/patient-portal/appointments?upcoming=true')
          .then(async (res) => {
            if (!res.ok) return;
            const data = await res.json();
            const appts = (data.appointments ?? data.data ?? []).slice(0, 3);
            setUpcomingAppointments(
              appts.map((apt: any) => ({
                id: apt.id,
                title: apt.title || apt.reason || 'Appointment',
                startTime: apt.startTime,
                type: apt.type || 'IN_PERSON',
                providerName:
                  apt.providerName ??
                  (apt.provider ? `${apt.provider.firstName} ${apt.provider.lastName}` : undefined),
                status: apt.status || 'SCHEDULED',
              }))
            );
          })
          .catch(() => {});

        const authErr =
          getPortalResponseError(vitalsRes) ||
          getPortalResponseError(weightRes) ||
          getPortalResponseError(remindersRes);
        if (authErr) {
          setDataError(authErr);
          return;
        }

        // --- Vitals ---
        if (vitalsRes.ok) {
          const result = await safeParseJson(vitalsRes);
          if (
            result &&
            typeof result === 'object' &&
            'success' in result &&
            result.success &&
            'data' in result &&
            result.data
          ) {
            const vitals = result.data as IntakeVitals;
            if (vitals.bmi) {
              const bmiNum = parseFloat(vitals.bmi);
              if (isNaN(bmiNum) || bmiNum < 10 || bmiNum > 100) {
                vitals.bmi = null;
              }
            }
            setIntakeVitals(vitals);
          }
        }

        // --- Weight ---
        if (weightRes.ok) {
          const result = await safeParseJson(weightRes);
          const logs = Array.isArray(result)
            ? result
            : (result && typeof result === 'object' && 'data' in result
                ? (result as { data?: unknown[] }).data
                : null) || [];
          interface WeightLog {
            recordedAt?: string;
            weight?: number;
          }
          const formattedData = (logs as WeightLog[]).map((log) => ({
            dateInput: log.recordedAt ?? '',
            currentWeightInput: log.weight ?? 0,
          }));
          setWeightData(formattedData);

          if (formattedData.length > 0) {
            const sorted = [...formattedData].sort(
              (a, b) => new Date(b.dateInput).getTime() - new Date(a.dateInput).getTime()
            );
            setCurrentWeight(sorted[0].currentWeightInput);

            if (sorted.length > 1) {
              setWeightChange(
                sorted[0].currentWeightInput - sorted[sorted.length - 1].currentWeightInput
              );
            }
          }
        }

        // --- Reminders ---
        if (remindersRes.ok) {
          const result = await safeParseJson(remindersRes);
          const reminders = Array.isArray(result)
            ? result
            : (result && typeof result === 'object' && 'data' in result
                ? (result as { data?: unknown[] }).data
                : null) || [];
          if (reminders.length > 0) {
            const dayNames = [
              'Sunday',
              'Monday',
              'Tuesday',
              'Wednesday',
              'Thursday',
              'Friday',
              'Saturday',
            ];
            const today = new Date().getDay();
            interface ReminderWithDays {
              dayOfWeek: number;
              medicationName: string;
              timeOfDay: string;
              daysUntil: number;
            }
            const sortedReminders = (reminders as ReminderWithDays[])
              .map((r) => ({ ...r, daysUntil: (r.dayOfWeek - today + 7) % 7 || 7 }))
              .sort((a, b) => a.daysUntil - b.daysUntil);
            const next = sortedReminders[0];
            setNextReminder({
              medication: next.medicationName.split(' ')[0],
              nextDose: dayNames[next.dayOfWeek],
              time: next.timeOfDay,
            });
          }
        }

        // --- Tracking (non-critical) ---
        if (trackingRes?.ok) {
          const trackingResult = await safeParseJson(trackingRes);
          if (
            trackingResult &&
            typeof trackingResult === 'object' &&
            'activeShipments' in trackingResult
          ) {
            const active = (trackingResult as { activeShipments: RecentShipmentDisplay[] })
              .activeShipments;
            if (Array.isArray(active) && active.length > 0) {
              setRecentShipment(active[0]);
            }
          }
        }

        // --- Photos (non-critical) ---
        if (photosRes?.ok) {
          const photosResult = await safeParseJson(photosRes);
          if (
            photosResult &&
            typeof photosResult === 'object' &&
            'success' in photosResult &&
            photosResult.success &&
            'data' in photosResult &&
            photosResult.data
          ) {
            const photos = photosResult.data;
            interface PhotoItem {
              type?: string;
              createdAt?: string;
              verificationStatus?: string;
            }
            const progressPhotos = (photos as PhotoItem[]).filter((p) => p.type === 'PROGRESS');
            const idPhotos = (photos as PhotoItem[]).filter(
              (p) => p.type === 'ID_FRONT' || p.type === 'ID_BACK'
            );

            let idStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'NOT_SUBMITTED' = 'NOT_SUBMITTED';
            if (idPhotos.length > 0) {
              const latestIdPhoto = [...idPhotos].sort(
                (a, b) =>
                  new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
              )[0];
              idStatus = (latestIdPhoto.verificationStatus || 'PENDING') as typeof idStatus;
            }

            const recentProgressPhoto =
              progressPhotos.length > 0
                ? (
                    [...progressPhotos].sort(
                      (a, b) =>
                        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
                    )[0] as PhotoItem & { url?: string }
                  )?.url
                : null;

            setPhotoStats({
              totalPhotos: Array.isArray(photos) ? photos.length : 0,
              recentPhoto: recentProgressPhoto ?? null,
              idVerificationStatus: idStatus,
            });
          }
        }
      } catch (error) {
        logger.error('Error loading patient data', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
        if (!dataError) {
          setDataError(
            'Unable to load your health data. Please check your connection and try again.'
          );
        }
      } finally {
        setDashboardLoading(false);
      }
    },
    [features, dataError]
  );

  const formatDate = useCallback(() => {
    return new Date().toLocaleDateString(language === 'es' ? 'es' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [language]);

  /**
   * Get color coding for BMI value
   * Based on WHO BMI classification
   */
  const getBmiColor = (bmi: string | null) => {
    if (!bmi) return { text: 'text-gray-900', bar: 'bg-gray-400', width: '0%' };

    const bmiNum = parseFloat(bmi);
    if (isNaN(bmiNum)) return { text: 'text-gray-900', bar: 'bg-gray-400', width: '0%' };

    // WHO BMI Classification
    // Underweight: < 18.5 (yellow)
    // Normal: 18.5-24.9 (green)
    // Overweight: 25-29.9 (yellow)
    // Obese: 30+ (red)
    if (bmiNum < 18.5) {
      return { text: 'text-amber-600', bar: 'bg-amber-500', width: '30%' };
    } else if (bmiNum < 25) {
      return { text: 'text-green-600', bar: 'bg-green-500', width: '65%' };
    } else if (bmiNum < 30) {
      return { text: 'text-amber-600', bar: 'bg-amber-500', width: '75%' };
    } else {
      return { text: 'text-red-600', bar: 'bg-red-500', width: '90%' };
    }
  };

  /**
   * Get color for weight based on BMI
   */
  const getBmiWeightColor = (bmi: string | null) => {
    const bmiColor = getBmiColor(bmi);
    // If we have BMI, use its color scheme for weight
    // Otherwise use neutral gray
    if (!bmi) return { text: 'text-gray-900', bar: 'bg-gray-400', width: '50%' };
    return bmiColor;
  };

  // Lead portal: conversion-focused dashboard
  if (portalMode === 'lead') {
    return (
      <LeadDashboard
        displayName={displayName !== 'Patient' ? displayName : ''}
        clinicName={branding?.clinicName ?? ''}
        clinicSlug={branding?.subdomain ?? ''}
      />
    );
  }

  if (dashboardLoading) {
    return (
      <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
        {/* Welcome header skeleton */}
        <div className="mb-6">
          <div className="h-4 w-28 rounded bg-gray-200" />
          <div className="mt-2 h-8 w-56 rounded bg-gray-200" />
        </div>
        {/* Vitals row skeleton */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-2 h-3 w-14 rounded bg-gray-200" />
              <div className="h-7 w-16 rounded bg-gray-200" />
              <div className="mt-2 h-2 w-full rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
        {/* Weight card skeleton */}
        <div className="mb-6 h-40 rounded-2xl bg-gray-200" />
        {/* Quick stats skeleton */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="h-24 rounded-2xl bg-white shadow-sm" />
          <div className="h-24 rounded-2xl bg-white shadow-sm" />
        </div>
        {/* Photos widget skeleton */}
        <div className="mb-6 h-28 rounded-2xl bg-white shadow-sm" />
        {/* Quick actions skeleton */}
        <div className="mb-6">
          <div className="mb-3 h-5 w-28 rounded bg-gray-200" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-white shadow-sm" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {dataError && (
        <div
          className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="flex-1 text-sm font-medium text-amber-900">{dataError}</p>
          <Link
            href={`/patient-login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=session_expired`}
            className="shrink-0 rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-300"
          >
            Log in
          </Link>
        </div>
      )}
      {/* Welcome Header */}
      <div className="mb-6">
        <p className="text-sm text-gray-500">{formatDate()}</p>
        <h1 className="text-2xl font-semibold text-gray-900">
          {t('dashboardHello')}, {displayName}
        </h1>
        {/* Custom welcome message from clinic settings */}
        {branding?.welcomeMessage && (
          <p className="mt-2 text-gray-600">{branding.welcomeMessage}</p>
        )}
      </div>

      {/* Custom dashboard message from clinic (e.g., announcements) */}
      {branding?.dashboardMessage && (
        <div
          className="mb-6 rounded-xl border p-4"
          style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}30` }}
        >
          <p className="text-sm font-medium" style={{ color: primaryColor }}>
            {branding.dashboardMessage}
          </p>
        </div>
      )}

      {/* Intake Vitals Section - Shows initial measurements from intake form */}
      {intakeVitals && (intakeVitals.height || intakeVitals.weight || intakeVitals.bmi) && (
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center gap-2 sm:mb-4">
            <Zap className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Vitals</h2>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {/* Height */}
            <div className="rounded-xl bg-[#efece7] p-2.5 sm:p-4">
              <div className="mb-1.5 flex items-center gap-1.5 sm:mb-2 sm:gap-2">
                <Ruler className="h-3.5 w-3.5 text-gray-500 sm:h-4 sm:w-4" />
                <p className="text-[10px] font-medium text-gray-500 sm:text-xs">Height</p>
              </div>
              <p className="text-base font-bold text-gray-900 sm:text-xl">
                {intakeVitals.height || '—'}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-300">
                <div
                  className="h-full rounded-full bg-gray-500"
                  style={{ width: intakeVitals.height ? '100%' : '0%' }}
                />
              </div>
            </div>

            {/* Initial Weight from Intake */}
            <div className="rounded-xl bg-[#efece7] p-2.5 sm:p-4">
              <div className="mb-1.5 flex items-center gap-1.5 sm:mb-2 sm:gap-2">
                <Scale className="h-3.5 w-3.5 text-gray-500 sm:h-4 sm:w-4" />
                <p className="text-[10px] font-medium text-gray-500 sm:text-xs">Weight</p>
              </div>
              <p
                className={`text-base font-bold sm:text-xl ${getBmiWeightColor(intakeVitals.bmi).text}`}
              >
                {intakeVitals.weight ? `${intakeVitals.weight}lbs` : '—'}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-300">
                <div
                  className={`h-full rounded-full ${getBmiWeightColor(intakeVitals.bmi).bar}`}
                  style={{ width: getBmiWeightColor(intakeVitals.bmi).width }}
                />
              </div>
            </div>

            {/* BMI */}
            <div className="rounded-xl bg-[#efece7] p-2.5 sm:p-4">
              <div className="mb-1.5 flex items-center gap-1.5 sm:mb-2 sm:gap-2">
                <Activity className="h-3.5 w-3.5 text-gray-500 sm:h-4 sm:w-4" />
                <p className="text-[10px] font-medium text-gray-500 sm:text-xs">BMI</p>
              </div>
              <p className={`text-base font-bold sm:text-xl ${getBmiColor(intakeVitals.bmi).text}`}>
                {intakeVitals.bmi || '—'}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-300">
                <div
                  className={`h-full rounded-full ${getBmiColor(intakeVitals.bmi).bar}`}
                  style={{ width: getBmiColor(intakeVitals.bmi).width }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Shipment Tracker - Shows at top when there's an active shipment */}
      {features.showShipmentTracking && <ActiveShipmentTracker primaryColor={primaryColor} />}

      {/* Weight Progress Card - Hero */}
      {features.showWeightTracking && (
        <Link href={`${PATIENT_PORTAL_PATH}/progress`} className="mb-6 block">
          <div
            className="rounded-2xl p-4 text-white shadow-lg sm:p-6"
            style={{ backgroundColor: accentColor }}
          >
            <div className="mb-3 flex items-center justify-between sm:mb-4">
              <div className="min-w-0">
                <p
                  className="text-xs font-medium sm:text-sm"
                  style={{ color: weightCardTextColor, opacity: 0.8 }}
                >
                  {t('dashboardCurrentWeight')}
                </p>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-3xl font-semibold sm:text-5xl"
                    style={{ color: weightCardTextColor }}
                  >
                    {currentWeight || '---'}
                  </span>
                  <span
                    className="text-base font-medium sm:text-xl"
                    style={{ color: weightCardTextColor, opacity: 0.7 }}
                  >
                    {t('dashboardLbs')}
                  </span>
                </div>
              </div>
              <div
                className="shrink-0 rounded-2xl p-3 sm:p-4"
                style={{
                  backgroundColor:
                    weightCardTextColor === '#ffffff'
                      ? 'rgba(255,255,255,0.15)'
                      : 'rgba(0,0,0,0.08)',
                }}
              >
                <Scale className="h-6 w-6 sm:h-8 sm:w-8" style={{ color: weightCardTextColor }} />
              </div>
            </div>

            {weightChange !== null ? (
              <div className="flex items-center gap-2">
                {weightChange < 0 ? (
                  <>
                    <TrendingDown className="h-5 w-5" style={{ color: weightCardTextColor }} />
                    <span className="font-semibold" style={{ color: weightCardTextColor }}>
                      {t('dashboardDownLbs').replace('{n}', Math.abs(weightChange).toString())}
                    </span>
                  </>
                ) : weightChange > 0 ? (
                  <>
                    <TrendingUp className="h-5 w-5" style={{ color: weightCardTextColor }} />
                    <span className="font-semibold" style={{ color: weightCardTextColor }}>
                      {t('dashboardUpLbs').replace('{n}', weightChange.toString())}
                    </span>
                  </>
                ) : (
                  <span className="font-semibold" style={{ color: weightCardTextColor }}>
                    {t('dashboardNoChange')}
                  </span>
                )}
                <span className="text-sm" style={{ color: weightCardTextColor, opacity: 0.7 }}>
                  {t('dashboardSinceStarting')}
                </span>
              </div>
            ) : !currentWeight ? (
              <p className="text-sm" style={{ color: weightCardTextColor, opacity: 0.7 }}>
                Log your first weight to start tracking progress
              </p>
            ) : null}

            <div className="mt-4 flex items-center justify-between">
              <span
                className="text-sm font-medium"
                style={{ color: weightCardTextColor, opacity: 0.7 }}
              >
                {currentWeight ? t('dashboardTapToLogWeight') : 'Tap to get started'}
              </span>
              <ChevronRight
                className="h-5 w-5"
                style={{ color: weightCardTextColor, opacity: 0.7 }}
              />
            </div>
          </div>
        </Link>
      )}

      {/* Quick Stats Row */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {/* Next Medication */}
        {features.showMedicationReminders && nextReminder && (
          <Link
            href={`${PATIENT_PORTAL_PATH}/medications`}
            className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4"
          >
            <div className="mb-2 flex items-center gap-3">
              <div
                className="shrink-0 rounded-xl p-2"
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <Pill className="h-5 w-5" style={{ color: primaryColor }} />
              </div>
              <span className="text-xs font-medium text-gray-500">{t('dashboardNextDose')}</span>
            </div>
            <p className="truncate font-semibold text-gray-900">{nextReminder.medication}</p>
            <p className="text-sm text-gray-500">
              {nextReminder.nextDose} at {nextReminder.time}
            </p>
          </Link>
        )}

        {/* Shipment Status */}
        {features.showShipmentTracking && recentShipment && (
          <Link
            href={`${PATIENT_PORTAL_PATH}/shipments`}
            className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-4"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="shrink-0 rounded-xl bg-blue-50 p-2">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">{t('dashboardShipment')}</span>
            </div>
            <p className="truncate font-semibold capitalize text-gray-900">
              {recentShipment.statusLabel || recentShipment.status || 'Processing'}
            </p>
            <p className="truncate text-sm text-gray-500">
              {recentShipment.estimatedDelivery
                ? `${t('dashboardEst')} ${(() => {
                    const date = new Date(String(recentShipment.estimatedDelivery));
                    return isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
                  })()}`
                : recentShipment.orderNumber
                  ? `Order ${recentShipment.orderNumber}`
                  : t('dashboardShipment')}
            </p>
          </Link>
        )}
      </div>

      {/* Photos Widget */}
      <div className="mb-6">
        <Link href={`${PATIENT_PORTAL_PATH}/photos`} className="block">
          <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm transition-all hover:shadow-md sm:p-5">
            <div className="flex items-start justify-between">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className="shrink-0 rounded-xl bg-[var(--brand-primary)] p-2.5 sm:p-3">
                  <Camera className="h-5 w-5 text-white sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-gray-900">
                    {t('dashboardProgressPhotos')}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {photoStats?.totalPhotos
                      ? `${photoStats.totalPhotos} photo${photoStats.totalPhotos !== 1 ? 's' : ''} uploaded`
                      : t('dashboardTrackTransformation')}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </div>

            {/* ID Verification Status Banner */}
            {photoStats?.idVerificationStatus && (
              <div className="mt-4">
                {photoStats.idVerificationStatus === 'VERIFIED' ? (
                  <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">
                      {t('dashboardIdVerified')}
                    </span>
                  </div>
                ) : photoStats.idVerificationStatus === 'PENDING' ? (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-700">
                      {t('dashboardIdPending')}
                    </span>
                  </div>
                ) : photoStats.idVerificationStatus === 'REJECTED' ? (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium text-red-700">
                      {t('dashboardIdResubmit')}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                    <Upload className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-600">
                      {t('dashboardUploadId')}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Recent Photo Preview */}
            {photoStats?.recentPhoto && (
              <div className="mt-4 flex items-center gap-3">
                <div className="relative h-16 w-16 overflow-hidden rounded-lg bg-gray-100">
                  <img
                    src={photoStats.recentPhoto}
                    alt="Recent progress"
                    width={64}
                    height={64}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">
                    {t('dashboardLatestProgressPhoto')}
                  </p>
                  <p className="text-xs text-gray-500">{t('dashboardTapToViewPhotos')}</p>
                </div>
              </div>
            )}

            {/* Upload Prompt for users with no photos */}
            {!photoStats?.totalPhotos && (
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-[var(--brand-primary-light)] p-3">
                <ImageIcon className="h-5 w-5 text-[var(--brand-primary)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--brand-primary)]">
                    {t('dashboardStartDocumenting')}
                  </p>
                  <p className="text-xs text-[var(--brand-primary)]">
                    {t('dashboardUploadFirstPhoto')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </Link>
      </div>

      {/* Upcoming Video Visit */}
      {upcomingVideoVisit && (
        <div className="mb-6">
          <div className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="px-5 py-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-100">
                  <Video className="h-6 w-6 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{upcomingVideoVisit.title}</p>
                  <p className="mt-0.5 text-xs text-gray-600">
                    {upcomingVideoVisit.providerName &&
                      `with ${upcomingVideoVisit.providerName} · `}
                    {new Date(upcomingVideoVisit.startTime).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Make sure your camera and microphone are working before joining
                  </p>
                </div>
                <a
                  href={`/patient-portal/telehealth?appointmentId=${upcomingVideoVisit.id}`}
                  className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
                >
                  <Video className="h-4 w-4" />
                  Join
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Appointments */}
      {upcomingAppointments.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming Appointments</h2>
            <a
              href="/patient-portal/appointments"
              className="flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)] hover:underline"
            >
              View all <ChevronRight className="h-3 w-3" />
            </a>
          </div>
          <div className="space-y-2">
            {upcomingAppointments.map((apt) => (
              <a
                key={apt.id}
                href={
                  apt.type === 'VIDEO'
                    ? `/patient-portal/telehealth?appointmentId=${apt.id}`
                    : `/patient-portal/appointments`
                }
                className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 transition-colors hover:bg-gray-50"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    apt.type === 'VIDEO'
                      ? 'bg-blue-100'
                      : apt.type === 'PHONE'
                        ? 'bg-purple-100'
                        : 'bg-gray-100'
                  }`}
                >
                  {apt.type === 'VIDEO' ? (
                    <Video className="h-5 w-5 text-blue-600" />
                  ) : apt.type === 'PHONE' ? (
                    <Phone className="h-5 w-5 text-purple-600" />
                  ) : (
                    <MapPin className="h-5 w-5 text-gray-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{apt.title}</p>
                  <p className="text-xs text-gray-500">
                    {apt.providerName && `${apt.providerName} · `}
                    {new Date(apt.startTime).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Membership / Plan Status */}
      {features.showBilling && (
        <div className="mb-6">
          {membershipPlan ? (
            <Link
              href={`${PATIENT_PORTAL_PATH}/billing`}
              className="block overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-md"
            >
              <div
                className="px-4 py-3 sm:px-5 sm:py-4"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                      <CreditCard className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white/70">Your Membership</p>
                      <h3 className="truncate text-lg font-bold text-white">
                        {membershipPlan.planName}
                      </h3>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                      membershipPlan.status.toUpperCase() === 'ACTIVE' || membershipPlan.status === 'active'
                        ? 'bg-white/20 text-white'
                        : membershipPlan.status.toUpperCase() === 'PAUSED'
                          ? 'bg-amber-400/30 text-amber-100'
                          : membershipPlan.status.toUpperCase() === 'PAST_DUE'
                            ? 'bg-red-400/30 text-red-100'
                            : 'bg-white/15 text-white/80'
                    }`}
                  >
                    {membershipPlan.status.toUpperCase() === 'PAST_DUE'
                      ? 'Past Due'
                      : membershipPlan.status.charAt(0).toUpperCase() + membershipPlan.status.slice(1).toLowerCase()}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">
                    ${membershipPlan.amount}/{membershipPlan.interval === 'year' ? 'yr' : 'mo'}
                  </span>
                  {membershipPlan.nextBillingDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      Next billing{' '}
                      {(() => {
                        const d = new Date(membershipPlan.nextBillingDate);
                        return isNaN(d.getTime())
                          ? '—'
                          : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                      })()}
                    </span>
                  )}
                </div>
                <span className="flex items-center gap-1 text-xs font-medium" style={{ color: primaryColor }}>
                  Manage <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ) : !dashboardLoading ? (
            <Link
              href={`${PATIENT_PORTAL_PATH}/billing`}
              className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                <CreditCard className="h-5 w-5 text-gray-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-700">No Active Membership</p>
                <p className="text-xs text-gray-500">Tap to view billing &amp; plan options</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-gray-300" />
            </Link>
          ) : null}
        </div>
      )}

      {/* Quick Actions */}
      <div className="cv-auto mb-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">{t('dashboardQuickActions')}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {features.showWeightTracking && (
            <Link
              href={`${PATIENT_PORTAL_PATH}/progress`}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <Scale className="mb-2 h-6 w-6" style={{ color: primaryColor }} />
              <span className="text-sm font-medium text-gray-700">{t('dashboardLogWeight')}</span>
            </Link>
          )}

          {features.showDoseCalculator && (
            <Link
              href={`${PATIENT_PORTAL_PATH}/calculators`}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <Calculator className="mb-2 h-6 w-6 text-[var(--brand-primary)]" />
              <span className="text-sm font-medium text-gray-700">{t('dashboardCalculators')}</span>
            </Link>
          )}

          {features.showResources && (
            <Link
              href={`${PATIENT_PORTAL_PATH}/resources`}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <BookOpen className="mb-2 h-6 w-6 text-amber-600" />
              <span className="text-sm font-medium text-gray-700">{t('dashboardResources')}</span>
            </Link>
          )}

          {/* Photos Quick Action */}
          <Link
            href={`${PATIENT_PORTAL_PATH}/photos`}
            className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <Camera className="mb-2 h-6 w-6 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">{t('dashboardPhotos')}</span>
          </Link>

          {features.showShipmentTracking && (
            <Link
              href={`${PATIENT_PORTAL_PATH}/shipments`}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <Package className="mb-2 h-6 w-6 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">{t('dashboardTrackOrder')}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Treatment Card */}
      <Link href={`${PATIENT_PORTAL_PATH}/medications`} className="cv-auto mb-6 block">
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="p-4" style={{ backgroundColor: primaryColor }}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">{t('dashboardCurrentTreatment')}</h2>
              <Pill className="h-5 w-5 text-white/80" />
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">{t('dashboardViewMedications')}</p>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </div>
          </div>
        </div>
      </Link>

      {/* BMI Calculator Preview */}
      {features.showBMICalculator && (
        <Link href={`${PATIENT_PORTAL_PATH}/calculators/bmi`} className="mb-6 block">
          <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-5">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <div className="shrink-0 rounded-xl bg-[var(--brand-primary-light)] p-2.5 sm:p-3">
                  <Activity className="h-5 w-5 text-[var(--brand-primary)] sm:h-6 sm:w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-gray-900">BMI Calculator</h3>
                  <p className="truncate text-sm text-gray-500">Check your body mass index</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
            </div>
          </div>
        </Link>
      )}

      {/* Notifications / Reminders */}
      <div className="cv-auto rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-3 sm:mb-4">
          <Bell className="h-5 w-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">{t('dashboardReminders')}</h2>
        </div>
        {nextReminder ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-3">
              <Clock className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-gray-900">
                  {nextReminder.medication} — {t('dashboardNextDose')}
                </p>
                <p className="text-xs text-gray-500">
                  {nextReminder.nextDose} {t('dashboardAt')} {nextReminder.time}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{t('dashboardNoReminders')}</p>
        )}
      </div>
    </div>
  );
}
