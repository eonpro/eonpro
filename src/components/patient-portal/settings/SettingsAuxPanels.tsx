'use client';

import { Bell, ChevronRight, Eye, EyeOff, Shield } from 'lucide-react';
import { ringColorStyle } from '@/lib/utils/css-ring-color';

type ActiveSection = 'profile' | 'password' | 'notifications' | 'privacy' | 'language';

interface PasswordState {
  current: string;
  new: string;
  confirm: string;
}

interface ShowPasswordsState {
  current: boolean;
  new: boolean;
  confirm: boolean;
}

interface NotificationsState {
  emailReminders: boolean;
  smsReminders: boolean;
  shipmentUpdates: boolean;
  promotionalEmails: boolean;
  appointmentReminders: boolean;
}

export default function SettingsAuxPanels({
  activeSection,
  t,
  primaryColor,
  language,
  setLanguage,
  passwords,
  showPasswords,
  setShowPasswords,
  setPasswords,
  saving,
  handlePasswordChange,
  notifications,
  setNotifications,
}: {
  activeSection: ActiveSection;
  t: (key: string) => string;
  primaryColor: string;
  language: 'en' | 'es';
  setLanguage: (lang: 'en' | 'es') => void;
  passwords: PasswordState;
  showPasswords: ShowPasswordsState;
  setShowPasswords: React.Dispatch<React.SetStateAction<ShowPasswordsState>>;
  setPasswords: React.Dispatch<React.SetStateAction<PasswordState>>;
  saving: boolean;
  handlePasswordChange: () => Promise<void>;
  notifications: NotificationsState;
  setNotifications: React.Dispatch<React.SetStateAction<NotificationsState>>;
}) {
  return (
    <>
      {activeSection === 'language' && (
        <div
          role="tabpanel"
          className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6"
        >
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

      {activeSection === 'password' && (
        <div
          role="tabpanel"
          className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6"
        >
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
                  onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPasswords.new ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                At least 8 characters with uppercase, lowercase, and a number
              </p>
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

      {activeSection === 'notifications' && (
        <div
          role="tabpanel"
          className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6"
        >
          <h2 className="mb-6 text-lg font-semibold text-gray-900">
            {t('notificationPreferences')}
          </h2>

          <div className="space-y-4">
            {[
              { key: 'emailReminders', labelKey: 'emailReminders', descKey: 'emailRemindersDesc' },
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
                      [item.key]: !notifications[item.key as keyof NotificationsState],
                    })
                  }
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                    notifications[item.key as keyof NotificationsState] ? '' : 'bg-gray-300'
                  }`}
                  style={
                    notifications[item.key as keyof NotificationsState]
                      ? { backgroundColor: primaryColor }
                      : {}
                  }
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                      notifications[item.key as keyof NotificationsState]
                        ? 'translate-x-6'
                        : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'privacy' && (
        <div
          role="tabpanel"
          className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6"
        >
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
    </>
  );
}
