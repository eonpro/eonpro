'use client';

import { Shield, Key, Smartphone, Clock, CheckCircle } from 'lucide-react';

export default function SecuritySettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security Settings</h1>
        <p className="mt-1 text-gray-500">Manage your account security and access controls</p>
      </div>

      <div className="grid gap-6">
        {/* Password */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Key className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Password</h2>
                <p className="text-sm text-gray-500">Last changed 30 days ago</p>
              </div>
            </div>
            <button className="rounded-lg px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50">
              Change Password
            </button>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2">
                <Smartphone className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Two-Factor Authentication</h2>
                <p className="text-sm text-gray-500">Add an extra layer of security</p>
              </div>
            </div>
            <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700">
              Enable 2FA
            </button>
          </div>
        </div>

        {/* Active Sessions */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-[var(--brand-primary-light)] p-2">
              <Clock className="h-5 w-5 text-[var(--brand-primary)]" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Active Sessions</h2>
              <p className="text-sm text-gray-500">Devices where you&apos;re currently logged in</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Current Session</p>
                  <p className="text-xs text-gray-500">Chrome on macOS • Active now</p>
                </div>
              </div>
              <span className="text-xs font-medium text-emerald-600">Current</span>
            </div>
          </div>
        </div>

        {/* HIPAA Compliance */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-red-100 p-2">
              <Shield className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">HIPAA Compliance</h2>
              <p className="text-sm text-gray-500">Security controls for healthcare data</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700">Data Encryption</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700">Audit Logging</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700">Access Controls</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700">Secure Backups</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
