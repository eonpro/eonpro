'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';
import { safeParseJson, safeParseJsonString } from '@/lib/utils/safe-json';
import { getMinimalPortalUserPayload, setPortalUserStorage } from '@/lib/utils/portal-user-storage';
import { ringColorStyle } from '@/lib/utils/css-ring-color';
import { logger } from '@/lib/logger';
import { todayET } from '@/lib/utils/timezone';
import { toast } from '@/components/Toast';
import dynamic from 'next/dynamic';
import type { AddressData } from '@/components/AddressAutocomplete';

const AddressInput = dynamic(
  () => import('@/components/AddressAutocomplete').then((mod) => mod.AddressInput),
  { ssr: false, loading: () => <div className="h-10 animate-pulse rounded-lg bg-gray-100" /> },
);
const SettingsAuxPanels = dynamic(
  () => import('@/components/patient-portal/settings/SettingsAuxPanels'),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="h-6 w-44 animate-pulse rounded bg-gray-100" />
        <div className="mt-4 space-y-3">
          <div className="h-12 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-12 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-12 animate-pulse rounded-xl bg-gray-100" />
        </div>
      </div>
    ),
  },
);
import {
  User,
  Mail,
  Phone,
  Lock,
  Bell,
  Shield,
  LogOut,
  Check,
  Languages,
  Camera,
  Loader2,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { EditableAvatar } from '@/components/UserAvatar';
import {
  ACCEPTED_IMAGE_MIME_TYPES,
  ACCEPTED_IMAGE_LABEL,
} from '@/lib/config/upload-formats';

interface UserProfile {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth?: string;
  avatarUrl?: string | null;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email format';
  return null;
}

function validatePhone(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length > 0 && digits.length < 10) return 'Phone number must be at least 10 digits';
  return null;
}

function validateDOB(dob: string): string | null {
  if (!dob) return null;
  const date = new Date(dob);
  if (isNaN(date.getTime())) return 'Invalid date';
  const now = new Date();
  if (date > now) return 'Date of birth cannot be in the future';
  const age = now.getFullYear() - date.getFullYear();
  if (age > 150) return 'Date of birth is out of valid range';
  return null;
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
  const [notifLoaded, setNotifLoaded] = useState(false);
  const notifSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load notification preferences lazily when notifications tab is opened
  useEffect(() => {
    if (activeSection !== 'notifications' || notifLoaded) return;
    let cancelled = false;
    portalFetch('/api/patient-portal/notification-preferences')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || !data?.preferences) return;
        setNotifications(prev => ({ ...prev, ...data.preferences }));
      })
      .catch((err) => {
        logger.warn('Failed to load notification preferences', {
          error: err instanceof Error ? err.message : 'Unknown',
        });
      })
      .finally(() => {
        if (!cancelled) {
          setNotifLoading(false);
          setNotifLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [activeSection, notifLoaded]);

  // Debounced save when notifications change (skip while loading)
  useEffect(() => {
    if (activeSection !== 'notifications' || notifLoading || !notifLoaded) return;
    if (notifSaveTimerRef.current) clearTimeout(notifSaveTimerRef.current);
    notifSaveTimerRef.current = setTimeout(() => {
      portalFetch('/api/patient-portal/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: notifications }),
      }).then((res) => {
        if (!res.ok) toast.error('Failed to save notification preferences');
      }).catch((err) => {
        logger.warn('Failed to save notification preferences', {
          error: err instanceof Error ? err.message : 'Unknown',
        });
        toast.error('Failed to save notification preferences');
      });
    }, 1000);
    return () => {
      if (notifSaveTimerRef.current) clearTimeout(notifSaveTimerRef.current);
    };
  }, [notifications, notifLoading, notifLoaded, activeSection]);

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Profile picture state
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load profile picture
  useEffect(() => {
    let cancelled = false;
    portalFetch('/api/user/profile-picture')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.avatarUrl) setAvatarUrl(data.avatarUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';

    const accepted = ACCEPTED_IMAGE_MIME_TYPES as readonly string[];
    if (!accepted.includes(file.type.toLowerCase())) {
      setAvatarError(`Please use ${ACCEPTED_IMAGE_LABEL} format.`);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Photo must be under 5 MB.');
      return;
    }

    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await portalFetch('/api/user/profile-picture', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const body = await safeParseJson(res);
        throw new Error(
          body && typeof body === 'object' && 'error' in body
            ? String((body as { error?: unknown }).error)
            : 'Upload failed',
        );
      }
      const data = await res.json();
      const newUrl = data.avatarUrl || null;
      setAvatarUrl(newUrl);
      window.dispatchEvent(new CustomEvent('avatar-updated', { detail: { avatarUrl: newUrl } }));
      toast.success('Profile picture updated');
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarDelete = async () => {
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const res = await portalFetch('/api/user/profile-picture', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove picture');
      setAvatarUrl(null);
      window.dispatchEvent(new CustomEvent('avatar-updated', { detail: { avatarUrl: null } }));
      toast.success('Profile picture removed');
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setAvatarUploading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      try {
        const res = await portalFetch('/api/user/profile');
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 401) {
            router.replace(
              `/patient-login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=no_session`
            );
            return;
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data) {
          setProfile({
            id: data.id || 0,
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            email: data.email || '',
            phone: data.phone || '',
            dateOfBirth: data.dateOfBirth || '',
            avatarUrl: data.avatarUrl || null,
            address: data.address || undefined,
          });
        } else {
          router.replace(
            `/patient-login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}&reason=no_session`
          );
          return;
        }
      } catch (err) {
        logger.error('[Settings] Profile load failed', { error: err instanceof Error ? err.message : String(err) });
        toast.error('Unable to load your profile. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadProfile();
    return () => { cancelled = true; };
  }, [router]);

  const handleSaveProfile = async () => {
    if (!profile) return;

    const errors: Record<string, string> = {};
    const emailErr = validateEmail(profile.email);
    if (emailErr) errors.email = emailErr;
    const phoneErr = validatePhone(profile.phone);
    if (phoneErr) errors.phone = phoneErr;
    const dobErr = validateDOB(profile.dateOfBirth || '');
    if (dobErr) errors.dateOfBirth = dobErr;
    if (!profile.firstName.trim()) errors.firstName = 'First name is required';
    if (!profile.lastName.trim()) errors.lastName = 'Last name is required';

    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Please fix the validation errors before saving');
      return;
    }

    setSaving(true);
    try {
      const response = await portalFetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: profile.firstName.trim(),
          lastName: profile.lastName.trim(),
          email: profile.email.trim(),
          phone: profile.phone.trim() || null,
          dateOfBirth: profile.dateOfBirth || null,
          address: profile.address || null,
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

      if (profile) {
        const currentUser = localStorage.getItem('user');
        const userData = safeParseJsonString<{ id?: number; role?: string; patientId?: number }>(currentUser) ?? {};
        setPortalUserStorage(getMinimalPortalUserPayload({ ...userData, patientId: userData.patientId }));
      }

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      toast.success('Profile saved successfully');
    } catch (error) {
      toast.error('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!passwords.current) {
      toast.error('Please enter your current password');
      return;
    }
    if (passwords.new !== passwords.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    if (passwords.new.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (passwords.new.length > 128) {
      toast.error('Password must be 128 characters or fewer');
      return;
    }
    if (!/[A-Z]/.test(passwords.new)) {
      toast.error('Password must include at least one uppercase letter');
      return;
    }
    if (!/[a-z]/.test(passwords.new)) {
      toast.error('Password must include at least one lowercase letter');
      return;
    }
    if (!/[0-9]/.test(passwords.new)) {
      toast.error('Password must include at least one number');
      return;
    }
    if (passwords.new === passwords.current) {
      toast.error('New password must be different from your current password');
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
      }).catch(() => {
        // Logout is best-effort — user is redirected regardless
      });
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('patient-token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/patient-login';
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
            {([
              { id: 'profile' as const, labelKey: 'settingsProfile', icon: User },
              { id: 'password' as const, labelKey: 'settingsPassword', icon: Lock },
              { id: 'notifications' as const, labelKey: 'settingsNotifications', icon: Bell },
              { id: 'language' as const, labelKey: 'settingsLanguage', icon: Languages },
              { id: 'privacy' as const, labelKey: 'settingsPrivacy', icon: Shield },
            ]).map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveSection(item.id)}
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
            <div role="tabpanel" className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
              <h2 className="mb-6 text-lg font-semibold text-gray-900">{t('personalInfo')}</h2>

              {/* Profile Picture */}
              <div className="mb-8 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <EditableAvatar
                  avatarUrl={avatarUrl}
                  firstName={profile.firstName}
                  lastName={profile.lastName}
                  size="2xl"
                  onEdit={() => fileInputRef.current?.click()}
                  isLoading={avatarUploading}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={[...ACCEPTED_IMAGE_MIME_TYPES].map((t) => `.${t.split('/')[1]}`).join(',')}
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
                <div className="flex flex-col items-center gap-2 sm:items-start sm:pt-2">
                  <p className="text-sm font-medium text-gray-900">Profile Picture</p>
                  <p className="text-xs text-gray-500">{ACCEPTED_IMAGE_LABEL} — Max 5 MB</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      {avatarUrl ? 'Change' : 'Upload'}
                    </button>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={handleAvatarDelete}
                        disabled={avatarUploading}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                  {avatarError && (
                    <div className="flex items-center gap-1.5 text-xs text-red-600">
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      {avatarError}
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    {t('firstName')}
                  </label>
                  <input
                    type="text"
                    value={profile.firstName}
                    onChange={(e) => { setProfile({ ...profile, firstName: e.target.value }); setValidationErrors((prev) => { const { firstName: _, ...rest } = prev; return rest; }); }}
                    className={`w-full rounded-xl border px-4 py-3 focus:outline-none focus:ring-2 focus:ring-opacity-50 ${validationErrors.firstName ? 'border-red-300' : 'border-gray-200'}`}
                    style={ringColorStyle(primaryColor)}
                  />
                  {validationErrors.firstName && <p className="mt-1 text-sm text-red-600">{validationErrors.firstName}</p>}
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    {t('lastName')}
                  </label>
                  <input
                    type="text"
                    value={profile.lastName}
                    onChange={(e) => { setProfile({ ...profile, lastName: e.target.value }); setValidationErrors((prev) => { const { lastName: _, ...rest } = prev; return rest; }); }}
                    className={`w-full rounded-xl border px-4 py-3 focus:outline-none focus:ring-2 focus:ring-opacity-50 ${validationErrors.lastName ? 'border-red-300' : 'border-gray-200'}`}
                    style={ringColorStyle(primaryColor)}
                  />
                  {validationErrors.lastName && <p className="mt-1 text-sm text-red-600">{validationErrors.lastName}</p>}
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">{t('email')}</label>
                <div className="relative">
                  <Mail className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 transition-opacity duration-200 ${profile.email ? 'opacity-0' : 'opacity-100'}`} />
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => { setProfile({ ...profile, email: e.target.value }); setValidationErrors((prev) => { const { email: _, ...rest } = prev; return rest; }); }}
                    className={`w-full rounded-xl border py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-opacity-50 ${validationErrors.email ? 'border-red-300' : 'border-gray-200'}`}
                    style={ringColorStyle(primaryColor)}
                  />
                </div>
                {validationErrors.email && <p className="mt-1 text-sm text-red-600">{validationErrors.email}</p>}
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">{t('phone')}</label>
                <div className="relative">
                  <Phone className={`absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 transition-opacity duration-200 ${profile.phone ? 'opacity-0' : 'opacity-100'}`} />
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => { setProfile({ ...profile, phone: e.target.value }); setValidationErrors((prev) => { const { phone: _, ...rest } = prev; return rest; }); }}
                    className={`w-full rounded-xl border py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-opacity-50 ${validationErrors.phone ? 'border-red-300' : 'border-gray-200'}`}
                    style={ringColorStyle(primaryColor)}
                  />
                </div>
                {validationErrors.phone && <p className="mt-1 text-sm text-red-600">{validationErrors.phone}</p>}
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  {t('dateOfBirth')}
                </label>
                <input
                  type="date"
                  value={profile.dateOfBirth || ''}
                  onChange={(e) => { setProfile({ ...profile, dateOfBirth: e.target.value }); setValidationErrors((prev) => { const { dateOfBirth: _, ...rest } = prev; return rest; }); }}
                  className={`w-full rounded-xl border px-4 py-3 focus:outline-none focus:ring-2 focus:ring-opacity-50 ${validationErrors.dateOfBirth ? 'border-red-300' : 'border-gray-200'}`}
                  style={ringColorStyle(primaryColor)}
                  max={todayET()}
                />
                {validationErrors.dateOfBirth && <p className="mt-1 text-sm text-red-600">{validationErrors.dateOfBirth}</p>}
              </div>

              <div className="mb-6">
                <h3 className="mb-3 text-sm font-semibold text-gray-700">{t('address') || 'Address'}</h3>
                <div className="space-y-3">
                  <AddressInput
                    value={profile.address?.street || ''}
                    onChange={(value: string, parsed?: AddressData) => {
                      const base = profile.address || { street: '', city: '', state: '', zip: '' };
                      if (parsed) {
                        setProfile({
                          ...profile,
                          address: {
                            ...base,
                            street: parsed.address1,
                            city: parsed.city,
                            state: parsed.state,
                            zip: parsed.zip,
                          },
                        });
                      } else {
                        setProfile({
                          ...profile,
                          address: { ...base, street: value },
                        });
                      }
                    }}
                    placeholder={t('street') || 'Street address'}
                    className="w-full"
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <input
                      type="text"
                      placeholder={t('city') || 'City'}
                      value={profile.address?.city || ''}
                      onChange={(e) => setProfile({ ...profile, address: { ...(profile.address || { street: '', city: '', state: '', zip: '' }), city: e.target.value } })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                      style={ringColorStyle(primaryColor)}
                    />
                    <input
                      type="text"
                      placeholder={t('state') || 'State'}
                      value={profile.address?.state || ''}
                      onChange={(e) => setProfile({ ...profile, address: { ...(profile.address || { street: '', city: '', state: '', zip: '' }), state: e.target.value } })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                      style={ringColorStyle(primaryColor)}
                    />
                    <input
                      type="text"
                      placeholder={t('zip') || 'ZIP Code'}
                      value={profile.address?.zip || ''}
                      onChange={(e) => setProfile({ ...profile, address: { ...(profile.address || { street: '', city: '', state: '', zip: '' }), zip: e.target.value } })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                      style={ringColorStyle(primaryColor)}
                    />
                  </div>
                </div>
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

          {activeSection !== 'profile' && (
            <SettingsAuxPanels
              activeSection={activeSection}
              t={t}
              primaryColor={primaryColor}
              language={language}
              setLanguage={setLanguage}
              passwords={passwords}
              showPasswords={showPasswords}
              setShowPasswords={setShowPasswords}
              setPasswords={setPasswords}
              saving={saving}
              handlePasswordChange={handlePasswordChange}
              notifications={notifications}
              setNotifications={setNotifications}
            />
          )}
        </div>
      </div>
    </div>
  );
}
