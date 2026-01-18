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
        <p className="text-gray-500 mt-1">Configure how you receive notifications</p>
      </div>

      <div className="grid gap-6">
        {/* Email Notifications */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Email Notifications</h2>
              <p className="text-sm text-gray-500">Notifications sent to your email</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {[
              { key: 'newPatient', label: 'New Patient Intake', desc: 'When a new patient submits an intake form' },
              { key: 'appointment', label: 'Appointment Reminders', desc: 'Upcoming appointment notifications' },
              { key: 'payment', label: 'Payment Received', desc: 'When a payment is successfully processed' },
              { key: 'refund', label: 'Refund Processed', desc: 'When a refund is issued' },
              { key: 'prescription', label: 'Prescription Updates', desc: 'Status changes for prescriptions' },
            ].map((item) => (
              <label key={item.key} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                <div>
                  <p className="font-medium text-gray-900">{item.label}</p>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={emailNotifs[item.key as keyof typeof emailNotifs]}
                  onChange={(e) => setEmailNotifs({ ...emailNotifs, [item.key]: e.target.checked })}
                  className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                />
              </label>
            ))}
          </div>
        </div>

        {/* SMS Notifications */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <Smartphone className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">SMS Notifications</h2>
              <p className="text-sm text-gray-500">Text message alerts</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {[
              { key: 'appointment', label: 'Appointment Alerts', desc: 'Same-day appointment reminders' },
              { key: 'urgent', label: 'Urgent Notifications', desc: 'Critical alerts that need immediate attention' },
            ].map((item) => (
              <label key={item.key} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                <div>
                  <p className="font-medium text-gray-900">{item.label}</p>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={smsNotifs[item.key as keyof typeof smsNotifs]}
                  onChange={(e) => setSmsNotifs({ ...smsNotifs, [item.key]: e.target.checked })}
                  className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                />
              </label>
            ))}
          </div>
        </div>

        {/* In-App Notifications */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Bell className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">In-App Notifications</h2>
              <p className="text-sm text-gray-500">Notifications within the EONPro dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-lg">
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <span className="text-sm text-emerald-700">All in-app notifications are enabled</span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button className="px-6 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors">
          Save Preferences
        </button>
      </div>
    </div>
  );
}
