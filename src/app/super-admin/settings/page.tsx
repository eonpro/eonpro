'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings, Shield, Bell, Mail,
  Lock, Save, Check, AlertCircle, ToggleLeft, ToggleRight
} from 'lucide-react';

interface GlobalSettings {
  sessionTimeout: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  requireMFA: boolean;
  passwordMinLength: number;
  requireStrongPassword: boolean;
  emailProvider: string;
  fromEmail: string;
  fromName: string;
  demoMode: boolean;
  maintenanceMode: boolean;
  newRegistrations: boolean;
  patientPortalEnabled: boolean;
  hipaaMode: boolean;
  auditLogRetention: number;
  dataRetention: number;
}

export default function GlobalSettingsPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'security' | 'email' | 'features' | 'compliance'>('security');

  const [settings, setSettings] = useState<GlobalSettings>({
    sessionTimeout: 15,
    maxLoginAttempts: 3,
    lockoutDuration: 30,
    requireMFA: false,
    passwordMinLength: 12,
    requireStrongPassword: true,
    emailProvider: 'sendgrid',
    fromEmail: 'noreply@eonpro.com',
    fromName: 'EONPRO',
    demoMode: true,
    maintenanceMode: false,
    newRegistrations: true,
    patientPortalEnabled: true,
    hipaaMode: true,
    auditLogRetention: 2555,
    dataRetention: 365,
  });

  const handleChange = (field: keyof GlobalSettings, value: string | number | boolean) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ enabled, onChange }: { enabled: boolean; onChange: (val: boolean) => void }) => (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? 'bg-[#4fa77e]' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  const tabs = [
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'features', label: 'Features', icon: ToggleLeft },
    { id: 'compliance', label: 'Compliance', icon: Lock },
  ];

  return (
    <div className="p-6 lg:p-8 min-h-screen">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Global Settings</h1>
          <p className="text-gray-500 mt-1">Platform-wide configuration and security settings</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all shadow-sm ${
            saved
              ? 'bg-[#4fa77e] text-white'
              : 'bg-[#4fa77e] text-white hover:bg-[#3d9268]'
          }`}
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              Saving...
            </>
          ) : saved ? (
            <>
              <Check className="h-5 w-5" />
              Saved!
            </>
          ) : (
            <>
              <Save className="h-5 w-5" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 bg-white p-1 rounded-xl mb-6 w-fit shadow-sm border border-gray-100">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[#4fa77e]/10 text-[#4fa77e]'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Security Settings */}
      {activeTab === 'security' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Security Settings
          </h2>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Session Timeout (minutes)
                </label>
                <input
                  type="number"
                  value={settings.sessionTimeout}
                  onChange={(e) => handleChange('sessionTimeout', parseInt(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                />
                <p className="text-xs text-gray-500 mt-1">Idle timeout before auto-logout</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Login Attempts
                </label>
                <input
                  type="number"
                  value={settings.maxLoginAttempts}
                  onChange={(e) => handleChange('maxLoginAttempts', parseInt(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                />
                <p className="text-xs text-gray-500 mt-1">Before account lockout</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lockout Duration (minutes)
                </label>
                <input
                  type="number"
                  value={settings.lockoutDuration}
                  onChange={(e) => handleChange('lockoutDuration', parseInt(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Password Length
                </label>
                <input
                  type="number"
                  value={settings.passwordMinLength}
                  onChange={(e) => handleChange('passwordMinLength', parseInt(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                />
              </div>
            </div>
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Require Two-Factor Authentication</p>
                  <p className="text-sm text-gray-500">Enforce 2FA for all admin and provider accounts</p>
                </div>
                <Toggle enabled={settings.requireMFA} onChange={(val) => handleChange('requireMFA', val)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Require Strong Passwords</p>
                  <p className="text-sm text-gray-500">Must contain uppercase, lowercase, numbers, and symbols</p>
                </div>
                <Toggle enabled={settings.requireStrongPassword} onChange={(val) => handleChange('requireStrongPassword', val)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Settings */}
      {activeTab === 'email' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <Mail className="h-5 w-5 text-purple-600" />
            Email Configuration
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Provider
              </label>
              <select
                value={settings.emailProvider}
                onChange={(e) => handleChange('emailProvider', e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e] bg-white"
              >
                <option value="sendgrid">SendGrid</option>
                <option value="ses">AWS SES</option>
                <option value="mailgun">Mailgun</option>
                <option value="resend">Resend</option>
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Email Address
                </label>
                <input
                  type="email"
                  value={settings.fromEmail}
                  onChange={(e) => handleChange('fromEmail', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Name
                </label>
                <input
                  type="text"
                  value={settings.fromName}
                  onChange={(e) => handleChange('fromName', e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feature Flags */}
      {activeTab === 'features' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <ToggleRight className="h-5 w-5 text-[#4fa77e]" />
            Feature Flags
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="font-medium text-gray-900">Demo Mode</p>
                <p className="text-sm text-gray-500">Enable demo login for testing purposes</p>
              </div>
              <Toggle enabled={settings.demoMode} onChange={(val) => handleChange('demoMode', val)} />
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="font-medium text-gray-900">Maintenance Mode</p>
                <p className="text-sm text-gray-500">Show maintenance page to all users except super admins</p>
              </div>
              <Toggle enabled={settings.maintenanceMode} onChange={(val) => handleChange('maintenanceMode', val)} />
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="font-medium text-gray-900">New Registrations</p>
                <p className="text-sm text-gray-500">Allow new clinic registrations</p>
              </div>
              <Toggle enabled={settings.newRegistrations} onChange={(val) => handleChange('newRegistrations', val)} />
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-gray-900">Patient Portal</p>
                <p className="text-sm text-gray-500">Enable patient self-service portal</p>
              </div>
              <Toggle enabled={settings.patientPortalEnabled} onChange={(val) => handleChange('patientPortalEnabled', val)} />
            </div>
          </div>
        </div>
      )}

      {/* Compliance Settings */}
      {activeTab === 'compliance' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <Lock className="h-5 w-5 text-red-600" />
            HIPAA Compliance Settings
          </h2>
          <div className="space-y-6">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="font-medium text-gray-900">HIPAA Mode</p>
                <p className="text-sm text-gray-500">Enable enhanced security and audit logging for HIPAA compliance</p>
              </div>
              <Toggle enabled={settings.hipaaMode} onChange={(val) => handleChange('hipaaMode', val)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Audit Log Retention (days)
                </label>
                <input
                  type="number"
                  value={settings.auditLogRetention}
                  onChange={(e) => handleChange('auditLogRetention', parseInt(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                />
                <p className="text-xs text-gray-500 mt-1">HIPAA requires minimum 6 years (2190 days)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Retention (days)
                </label>
                <input
                  type="number"
                  value={settings.dataRetention}
                  onChange={(e) => handleChange('dataRetention', parseInt(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#4fa77e]/20 focus:border-[#4fa77e]"
                />
                <p className="text-xs text-gray-500 mt-1">Inactive patient data retention period</p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-800">Compliance Notice</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Changes to HIPAA compliance settings may affect your organization's regulatory standing.
                    Consult with your compliance officer before making changes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
