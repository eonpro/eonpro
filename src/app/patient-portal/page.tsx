'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useClinicBranding, usePortalFeatures } from '@/lib/contexts/ClinicBrandingContext';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import ActiveShipmentTracker from '@/components/patient-portal/ActiveShipmentTracker';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';

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
              `/login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=no_session`
            );
          return;
        }

        const userData = safeParseJsonString<{ patientId?: number; role?: string }>(userJson);
        if (!userData) {
          if (!cancelled)
            router.replace(
              `/login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=invalid_session`
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
        }
        // No demo: if no valid patientId, leave state empty (user may see empty dashboard or redirect handled by layout)
      } catch (error) {
        logger.error('PatientPortal: failed to load user data', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
        if (!cancelled)
          router.replace(
            `/login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=invalid_session`
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
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || !data?.user) return;
        const name = `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim();
        if (name) setDisplayName(name);
      })
      .catch((err) => {
        logger.warn('Failed to fetch user profile for display name', {
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });
    return () => { cancelled = true; };
  }, [patient?.id]);

  const loadPatientData = async (patientId: number) => {
    setDataError(null);
    try {
      // Load intake vitals (initial height, weight, BMI from intake form)
      const vitalsRes = await portalFetch('/api/patient-portal/vitals');
      const err = getPortalResponseError(vitalsRes);
      if (err) {
        setDataError(err);
        return;
      }
      if (vitalsRes.ok) {
        const result = await safeParseJson(vitalsRes);
        if (result && typeof result === 'object' && 'success' in result && result.success && 'data' in result && result.data) {
          setIntakeVitals(result.data as IntakeVitals);
        }
      }

      // Load weight data from database (logged weights over time)
      const weightRes = await portalFetch(`/api/patient-progress/weight?patientId=${patientId}`);
      const weightErr = getPortalResponseError(weightRes);
      if (weightErr) {
        setDataError(weightErr);
        return;
      }
      if (weightRes.ok) {
        const result = await safeParseJson(weightRes);
        // Handle both array format and { data: [...] } format
        const logs = Array.isArray(result) ? result : (result && typeof result === 'object' && 'data' in result ? (result as { data?: unknown[] }).data : null) || [];
        interface WeightLog { recordedAt?: string; weight?: number }
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

      // Load medication reminders from database
      const remindersRes = await portalFetch(
        `/api/patient-progress/medication-reminders?patientId=${patientId}`
      );
      const remindersErr = getPortalResponseError(remindersRes);
      if (remindersErr) {
        setDataError(remindersErr);
        return;
      }
      if (remindersRes.ok) {
        const result = await safeParseJson(remindersRes);
        // Handle both array format and { data: [...] } format
        const reminders = Array.isArray(result) ? result : (result && typeof result === 'object' && 'data' in result ? (result as { data?: unknown[] }).data : null) || [];
        if (reminders.length > 0) {
          // Find the next upcoming reminder
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

          // Sort by next occurrence
          interface ReminderWithDays {
            dayOfWeek: number;
            medicationName: string;
            timeOfDay: string;
            daysUntil: number;
          }
          const sortedReminders = (reminders as ReminderWithDays[])
            .map((r) => ({
              ...r,
              daysUntil: (r.dayOfWeek - today + 7) % 7 || 7,
            }))
            .sort((a, b) => a.daysUntil - b.daysUntil);

          const next = sortedReminders[0];
          setNextReminder({
            medication: next.medicationName.split(' ')[0],
            nextDose: dayNames[next.dayOfWeek],
            time: next.timeOfDay,
          });
        }
      }

      // Load recent shipment for dashboard widget
      try {
        const trackingRes = await portalFetch('/api/patient-portal/tracking');
        if (trackingRes.ok) {
          const trackingResult = await safeParseJson(trackingRes);
          if (trackingResult && typeof trackingResult === 'object' && 'activeShipments' in trackingResult) {
            const active = (trackingResult as { activeShipments: RecentShipmentDisplay[] }).activeShipments;
            if (Array.isArray(active) && active.length > 0) {
              setRecentShipment(active[0]);
            }
          }
        }
      } catch (trackingError) {
        logger.error('PatientPortal: failed to load tracking data', {
          error: trackingError instanceof Error ? trackingError.message : 'Unknown',
        });
      }

      // Load photo stats for dashboard widget
      try {
        const photosRes = await portalFetch('/api/patient-portal/photos');
        const photosErr = getPortalResponseError(photosRes);
        if (photosErr) {
          setDataError(photosErr);
          return;
        }
        if (photosRes.ok) {
          const photosResult = await safeParseJson(photosRes);
          if (photosResult && typeof photosResult === 'object' && 'success' in photosResult && photosResult.success && 'data' in photosResult && photosResult.data) {
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

            // Get most recent progress photo URL
            const recentProgressPhoto =
              progressPhotos.length > 0
                ? ([...progressPhotos].sort(
                    (a, b) =>
                      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
                  )[0] as PhotoItem & { url?: string })?.url
                : null;

            setPhotoStats({
              totalPhotos: Array.isArray(photos) ? photos.length : 0,
              recentPhoto: recentProgressPhoto ?? null,
              idVerificationStatus: idStatus,
            });
          }
        }
      } catch (photoError) {
        logger.error('PatientPortal: failed to load photo stats', {
          error: photoError instanceof Error ? photoError.message : 'Unknown',
        });
      }
    } catch (error) {
      logger.error('Error loading patient data', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      // Production: no demo data; leave state as-is (empty or partial)
    }
  };

  const formatDate = () => {
    return new Date().toLocaleDateString(language === 'es' ? 'es' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

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
            href={`/login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=session_expired`}
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
              <p className="text-base font-bold text-gray-900 sm:text-xl">{intakeVitals.height || '—'}</p>
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
              <p className={`text-base font-bold sm:text-xl ${getBmiWeightColor(intakeVitals.bmi).text}`}>
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
                <p className="text-xs font-medium sm:text-sm" style={{ color: weightCardTextColor, opacity: 0.8 }}>
                  {t('dashboardCurrentWeight')}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-semibold sm:text-5xl" style={{ color: weightCardTextColor }}>
                    {currentWeight || '---'}
                  </span>
                  <span className="text-base font-medium sm:text-xl" style={{ color: weightCardTextColor, opacity: 0.7 }}>
                    {t('dashboardLbs')}
                  </span>
                </div>
              </div>
              <div className="shrink-0 rounded-2xl p-3 sm:p-4" style={{ backgroundColor: weightCardTextColor === '#ffffff' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)' }}>
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
              <span className="text-sm font-medium" style={{ color: weightCardTextColor, opacity: 0.7 }}>
                {currentWeight ? t('dashboardTapToLogWeight') : 'Tap to get started'}
              </span>
              <ChevronRight className="h-5 w-5" style={{ color: weightCardTextColor, opacity: 0.7 }} />
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
              <div className="shrink-0 rounded-xl p-2" style={{ backgroundColor: `${primaryColor}15` }}>
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
                  <h3 className="truncate font-semibold text-gray-900">{t('dashboardProgressPhotos')}</h3>
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
                  <p className="text-xs text-[var(--brand-primary)]">{t('dashboardUploadFirstPhoto')}</p>
                </div>
              </div>
            )}
          </div>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="mb-6">
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
      <Link href={`${PATIENT_PORTAL_PATH}/medications`} className="mb-6 block">
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
      <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-3 sm:mb-4">
          <Bell className="h-5 w-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">{t('dashboardReminders')}</h2>
        </div>
        {nextReminder ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-3">
              <Clock className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-medium text-gray-900">{nextReminder.medication} — {t('dashboardNextDose')}</p>
                <p className="text-xs text-gray-500">{nextReminder.nextDose} {t('dashboardAt')} {nextReminder.time}</p>
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
