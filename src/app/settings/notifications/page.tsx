'use client';

import { Bell, Mail, MessageSquare, Smartphone } from 'lucide-react';
import { useState } from 'react';

export default function NotificationsSettingsPage() {
  const [emailNotifs, setEmailNotifs] = useState({
    newPatient: true,
    appointment: true,
    payment: true,
    refund: true,
    prescription: false,
  });

  const [smsNotifs, setSmsNotifs] = useState({
    appointment: true,
    urgent: true,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
        <p className="mt-1 text-gray-500">Configure how you receive notifications</p>
      </div>

      <div className="grid gap-6">
        {/* Email Notifications */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Email Notifications</h2>
              <p className="text-sm text-gray-500">Notifications sent to your email</p>
            </div>
          </div>

          <div className="space-y-4">
            {[
              {
                key: 'newPatient',
                label: 'New Patient Intake',
                desc: 'When a new patient submits an intake form',
              },
              {
                key: 'appointment',
                label: 'Appointment Reminders',
                desc: 'Upcoming appointment notifications',
              },
              {
                key: 'payment',
                label: 'Payment Received',
                desc: 'When a payment is successfully processed',
              },
              { key: 'refund', label: 'Refund Processed', desc: 'When a refund is issued' },
              {
                key: 'prescription',
                label: 'Prescription Updates',
                desc: 'Status changes for prescriptions',
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-center justify-between rounded-lg p-3 hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{item.label}</p>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={emailNotifs[item.key as keyof typeof emailNotifs]}
                  onChange={(e) => setEmailNotifs({ ...emailNotifs, [item.key]: e.target.checked })}
                  className="h-5 w-5 rounded text-emerald-600 focus:ring-emerald-500"
                />
              </label>
            ))}
          </div>
        </div>

        {/* SMS Notifications */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 p-2">
              <Smartphone className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">SMS Notifications</h2>
              <p className="text-sm text-gray-500">Text message alerts</p>
            </div>
          </div>

          <div className="space-y-4">
            {[
              {
                key: 'appointment',
                label: 'Appointment Alerts',
                desc: 'Same-day appointment reminders',
              },
              {
                key: 'urgent',
                label: 'Urgent Notifications',
                desc: 'Critical alerts that need immediate attention',
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-center justify-between rounded-lg p-3 hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{item.label}</p>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={smsNotifs[item.key as keyof typeof smsNotifs]}
                  onChange={(e) => setSmsNotifs({ ...smsNotifs, [item.key]: e.target.checked })}
                  className="h-5 w-5 rounded text-emerald-600 focus:ring-emerald-500"
                />
              </label>
            ))}
          </div>
        </div>

        {/* In-App Notifications */}
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-lg bg-purple-100 p-2">
              <Bell className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">In-App Notifications</h2>
              <p className="text-sm text-gray-500">Notifications within the EONPro dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3">
            <MessageSquare className="h-4 w-4 text-emerald-600" />
            <span className="text-sm text-emerald-700">All in-app notifications are enabled</span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button className="rounded-lg bg-emerald-600 px-6 py-2 font-medium text-white transition-colors hover:bg-emerald-700">
          Save Preferences
        </button>
      </div>
    </div>
  );
}
