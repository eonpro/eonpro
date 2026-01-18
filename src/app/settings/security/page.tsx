'use client';

import { Shield, Key, Smartphone, Clock, CheckCircle } from 'lucide-react';

export default function SecuritySettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security Settings</h1>
        <p className="text-gray-500 mt-1">Manage your account security and access controls</p>
      </div>

      <div className="grid gap-6">
        {/* Password */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Key className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Password</h2>
                <p className="text-sm text-gray-500">Last changed 30 days ago</p>
              </div>
            </div>
            <button className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
              Change Password
            </button>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Smartphone className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Two-Factor Authentication</h2>
                <p className="text-sm text-gray-500">Add an extra layer of security</p>
              </div>
            </div>
            <button className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">
              Enable 2FA
            </button>
          </div>
        </div>

        {/* Active Sessions */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Active Sessions</h2>
              <p className="text-sm text-gray-500">Devices where you&apos;re currently logged in</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Current Session</p>
                  <p className="text-xs text-gray-500">Chrome on macOS • Active now</p>
                </div>
              </div>
              <span className="text-xs text-emerald-600 font-medium">Current</span>
            </div>
          </div>
        </div>

        {/* HIPAA Compliance */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-100 rounded-lg">
              <Shield className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">HIPAA Compliance</h2>
              <p className="text-sm text-gray-500">Security controls for healthcare data</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700">Data Encryption</span>
            </div>
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700">Audit Logging</span>
            </div>
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700">Access Controls</span>
            </div>
            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700">Secure Backups</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
