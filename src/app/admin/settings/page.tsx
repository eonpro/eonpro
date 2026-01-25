'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, Building2, Users, Shield, Bell, CreditCard, Globe, Save, ExternalLink, CheckCircle, Clock, Link2 } from 'lucide-react';

interface StripeStatus {
  hasConnectedAccount: boolean;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  isPlatformAccount: boolean;
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('general');
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [clinicId, setClinicId] = useState<number | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      const user = JSON.parse(userData);
      if (user.clinicId) {
        setClinicId(user.clinicId);
        loadStripeStatus(user.clinicId);
      }
    }
  }, []);

  const loadStripeStatus = async (id: number) => {
    try {
      const res = await fetch(`/api/stripe/connect?clinicId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setStripeStatus(data.stripe);
      }
    } catch (err) {
      console.error('Failed to load Stripe status:', err);
    }
  };

  const tabs = [
    { id: 'general', name: 'General', icon: Settings },
    { id: 'clinic', name: 'Clinic Info', icon: Building2 },
    { id: 'users', name: 'User Management', icon: Users },
    { id: 'security', name: 'Security', icon: Shield },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'billing', name: 'Billing & Payments', icon: CreditCard },
    { id: 'integrations', name: 'Integrations', icon: Globe },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage your clinic settings and preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                    activeTab === tab.id
                      ? 'bg-emerald-50 text-emerald-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900">General Settings</h2>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Platform Name
                  </label>
                  <input
                    type="text"
                    defaultValue="EONPRO"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Timezone
                  </label>
                  <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option>America/New_York (EST)</option>
                    <option>America/Chicago (CST)</option>
                    <option>America/Denver (MST)</option>
                    <option>America/Los_Angeles (PST)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date Format
                  </label>
                  <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option>MM/DD/YYYY</option>
                    <option>DD/MM/YYYY</option>
                    <option>YYYY-MM-DD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Language
                  </label>
                  <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option>English</option>
                    <option>Spanish</option>
                    <option>French</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t">
                <button className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Save Changes
                </button>
              </div>
            </div>
          )}

          {activeTab === 'clinic' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900">Clinic Information</h2>
              <p className="text-gray-600">Update your clinic details and contact information.</p>

              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Clinic Name
                  </label>
                  <input
                    type="text"
                    defaultValue="EONPRO Main Clinic"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="clinic@eonpro.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900">Security Settings</h2>
              <p className="text-gray-600">Configure security options for your clinic.</p>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">Two-Factor Authentication</h3>
                    <p className="text-sm text-gray-600">Require 2FA for all admin accounts</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">Session Timeout</h3>
                    <p className="text-sm text-gray-600">Auto-logout after inactivity</p>
                  </div>
                  <select className="px-3 py-2 border border-gray-300 rounded-lg">
                    <option>15 minutes</option>
                    <option>30 minutes</option>
                    <option>1 hour</option>
                    <option>4 hours</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">Audit Logging</h3>
                    <p className="text-sm text-gray-600">Track all user actions for HIPAA compliance</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900">Billing & Payments</h2>
              <p className="text-gray-600">Manage your payment processing and billing settings.</p>

              {/* Stripe Connect Section */}
              <div className="border rounded-xl overflow-hidden">
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-6 w-6 text-white" />
                    <h3 className="text-lg font-semibold text-white">Stripe Connect</h3>
                  </div>
                  <p className="text-purple-100 text-sm mt-1">
                    Accept payments directly to your bank account
                  </p>
                </div>

                <div className="p-6 bg-white">
                  {/* Status Display */}
                  {stripeStatus ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {stripeStatus.isPlatformAccount ? (
                          <>
                            <CheckCircle className="h-6 w-6 text-purple-500" />
                            <div>
                              <p className="font-medium text-gray-900">Platform Account</p>
                              <p className="text-sm text-gray-500">Using main platform Stripe account</p>
                            </div>
                          </>
                        ) : stripeStatus.hasConnectedAccount ? (
                          stripeStatus.onboardingComplete ? (
                            <>
                              <CheckCircle className="h-6 w-6 text-emerald-500" />
                              <div>
                                <p className="font-medium text-gray-900">Connected</p>
                                <p className="text-sm text-gray-500">Stripe account active and accepting payments</p>
                              </div>
                            </>
                          ) : (
                            <>
                              <Clock className="h-6 w-6 text-yellow-500" />
                              <div>
                                <p className="font-medium text-gray-900">Setup Incomplete</p>
                                <p className="text-sm text-gray-500">Complete Stripe onboarding to start accepting payments</p>
                              </div>
                            </>
                          )
                        ) : (
                          <>
                            <Link2 className="h-6 w-6 text-gray-400" />
                            <div>
                              <p className="font-medium text-gray-900">Not Connected</p>
                              <p className="text-sm text-gray-500">Connect your Stripe account to accept payments</p>
                            </div>
                          </>
                        )}
                      </div>

                      <button
                        onClick={() => router.push('/admin/settings/stripe')}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                      >
                        {stripeStatus.hasConnectedAccount ? 'Manage' : 'Connect'}
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-6 w-6 bg-gray-200 rounded-full animate-pulse" />
                        <div>
                          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                          <div className="h-3 w-40 bg-gray-200 rounded animate-pulse mt-1" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Stripe Dashboard Link */}
              {stripeStatus?.hasConnectedAccount && stripeStatus.onboardingComplete && (
                <div className="grid grid-cols-2 gap-4">
                  <a
                    href="/admin/stripe-dashboard"
                    className="flex items-center gap-3 p-4 border rounded-lg hover:border-purple-300 hover:bg-purple-50 transition"
                  >
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <CreditCard className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Stripe Dashboard</p>
                      <p className="text-sm text-gray-500">View transactions, payouts & reports</p>
                    </div>
                  </a>
                  <a
                    href="/billing"
                    className="flex items-center gap-3 p-4 border rounded-lg hover:border-emerald-300 hover:bg-emerald-50 transition"
                  >
                    <div className="p-2 bg-emerald-100 rounded-lg">
                      <Globe className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Billing Portal</p>
                      <p className="text-sm text-gray-500">Manage invoices & subscriptions</p>
                    </div>
                  </a>
                </div>
              )}
            </div>
          )}

          {activeTab !== 'general' && activeTab !== 'clinic' && activeTab !== 'security' && activeTab !== 'billing' && (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                <Settings className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {tabs.find(t => t.id === activeTab)?.name} Settings
              </h3>
              <p className="text-gray-600">
                This section is under development. Check back soon!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

