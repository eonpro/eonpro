'use client';

import { useState } from 'react';
import { Bell, Mail, MessageSquare, Phone, AlertCircle } from 'lucide-react';

interface NotificationSetting {
  id: string;
  title: string;
  description: string;
  email: boolean;
  sms: boolean;
  push: boolean;
}

export default function NotificationsSettingsPage() {
  const [settings, setSettings] = useState<NotificationSetting[]>([
    {
      id: 'new-patient',
      title: 'New Patient Intake',
      description: 'When a new patient completes an intake form',
      email: true,
      sms: false,
      push: true,
    },
    {
      id: 'appointment',
      title: 'Appointment Reminders',
      description: 'Upcoming appointment notifications',
      email: true,
      sms: true,
      push: true,
    },
    {
      id: 'payment',
      title: 'Payment Received',
      description: 'When a patient makes a payment',
      email: true,
      sms: false,
      push: false,
    },
    {
      id: 'prescription',
      title: 'Prescription Updates',
      description: 'Status changes for prescriptions',
      email: true,
      sms: true,
      push: true,
    },
    {
      id: 'message',
      title: 'New Messages',
      description: 'When you receive a new message from a patient',
      email: false,
      sms: false,
      push: true,
    },
  ]);

  const toggleSetting = (id: string, channel: 'email' | 'sms' | 'push') => {
    setSettings(prev => prev.map(s => 
      s.id === id ? { ...s, [channel]: !s[channel] } : s
    ));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
        <p className="text-gray-500 mt-1">Manage how and when you receive notifications</p>
      </div>

      {/* Notification Channels */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Channels</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <Mail className="w-5 h-5 text-blue-600" />
            <div>
              <p className="font-medium text-gray-900">Email</p>
              <p className="text-sm text-gray-500">admin@eonmeds.com</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <Phone className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-medium text-gray-900">SMS</p>
              <p className="text-sm text-gray-500">+1 (305) ***-**89</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <Bell className="w-5 h-5 text-purple-600" />
            <div>
              <p className="font-medium text-gray-900">Push</p>
              <p className="text-sm text-gray-500">Browser notifications</p>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Notification Preferences</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Notification</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">SMS</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Push</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {settings.map((setting) => (
              <tr key={setting.id}>
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-900">{setting.title}</p>
                  <p className="text-sm text-gray-500">{setting.description}</p>
                </td>
                <td className="px-6 py-4 text-center">
                  <button
                    onClick={() => toggleSetting(setting.id, 'email')}
                    className={`w-10 h-6 rounded-full transition-colors ${
                      setting.email ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${
                      setting.email ? 'translate-x-5' : 'translate-x-1'
                    }`} />
                  </button>
                </td>
                <td className="px-6 py-4 text-center">
                  <button
                    onClick={() => toggleSetting(setting.id, 'sms')}
                    className={`w-10 h-6 rounded-full transition-colors ${
                      setting.sms ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${
                      setting.sms ? 'translate-x-5' : 'translate-x-1'
                    }`} />
                  </button>
                </td>
                <td className="px-6 py-4 text-center">
                  <button
                    onClick={() => toggleSetting(setting.id, 'push')}
                    className={`w-10 h-6 rounded-full transition-colors ${
                      setting.push ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full transition-transform ${
                      setting.push ? 'translate-x-5' : 'translate-x-1'
                    }`} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">
          Save Preferences
        </button>
      </div>
    </div>
  );
}
