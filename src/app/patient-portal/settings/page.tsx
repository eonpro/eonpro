'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import {
  User,
  Mail,
  Phone,
  Lock,
  Bell,
  Shield,
  ChevronRight,
  LogOut,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';

interface UserProfile {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeSection, setActiveSection] = useState<
    'profile' | 'password' | 'notifications' | 'privacy'
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

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = () => {
    const user = localStorage.getItem('user');
    if (user) {
      const userData = JSON.parse(user);
      setProfile({
        id: userData.id || 1,
        email: userData.email || 'patient@example.com',
        firstName: userData.firstName || 'Patient',
        lastName: userData.lastName || 'User',
        phone: userData.phone || '',
        dateOfBirth: userData.dateOfBirth,
        address: userData.address,
      });
    } else {
      // Demo profile
      setProfile({
        id: 1,
        email: 'patient@example.com',
        firstName: 'Patient',
        lastName: 'User',
        phone: '(555) 123-4567',
        dateOfBirth: '1990-01-15',
        address: {
          street: '123 Main St',
          city: 'Miami',
          state: 'FL',
          zip: '33101',
        },
      });
    }
    setLoading(false);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Update localStorage
    if (profile) {
      const currentUser = localStorage.getItem('user');
      const userData = currentUser ? JSON.parse(currentUser) : {};
      localStorage.setItem('user', JSON.stringify({ ...userData, ...profile }));
    }

    setSaving(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handlePasswordChange = async () => {
    if (passwords.new !== passwords.confirm) {
      alert('New passwords do not match');
      return;
    }
    if (passwords.new.length < 8) {
      alert('Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setPasswords({ current: '', new: '', confirm: '' });
    setSaving(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('patient-token');
    router.push('/login');
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
          Changes saved successfully!
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-gray-500">Manage your account and preferences</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">
            {[
              { id: 'profile', label: 'Profile', icon: User },
              { id: 'password', label: 'Password', icon: Lock },
              { id: 'notifications', label: 'Notifications', icon: Bell },
              { id: 'privacy', label: 'Privacy', icon: Shield },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id as any)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all ${
                    isActive ? 'text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  style={isActive ? { backgroundColor: primaryColor } : {}}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}

            <hr className="my-2" />

            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-red-600 transition-all hover:bg-red-50"
            >
              <LogOut className="h-5 w-5" />
              <span className="font-medium">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {/* Profile Section */}
          {activeSection === 'profile' && profile && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-6 text-lg font-semibold text-gray-900">Personal Information</h2>

              <div className="mb-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">First Name</label>
                  <input
                    type="text"
                    value={profile.firstName}
                    onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                    style={{ '--tw-ring-color': primaryColor } as any}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Last Name</label>
                  <input
                    type="text"
                    value={profile.lastName}
                    onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                    style={{ '--tw-ring-color': primaryColor } as any}
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                    style={{ '--tw-ring-color': primaryColor } as any}
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-gray-700">Phone</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                    style={{ '--tw-ring-color': primaryColor } as any}
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={profile.dateOfBirth || ''}
                  onChange={(e) => setProfile({ ...profile, dateOfBirth: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                  style={{ '--tw-ring-color': primaryColor } as any}
                />
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="rounded-xl px-6 py-3 font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}

          {/* Password Section */}
          {activeSection === 'password' && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-6 text-lg font-semibold text-gray-900">Change Password</h2>

              <div className="mb-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Current Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.current ? 'text' : 'password'}
                      value={passwords.current}
                      onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                      style={{ '--tw-ring-color': primaryColor } as any}
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
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.new ? 'text' : 'password'}
                      value={passwords.new}
                      onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                      style={{ '--tw-ring-color': primaryColor } as any}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowPasswords({ ...showPasswords, new: !showPasswords.new })
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords.new ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords.confirm ? 'text' : 'password'}
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-opacity-50"
                      style={{ '--tw-ring-color': primaryColor } as any}
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
                {saving ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          )}

          {/* Notifications Section */}
          {activeSection === 'notifications' && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-6 text-lg font-semibold text-gray-900">Notification Preferences</h2>

              <div className="space-y-4">
                {[
                  {
                    key: 'emailReminders',
                    label: 'Email Reminders',
                    desc: 'Medication and appointment reminders via email',
                  },
                  {
                    key: 'smsReminders',
                    label: 'SMS Reminders',
                    desc: 'Text message reminders for appointments',
                  },
                  {
                    key: 'shipmentUpdates',
                    label: 'Shipment Updates',
                    desc: 'Notifications about your medication shipments',
                  },
                  {
                    key: 'appointmentReminders',
                    label: 'Appointment Reminders',
                    desc: '24-hour advance notice for appointments',
                  },
                  {
                    key: 'promotionalEmails',
                    label: 'Promotional Emails',
                    desc: 'News, tips, and special offers',
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between rounded-xl bg-gray-50 p-4"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                    <button
                      onClick={() =>
                        setNotifications({
                          ...notifications,
                          [item.key]: !notifications[item.key as keyof typeof notifications],
                        })
                      }
                      className={`relative h-6 w-12 rounded-full transition-colors ${
                        notifications[item.key as keyof typeof notifications] ? '' : 'bg-gray-300'
                      }`}
                      style={
                        notifications[item.key as keyof typeof notifications]
                          ? { backgroundColor: primaryColor }
                          : {}
                      }
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          notifications[item.key as keyof typeof notifications]
                            ? 'left-6'
                            : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Privacy Section */}
          {activeSection === 'privacy' && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-6 text-lg font-semibold text-gray-900">Privacy & Data</h2>

              <div className="mb-6 space-y-4">
                <a
                  href="/privacy-policy"
                  target="_blank"
                  className="flex items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                >
                  <span className="font-medium text-gray-900">Privacy Policy</span>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </a>
                <a
                  href="/terms-of-service"
                  target="_blank"
                  className="flex items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                >
                  <span className="font-medium text-gray-900">Terms of Service</span>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </a>
                <a
                  href="/hipaa-notice"
                  target="_blank"
                  className="flex items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100"
                >
                  <span className="font-medium text-gray-900">HIPAA Notice</span>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </a>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="mb-2 font-semibold text-amber-900">Request Data Export</h3>
                <p className="mb-3 text-sm text-amber-800">
                  You can request a copy of all your personal data. This may take up to 30 days to
                  process.
                </p>
                <button className="text-sm font-medium text-amber-700 hover:text-amber-900">
                  Request Data Export →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
