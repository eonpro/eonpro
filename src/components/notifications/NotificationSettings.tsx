'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bell,
  Volume2,
  VolumeX,
  Moon,
  Clock,
  Monitor,
  Smartphone,
  Check,
  X,
  Pill,
  User,
  Package,
  AlertCircle,
  Calendar,
  MessageSquare,
  CreditCard,
  RefreshCw,
  ChevronDown,
  Save,
  RotateCcw,
} from 'lucide-react';
import { useNotificationContext, type NotificationPreferences } from './NotificationProvider';
import type { NotificationCategory } from '@/hooks/useNotifications';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';

// ============================================================================
// Category Config
// ============================================================================

const categoryConfig: Record<NotificationCategory, { icon: typeof Bell; color: string; bgColor: string; label: string }> = {
  PRESCRIPTION: { icon: Pill, color: 'text-purple-600', bgColor: 'bg-purple-100', label: 'Prescriptions' },
  PATIENT: { icon: User, color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Patients' },
  ORDER: { icon: Package, color: 'text-green-600', bgColor: 'bg-green-100', label: 'Orders' },
  SYSTEM: { icon: AlertCircle, color: 'text-orange-600', bgColor: 'bg-orange-100', label: 'System' },
  APPOINTMENT: { icon: Calendar, color: 'text-cyan-600', bgColor: 'bg-cyan-100', label: 'Appointments' },
  MESSAGE: { icon: MessageSquare, color: 'text-indigo-600', bgColor: 'bg-indigo-100', label: 'Messages' },
  PAYMENT: { icon: CreditCard, color: 'text-emerald-600', bgColor: 'bg-emerald-100', label: 'Payments' },
  REFILL: { icon: RefreshCw, color: 'text-pink-600', bgColor: 'bg-pink-100', label: 'Refills' },
  SHIPMENT: { icon: Package, color: 'text-amber-600', bgColor: 'bg-amber-100', label: 'Shipments' },
};

const categories: NotificationCategory[] = [
  'PRESCRIPTION', 'PATIENT', 'ORDER', 'SYSTEM', 
  'APPOINTMENT', 'MESSAGE', 'PAYMENT', 'REFILL', 'SHIPMENT'
];

const daysOfWeek = [
  { id: 0, label: 'Sun' },
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
];

const toastPositions = [
  { id: 'top-right', label: 'Top Right' },
  { id: 'top-left', label: 'Top Left' },
  { id: 'bottom-right', label: 'Bottom Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
] as const;

// ============================================================================
// Toggle Switch
// ============================================================================

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  size?: 'sm' | 'md';
}

function ToggleSwitch({ enabled, onChange, size = 'md' }: ToggleSwitchProps) {
  const sizeClasses = size === 'sm' 
    ? 'w-9 h-5' 
    : 'w-11 h-6';
  const knobClasses = size === 'sm'
    ? 'w-3.5 h-3.5 top-0.5 left-0.5'
    : 'w-4 h-4 top-1 left-1';
  const translateClass = size === 'sm' ? 'translate-x-4' : 'translate-x-5';

  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative ${sizeClasses} rounded-full transition-colors ${
        enabled ? 'bg-blue-500' : 'bg-gray-300'
      }`}
    >
      <span className={`absolute ${knobClasses} bg-white rounded-full transition-transform ${
        enabled ? translateClass : ''
      }`} />
    </button>
  );
}

// ============================================================================
// Setting Section
// ============================================================================

interface SettingSectionProps {
  title: string;
  description?: string;
  icon: typeof Bell;
  children: React.ReactNode;
}

function SettingSection({ title, description, icon: Icon, children }: SettingSectionProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <Icon className="h-5 w-5 text-gray-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {description && (
            <p className="text-sm text-gray-500">{description}</p>
          )}
        </div>
      </div>
      <div className="p-6 space-y-4">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function NotificationSettings() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';
  
  const {
    preferences,
    updatePreferences,
    requestBrowserPermission,
    muteCategory,
    unmuteCategory,
  } = useNotificationContext();

  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (changes: Partial<NotificationPreferences>) => {
    updatePreferences(changes);
    setHasChanges(true);
  };

  const handleBrowserPermission = async () => {
    const granted = await requestBrowserPermission();
    if (!granted) {
      alert('Browser notifications were blocked. Please enable them in your browser settings.');
    }
  };

  const handleDayToggle = (day: number) => {
    const currentDays = preferences.dndSchedule.days;
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort();
    
    handleChange({
      dndSchedule: {
        ...preferences.dndSchedule,
        days: newDays,
      },
    });
  };

  const handlePriorityToggle = (priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT') => {
    const current = preferences.soundForPriorities;
    const newPriorities = current.includes(priority)
      ? current.filter(p => p !== priority)
      : [...current, priority];
    
    handleChange({ soundForPriorities: newPriorities });
  };

  return (
    <div className="space-y-6">
      {/* Sound Settings */}
      <SettingSection
        title="Sound Notifications"
        description="Configure audio alerts for incoming notifications"
        icon={Volume2}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Enable sounds</p>
            <p className="text-sm text-gray-500">Play a sound when notifications arrive</p>
          </div>
          <ToggleSwitch
            enabled={preferences.soundEnabled}
            onChange={(enabled) => handleChange({ soundEnabled: enabled })}
          />
        </div>

        {preferences.soundEnabled && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Volume</label>
              <div className="flex items-center gap-3">
                <VolumeX className="h-4 w-4 text-gray-400" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={preferences.soundVolume}
                  onChange={(e) => handleChange({ soundVolume: Number(e.target.value) })}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${primaryColor} 0%, ${primaryColor} ${preferences.soundVolume}%, #e5e7eb ${preferences.soundVolume}%, #e5e7eb 100%)`,
                  }}
                />
                <Volume2 className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600 w-10">{preferences.soundVolume}%</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Play sound for priorities</label>
              <div className="flex flex-wrap gap-2">
                {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((priority) => (
                  <button
                    key={priority}
                    onClick={() => handlePriorityToggle(priority)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      preferences.soundForPriorities.includes(priority)
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-200'
                        : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                    }`}
                  >
                    {priority}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </SettingSection>

      {/* Toast Settings */}
      <SettingSection
        title="Toast Notifications"
        description="Pop-up alerts that appear on screen"
        icon={Monitor}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Enable toasts</p>
            <p className="text-sm text-gray-500">Show pop-up notifications</p>
          </div>
          <ToggleSwitch
            enabled={preferences.toastEnabled}
            onChange={(enabled) => handleChange({ toastEnabled: enabled })}
          />
        </div>

        {preferences.toastEnabled && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Display duration</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="3000"
                  max="15000"
                  step="1000"
                  value={preferences.toastDuration}
                  onChange={(e) => handleChange({ toastDuration: Number(e.target.value) })}
                  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-sm text-gray-600 w-16">
                  {preferences.toastDuration / 1000}s
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Position</label>
              <div className="grid grid-cols-2 gap-2">
                {toastPositions.map((pos) => (
                  <button
                    key={pos.id}
                    onClick={() => handleChange({ toastPosition: pos.id })}
                    className={`p-3 rounded-xl text-sm font-medium transition-colors border-2 ${
                      preferences.toastPosition === pos.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </SettingSection>

      {/* Browser Notifications */}
      <SettingSection
        title="Browser Notifications"
        description="Native desktop notifications"
        icon={Smartphone}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Enable browser notifications</p>
            <p className="text-sm text-gray-500">Show notifications even when tab is in background</p>
          </div>
          {preferences.browserNotificationsEnabled ? (
            <ToggleSwitch
              enabled={preferences.browserNotificationsEnabled}
              onChange={(enabled) => handleChange({ browserNotificationsEnabled: enabled })}
            />
          ) : (
            <button
              onClick={handleBrowserPermission}
              className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-xl hover:bg-blue-600 transition-colors"
            >
              Enable
            </button>
          )}
        </div>
      </SettingSection>

      {/* Do Not Disturb */}
      <SettingSection
        title="Do Not Disturb"
        description="Temporarily pause notifications"
        icon={Moon}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Manual DND</p>
            <p className="text-sm text-gray-500">Turn on Do Not Disturb right now</p>
          </div>
          <ToggleSwitch
            enabled={preferences.dndEnabled}
            onChange={(enabled) => handleChange({ dndEnabled: enabled })}
          />
        </div>

        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium text-gray-900">Scheduled DND</p>
              <p className="text-sm text-gray-500">Automatically enable during specific times</p>
            </div>
            <ToggleSwitch
              enabled={preferences.dndSchedule.enabled}
              onChange={(enabled) => handleChange({
                dndSchedule: { ...preferences.dndSchedule, enabled },
              })}
            />
          </div>

          {preferences.dndSchedule.enabled && (
            <div className="space-y-4 mt-4 p-4 bg-gray-50 rounded-xl">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Start time</label>
                  <input
                    type="time"
                    value={preferences.dndSchedule.startTime}
                    onChange={(e) => handleChange({
                      dndSchedule: { ...preferences.dndSchedule, startTime: e.target.value },
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">End time</label>
                  <input
                    type="time"
                    value={preferences.dndSchedule.endTime}
                    onChange={(e) => handleChange({
                      dndSchedule: { ...preferences.dndSchedule, endTime: e.target.value },
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Days</label>
                <div className="flex gap-2">
                  {daysOfWeek.map((day) => (
                    <button
                      key={day.id}
                      onClick={() => handleDayToggle(day.id)}
                      className={`w-10 h-10 rounded-xl text-sm font-medium transition-colors ${
                        preferences.dndSchedule.days.includes(day.id)
                          ? 'bg-blue-500 text-white'
                          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </SettingSection>

      {/* Category Preferences */}
      <SettingSection
        title="Category Preferences"
        description="Mute notifications by category"
        icon={Bell}
      >
        <div className="space-y-2">
          {categories.map((cat) => {
            const config = categoryConfig[cat];
            const Icon = config.icon;
            const isMuted = preferences.mutedCategories.includes(cat);
            
            return (
              <div
                key={cat}
                className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg ${config.bgColor} flex items-center justify-center`}>
                    <Icon className={`h-4 w-4 ${config.color}`} />
                  </div>
                  <span className="font-medium text-gray-900">{config.label}</span>
                </div>
                <button
                  onClick={() => isMuted ? unmuteCategory(cat) : muteCategory(cat)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isMuted
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  {isMuted ? 'Muted' : 'Active'}
                </button>
              </div>
            );
          })}
        </div>
      </SettingSection>

      {/* Display Settings */}
      <SettingSection
        title="Display Settings"
        description="Customize how notifications appear"
        icon={Monitor}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Group by date</p>
            <p className="text-sm text-gray-500">Group notifications by Today, Yesterday, Earlier</p>
          </div>
          <ToggleSwitch
            enabled={preferences.groupSimilar}
            onChange={(enabled) => handleChange({ groupSimilar: enabled })}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Show unread count in tab</p>
            <p className="text-sm text-gray-500">Display badge in browser tab title</p>
          </div>
          <ToggleSwitch
            enabled={preferences.showDesktopBadge}
            onChange={(enabled) => handleChange({ showDesktopBadge: enabled })}
          />
        </div>
      </SettingSection>
    </div>
  );
}
