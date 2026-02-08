'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getAuthHeaders } from '@/lib/utils/auth-token';
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

export default function PatientPortalDashboard() {
  const router = useRouter();
  const { branding } = useClinicBranding();
  const features = usePortalFeatures();
  const { t, language } = usePatientPortalLanguage();

  const [patient, setPatient] = useState<any>(null);
  const [weightData, setWeightData] = useState<WeightEntry[]>([]);
  const [currentWeight, setCurrentWeight] = useState<number | null>(null);
  const [weightChange, setWeightChange] = useState<number | null>(null);
  const [recentShipment, setRecentShipment] = useState<any>(null);
  const [nextReminder, setNextReminder] = useState<any>(null);
  const [intakeVitals, setIntakeVitals] = useState<IntakeVitals | null>(null);
  const [photoStats, setPhotoStats] = useState<{
    totalPhotos: number;
    recentPhoto: string | null;
    idVerificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'NOT_SUBMITTED' | null;
  } | null>(null);

  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#d3f931';

  useEffect(() => {
    // SSR guard - only access localStorage on client
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const run = async () => {
      try {
        const userJson = localStorage.getItem('user');
        if (!userJson) {
          if (!cancelled) router.replace(`/login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=no_session`);
          return;
        }

        const userData = JSON.parse(userJson);
        if (!cancelled) setPatient(userData);

        // CRITICAL: Use patientId only (never user.id) so we load the correct patient's weight/overview
        let patientId: number | null = userData.patientId ?? null;
        if (patientId == null && userData.role?.toLowerCase() === 'patient') {
          const meRes = await fetch('/api/auth/me', {
            headers: getAuthHeaders(),
            credentials: 'include',
          });
          if (meRes.ok && !cancelled) {
            const meData = await meRes.json();
            const pid = meData?.user?.patientId;
            if (typeof pid === 'number' && pid > 0) {
              patientId = pid;
              const updated = { ...userData, patientId: pid };
              localStorage.setItem('user', JSON.stringify(updated));
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
        console.error('[PatientPortal] Failed to load user data:', error);
        if (!cancelled) router.replace(`/login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=invalid_session`);
      }
    };

    run();
    return () => { cancelled = true; };
  }, []);

  const loadPatientData = async (patientId: number) => {
    const headers = getAuthHeaders();
    try {
      // Load intake vitals (initial height, weight, BMI from intake form)
      const vitalsRes = await fetch('/api/patient-portal/vitals', {
        headers,
        credentials: 'include',
      });
      if (vitalsRes.ok) {
        const result = await vitalsRes.json();
        if (result.success && result.data) {
          setIntakeVitals(result.data);
        }
      }

      // Load weight data from database (logged weights over time)
      const weightRes = await fetch(`/api/patient-progress/weight?patientId=${patientId}`, {
        headers,
        credentials: 'include',
      });
      if (weightRes.ok) {
        const result = await weightRes.json();
        // Handle both array format and { data: [...] } format
        const logs = Array.isArray(result) ? result : (result.data || []);
        const formattedData = logs.map((log: any) => ({
          dateInput: log.recordedAt,
          currentWeightInput: log.weight,
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
      const remindersRes = await fetch(
        `/api/patient-progress/medication-reminders?patientId=${patientId}`,
        { headers, credentials: 'include' }
      );
      if (remindersRes.ok) {
        const result = await remindersRes.json();
        // Handle both array format and { data: [...] } format
        const reminders = Array.isArray(result) ? result : (result.data || []);
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
          const sortedReminders = reminders
            .map((r: any) => ({
              ...r,
              daysUntil: (r.dayOfWeek - today + 7) % 7 || 7,
            }))
            .sort((a: any, b: any) => a.daysUntil - b.daysUntil);

          const next = sortedReminders[0];
          setNextReminder({
            medication: next.medicationName.split(' ')[0], // Just the drug name
            nextDose: dayNames[next.dayOfWeek],
            time: next.timeOfDay,
          });
        }
      }

      // Load photo stats for dashboard widget
      try {
        const photosRes = await fetch('/api/patient-portal/photos', {
          headers,
          credentials: 'include',
        });
        if (photosRes.ok) {
          const photosResult = await photosRes.json();
          if (photosResult.success && photosResult.data) {
            const photos = photosResult.data;
            const progressPhotos = photos.filter((p: any) => p.type === 'PROGRESS');
            const idPhotos = photos.filter((p: any) => p.type === 'ID_FRONT' || p.type === 'ID_BACK');

            // Determine ID verification status
            let idStatus: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'NOT_SUBMITTED' = 'NOT_SUBMITTED';
            if (idPhotos.length > 0) {
              const latestIdPhoto = idPhotos.sort((a: any, b: any) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              )[0];
              idStatus = latestIdPhoto.verificationStatus || 'PENDING';
            }

            // Get most recent progress photo URL
            const recentProgressPhoto = progressPhotos.length > 0
              ? progressPhotos.sort((a: any, b: any) =>
                  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )[0]?.url
              : null;

            setPhotoStats({
              totalPhotos: photos.length,
              recentPhoto: recentProgressPhoto,
              idVerificationStatus: idStatus,
            });
          }
        }
      } catch (photoError) {
        console.error('[PatientPortal] Failed to load photo stats:', photoError);
      }
    } catch (error) {
      console.error('Error loading patient data:', error);
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
      {/* Welcome Header */}
      <div className="mb-6">
        <p className="text-sm text-gray-500">{formatDate()}</p>
        <h1 className="text-2xl font-semibold text-gray-900">
          {t('dashboardHello')}, {patient?.firstName || 'Patient'}
        </h1>
        {/* Custom welcome message from clinic settings */}
        {branding?.welcomeMessage && (
          <p className="mt-2 text-gray-600">{branding.welcomeMessage}</p>
        )}
      </div>

      {/* Custom dashboard message from clinic (e.g., announcements) */}
      {branding?.dashboardMessage && (
        <div
          className="mb-6 rounded-xl p-4 border"
          style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}30` }}
        >
          <p className="text-sm font-medium" style={{ color: primaryColor }}>
            {branding.dashboardMessage}
          </p>
        </div>
      )}

      {/* Intake Vitals Section - Shows initial measurements from intake form */}
      {intakeVitals && (intakeVitals.height || intakeVitals.weight || intakeVitals.bmi) && (
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Vitals</h2>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Height */}
            <div className="rounded-xl bg-[#efece7] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Ruler className="h-4 w-4 text-gray-500" />
                <p className="text-xs font-medium text-gray-500">Height</p>
              </div>
              <p className="text-xl font-bold text-gray-900">
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
            <div className="rounded-xl bg-[#efece7] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Scale className="h-4 w-4 text-gray-500" />
                <p className="text-xs font-medium text-gray-500">Initial Weight</p>
              </div>
              <p className={`text-xl font-bold ${getBmiWeightColor(intakeVitals.bmi).text}`}>
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
            <div className="rounded-xl bg-[#efece7] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Activity className="h-4 w-4 text-gray-500" />
                <p className="text-xs font-medium text-gray-500">BMI</p>
              </div>
              <p className={`text-xl font-bold ${getBmiColor(intakeVitals.bmi).text}`}>
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
      {features.showShipmentTracking && (
        <ActiveShipmentTracker primaryColor={primaryColor} />
      )}

      {/* Weight Progress Card - Hero */}
      {features.showWeightTracking && (
        <Link href={`${PATIENT_PORTAL_PATH}/progress`} className="mb-6 block">
          <div
            className="rounded-2xl p-6 text-white shadow-lg"
            style={{ backgroundColor: accentColor }}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-80" style={{ color: '#333' }}>
                  {t('dashboardCurrentWeight')}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-semibold" style={{ color: '#333' }}>
                    {currentWeight || '---'}
                  </span>
                  <span className="text-xl font-medium" style={{ color: '#555' }}>
                    {t('dashboardLbs')}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}>
                <Scale className="h-8 w-8" style={{ color: '#333' }} />
              </div>
            </div>

            {weightChange !== null && (
              <div className="flex items-center gap-2">
                {weightChange < 0 ? (
                  <>
                    <TrendingDown className="h-5 w-5" style={{ color: '#166534' }} />
                    <span className="font-semibold" style={{ color: '#166534' }}>
                      {t('dashboardDownLbs').replace('{n}', Math.abs(weightChange).toString())}
                    </span>
                  </>
                ) : weightChange > 0 ? (
                  <>
                    <TrendingUp className="h-5 w-5" style={{ color: '#dc2626' }} />
                    <span className="font-semibold" style={{ color: '#dc2626' }}>
                      {t('dashboardUpLbs').replace('{n}', weightChange.toString())}
                    </span>
                  </>
                ) : (
                  <span className="font-semibold" style={{ color: '#333' }}>
                    {t('dashboardNoChange')}
                  </span>
                )}
                <span className="text-sm opacity-70" style={{ color: '#555' }}>
                  {t('dashboardSinceStarting')}
                </span>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: '#555' }}>
                {t('dashboardTapToLogWeight')}
              </span>
              <ChevronRight className="h-5 w-5" style={{ color: '#555' }} />
            </div>
          </div>
        </Link>
      )}

      {/* Quick Stats Row */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        {/* Next Medication */}
        {features.showMedicationReminders && nextReminder && (
          <Link
            href={`${PATIENT_PORTAL_PATH}/medications`}
            className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-xl p-2" style={{ backgroundColor: `${primaryColor}15` }}>
                <Pill className="h-5 w-5" style={{ color: primaryColor }} />
              </div>
              <span className="text-xs font-medium text-gray-500">{t('dashboardNextDose')}</span>
            </div>
            <p className="font-semibold text-gray-900">{nextReminder.medication}</p>
            <p className="text-sm text-gray-500">
              {nextReminder.nextDose} at {nextReminder.time}
            </p>
          </Link>
        )}

        {/* Shipment Status */}
        {features.showShipmentTracking && recentShipment && (
          <Link
            href={`${PATIENT_PORTAL_PATH}/shipments`}
            className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="rounded-xl bg-blue-50 p-2">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-gray-500">{t('dashboardShipment')}</span>
            </div>
            <p className="font-semibold capitalize text-gray-900">{recentShipment.status}</p>
            <p className="text-sm text-gray-500">{t('dashboardEst')} {recentShipment.estimatedDelivery}</p>
          </Link>
        )}
      </div>

      {/* Photos Widget */}
      <div className="mb-6">
        <Link href={`${PATIENT_PORTAL_PATH}/photos`} className="block">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 p-3">
                  <Camera className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{t('dashboardProgressPhotos')}</h3>
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
                    <span className="text-sm font-medium text-green-700">{t('dashboardIdVerified')}</span>
                  </div>
                ) : photoStats.idVerificationStatus === 'PENDING' ? (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-700">{t('dashboardIdPending')}</span>
                  </div>
                ) : photoStats.idVerificationStatus === 'REJECTED' ? (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium text-red-700">{t('dashboardIdResubmit')}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                    <Upload className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-600">{t('dashboardUploadId')}</span>
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
                  <p className="text-sm font-medium text-gray-700">{t('dashboardLatestProgressPhoto')}</p>
                  <p className="text-xs text-gray-500">{t('dashboardTapToViewPhotos')}</p>
                </div>
              </div>
            )}

            {/* Upload Prompt for users with no photos */}
            {!photoStats?.totalPhotos && (
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-violet-50 p-3">
                <ImageIcon className="h-5 w-5 text-violet-600" />
                <div>
                  <p className="text-sm font-medium text-violet-700">{t('dashboardStartDocumenting')}</p>
                  <p className="text-xs text-violet-600">{t('dashboardUploadFirstPhoto')}</p>
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
              <Calculator className="mb-2 h-6 w-6 text-purple-600" />
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
      <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="p-4" style={{ backgroundColor: primaryColor }}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">{t('dashboardCurrentTreatment')}</h2>
            <Pill className="h-5 w-5 text-white/80" />
          </div>
        </div>
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-gray-900">Semaglutide</p>
              <p className="text-sm text-gray-500">0.5mg weekly injection</p>
            </div>
            <span
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
            >
              {t('dashboardActive')}
            </span>
          </div>
          <Link
            href={`${PATIENT_PORTAL_PATH}/medications`}
            className="block w-full rounded-xl py-2.5 text-center font-medium text-white"
            style={{ backgroundColor: primaryColor }}
          >
            View Details
          </Link>
        </div>
      </div>

      {/* BMI Calculator Preview */}
      {features.showBMICalculator && (
        <Link href={`${PATIENT_PORTAL_PATH}/calculators/bmi`} className="mb-6 block">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-purple-50 p-3">
                  <Activity className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">BMI Calculator</h3>
                  <p className="text-sm text-gray-500">Check your body mass index</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </div>
          </div>
        </Link>
      )}

      {/* Notifications / Reminders */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <Bell className="h-5 w-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Reminders</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-3">
            <Clock className="h-5 w-5 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Weekly injection due</p>
              <p className="text-xs text-gray-500">Wednesday at 8:00 AM</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-blue-50 p-3">
            <Package className="h-5 w-5 text-blue-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Shipment arriving soon</p>
              <p className="text-xs text-gray-500">Expected Jan 22, 2026</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
