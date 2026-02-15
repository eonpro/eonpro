'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import { portalFetch, getPortalResponseError, SESSION_EXPIRED_MESSAGE } from '@/lib/api/patient-portal-client';
import { safeParseJson, safeParseJsonString } from '@/lib/utils/safe-json';
import { getMinimalPortalUserPayload, setPortalUserStorage } from '@/lib/utils/portal-user-storage';
import { ringColorStyle } from '@/lib/utils/css-ring-color';
import { toast } from '@/components/Toast';
import {
  User,
  Mail,
  Phone,
  Lock,
  Bell,
  Shield,
  ChevronRight,
  LogOut,
  Check,
  Eye,
  EyeOff,
  Languages,
} from 'lucide-react';

interface UserProfile {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const { branding } = useClinicBranding();
  const { t, language, setLanguage } = usePatientPortalLanguage();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeSection, setActiveSection] = useState<
    'profile' | 'password' | 'notifications' | 'privacy' | 'language'
  >('profile');

  // Password change state
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  // Notification preferences
  const [notifications, setNotifications] = useState({
    emailReminders: true,
    smsReminders: true,
    shipmentUpdates: true,
    promotionalEmails: false,
    appointmentReminders: true,
  });
  const [notifLoading, setNotifLoading] = useState(true);
  const notifSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load notification preferences from server
  useEffect(() => {
    let cancelled = false;
    portalFetch('/api/patient-portal/notification-preferences')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || !data?.preferences) return;
        setNotifications(prev => ({ ...prev, ...data.preferences }));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setNotifLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Debounced save when notifications change (skip while loading)
  useEffect(() => {
    if (notifLoading) return;
    if (notifSaveTimerRef.current) clearTimeout(notifSaveTimerRef.current);
    notifSaveTimerRef.current = setTimeout(() => {
      portalFetch('/api/patient-portal/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: notifications }),
      }).catch(() => {});
    }, 1000);
    return () => {
      if (notifSaveTimerRef.current) clearTimeout(notifSaveTimerRef.current);
    };
  }, [notifications, notifLoading]);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      try {
        const res = await portalFetch('/api/auth/me');
        if (cancelled) return;
        if (!res.ok) {
          // If unauthorized, redirect to login
          if (res.status === 401) {
            router.replace(
              `/login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=no_session`
            );
            return;
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const user = data?.user;
        if (user) {
          setProfile({
            id: user.id || 0,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            email: user.email || '',
            phone: user.phone || '',
            dateOfBirth: user.dateOfBirth || '',
            address: user.address,
          });
        } else {
          router.replace(
            `/login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=no_session`
          );
          return;
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadProfile();
    return () => { cancelled = true; };
  }, [router]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const response = await portalFetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: profile?.firstName,
          lastName: profile?.lastName,
          phone: profile?.phone,
        }),
      });

      const sessionErr = getPortalResponseError(response);
      if (sessionErr) {
        toast.error(sessionErr);
        return;
      }
      if (!response.ok) {
        const data = await safeParseJson(response);
        const errMsg =
          data !== null && typeof data === 'object' && 'error' in data
            ? String((data as { error?: unknown }).error)
            : 'Failed to save profile';
        toast.error(errMsg);
        return;
      }

      // Keep only minimal identifiers in localStorage (no PHI)
      if (profile) {
        const currentUser = localStorage.getItem('user');
        const userData = safeParseJsonString<{ id?: number; role?: string; patientId?: number }>(currentUser) ?? {};
        setPortalUserStorage(getMinimalPortalUserPayload({ ...userData, patientId: userData.patientId }));
      }

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      toast.error('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwords.new !== passwords.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    if (passwords.new.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      const response = await portalFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new,
          confirmPassword: passwords.confirm,
        }),
      });

      const sessionErr = getPortalResponseError(response);
      if (sessionErr) {
        toast.error(sessionErr);
        return;
      }
      const data = await safeParseJson(response);
      if (!response.ok) {
        const errMsg =
          data !== null && typeof data === 'object' && 'error' in data
            ? String((data as { error?: unknown }).error)
            : 'Failed to change password';
        toast.error(errMsg);
        return;
      }

      setPasswords({ current: '', new: '', confirm: '' });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      toast.error('Failed to change password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token = localStorage.getItem('auth-token') || localStorage.getItem('patient-token');
    if (token)
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('patient-token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div
          className="h-12 w-12 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-xl bg-green-500 px-4 py-3 text-white shadow-lg">
          <Check className="h-5 w-5" />
          {t('changesSaved')}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{t('settingsTitle')}</h1>
        <p className="mt-1 text-gray-500">{t('settingsSubtitle')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-gray-100 bg-white p-2 shadow-sm" role="tablist">
            {[
              { id: 'profile', labelKey: 'settingsProfile', icon: User },
              { id: 'password', labelKey: 'settingsPassword', icon: Lock },
              { id: 'notifications', labelKey: 'settingsNotifications', icon: Bell },
              { id: 'language', labelKey: 'settingsLanguage', icon: Languages },
              { id: 'privacy', labelKey: 'settingsPrivacy', icon: Shield },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveSection(item.id as any)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all ${
                    isActive ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  style={isActive ? { backgroundColor: primaryColor } : {}}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{t(item.labelKey)}</span>
                </button>
              );
            })}

            <hr className="my-2" />

            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-red-600 transition-all hover:bg-red-50"
            >
              <LogOut className="h-5 w-5" />
              <span className="font-medium">{t('navSignOut')}</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {/* Profile Section */}
          {activeSection === 'profile' && profile && (
            <div role="tabpanel" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-6 text-lg font-semibold text-gray-900">{t('personalInfo')}</h2>

              <div className="mb-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    {t('firstName')}
                  </label>
                  <input
                    type="text"
                    value={profile.firstName}
                    onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                    style={ringColorStyle(primaryColor)}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    {t('lastName')}
                  </label>
                  <input
                    type="text"
                    value={profile.lastName}
                    onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                    style={ringColorStyle(primaryColor)}
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">{t('email')}</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                    style={ringColorStyle(primaryColor)}
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">{t('phone')}</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                    style={ringColorStyle(primaryColor)}
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {t('dateOfBirth')}
                </label>
                <input
                  type="date"
                  value={profile.dateOfBirth || ''}
                  onChange={(e) => setProfile({ ...profile, dateOfBirth: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                  style={ringColorStyle(primaryColor)}
                />
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="rounded-xl px-6 py-3 font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {saving ? t('saving') : t('saveChanges')}
              </button>
            </div>
          )}

          {/* Language Section */}
          {activeSection === 'language' && (
            <div role="tabpanel" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-semibold text-gray-900">{t('settingsLanguage')}</h2>
              <p className="mb-6 text-sm text-gray-500">{t('settingsLanguageDesc')}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`rounded-xl border-2 px-5 py-3 font-medium transition-all ${
                    language === 'en'
                      ? 'border-transparent text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                  style={language === 'en' ? { backgroundColor: primaryColor } : {}}
                >
                  {t('settingsEnglish')}
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage('es')}
                  className={`rounded-xl border-2 px-5 py-3 font-medium transition-all ${
                    language === 'es'
                      ? 'border-transparent text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                  style={language === 'es' ? { backgroundColor: primaryColor } : {}}
                >
                  {t('settingsSpanish')}
                </button>
              </div>
            </div>
          )}

          {/* Password Section */}
          {activeSection === 'password' && (
            <div role="tabpanel" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-6 text-lg font-semibold text-gray-900">{t('changePassword')}</h2>

              <div className="mb-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    {t('currentPassword')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.current ? 'text' : 'password'}
                      value={passwords.current}
                      onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                      style={ringColorStyle(primaryColor)}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowPasswords({ ...showPasswords, current: !showPasswords.current })
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.current ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    {t('newPassword')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.new ? 'text' : 'password'}
                      value={passwords.new}
                      onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                      style={ringColorStyle(primaryColor)}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowPasswords({ ...showPasswords, new: !showPasswords.new })
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.new ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    {t('confirmNewPassword')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                      style={ringColorStyle(primaryColor)}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.confirm ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={handlePasswordChange}
                disabled={saving || !passwords.current || !passwords.new || !passwords.confirm}
                className="rounded-xl px-6 py-3 font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {saving ? t('updating') : t('updatePassword')}
              </button>
            </div>
          )}

          {/* Notifications Section */}
          {activeSection === 'notifications' && (
            <div role="tabpanel" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-6 text-lg font-semibold text-gray-900">
                {t('notificationPreferences')}
              </h2>

              <div className="space-y-4">
                {[
                  {
                    key: 'emailReminders',
                    labelKey: 'emailReminders',
                    descKey: 'emailRemindersDesc',
                  },
                  { key: 'smsReminders', labelKey: 'smsReminders', descKey: 'smsRemindersDesc' },
                  {
                    key: 'shipmentUpdates',
                    labelKey: 'shipmentUpdates',
                    descKey: 'shipmentUpdatesDesc',
                  },
                  {
                    key: 'appointmentReminders',
                    labelKey: 'appointmentReminders',
                    descKey: 'appointmentRemindersDesc',
                  },
                  {
                    key: 'promotionalEmails',
                    labelKey: 'promotionalEmails',
                    descKey: 'promotionalEmailsDesc',
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between rounded-xl bg-gray-50 p-4"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{t(item.labelKey)}</p>
                      <p className="text-sm text-gray-500">{t(item.descKey)}</p>
                    </div>
                    <button
                      onClick={() =>
                        setNotifications({
                          ...notifications,
                          [item.key]: !notifications[item.key as keyof typeof notifications],
                        })
                      }
                      className={`relative h-6 w-12 rounded-full transition-colors ${
                        notifications[item.key as keyof typeof notifications] ? '' : 'bg-gray-300'
                      }`}
                      style={
                        notifications[item.key as keyof typeof notifications]
                          ? { backgroundColor: primaryColor }
                          : {}
                      }
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          notifications[item.key as keyof typeof notifications]
                            ? 'left-6'
                            : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Privacy Section */}
          {activeSection === 'privacy' && (
            <div role="tabpanel" className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-6 text-lg font-semibold text-gray-900">{t('privacyData')}</h2>

              <div className="mb-6 space-y-4">
                <a
                  href="/privacy-policy"
                  target="_blank"
                  className="flex items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                >
                  <span className="font-medium text-gray-900">{t('privacyPolicy')}</span>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </a>
                <a
                  href="/terms-of-service"
                  target="_blank"
                  className="flex items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                >
                  <span className="font-medium text-gray-900">{t('termsOfService')}</span>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </a>
                <a
                  href="/hipaa-notice"
                  target="_blank"
                  className="flex items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                >
                  <span className="font-medium text-gray-900">{t('hipaaNotice')}</span>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </a>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="mb-2 font-semibold text-amber-900">{t('requestDataExport')}</h3>
                <p className="mb-3 text-sm text-amber-800">{t('requestDataExportDesc')}</p>
                <button className="text-sm font-medium text-amber-700 hover:text-amber-900">
                  {t('requestDataExportBtn')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
