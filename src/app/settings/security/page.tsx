'use client';

import { useState } from 'react';
import { Shield, Key, Lock, UserCheck, AlertTriangle, CheckCircle } from 'lucide-react';

export default function SecuritySettingsPage() {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Security Settings</h1>
        <p className="text-gray-500 mt-1">Manage authentication, access control, and security settings</p>
      </div>

      {/* Security Score */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Security Score</h2>
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 transform -rotate-90">
              <circle cx="40" cy="40" r="36" stroke="#e5e7eb" strokeWidth="8" fill="none" />
              <circle cx="40" cy="40" r="36" stroke="#10b981" strokeWidth="8" fill="none"
                strokeDasharray={`${85 * 2.26} 226`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-gray-900">
              85%
            </span>
          </div>
          <div>
            <p className="font-medium text-gray-900">Good Security</p>
            <p className="text-sm text-gray-500">Enable 2FA to improve your score</p>
          </div>
        </div>
      </div>

      {/* Security Options */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-200">
        {/* Two-Factor Authentication */}
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-lg">
              <Key className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Two-Factor Authentication</h3>
              <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
            </div>
          </div>
          <button
            onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              twoFactorEnabled ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
              twoFactorEnabled ? 'translate-x-7' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {/* Session Management */}
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <UserCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Active Sessions</h3>
              <p className="text-sm text-gray-500">Manage your active login sessions</p>
            </div>
          </div>
          <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
            View Sessions
          </button>
        </div>

        {/* Password */}
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Lock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Password</h3>
              <p className="text-sm text-gray-500">Last changed 30 days ago</p>
            </div>
          </div>
          <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
            Change Password
          </button>
        </div>
      </div>

      {/* HIPAA Compliance */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-6 h-6 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">HIPAA Compliance</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm text-gray-700">PHI Encryption (AES-256)</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm text-gray-700">Audit Logging Enabled</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm text-gray-700">Role-Based Access Control</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm text-gray-700">Secure Data Transmission (TLS 1.3)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
