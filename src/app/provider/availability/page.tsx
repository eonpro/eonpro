'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, Settings, Loader2 } from 'lucide-react';
import ProviderAvailabilityManager from '@/components/ProviderAvailabilityManager';
import ProviderWeeklyAvailabilityEditor from '@/components/ProviderWeeklyAvailabilityEditor';
import { apiFetch } from '@/lib/api/fetch';

export default function ProviderAvailabilityPage() {
  const [activeTab, setActiveTab] = useState<'weekly' | 'recurring'>('weekly');
  const [providerId, setProviderId] = useState<number | null>(null);
  const [providerName, setProviderName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProvider = async () => {
      try {
        const res = await apiFetch('/api/provider/self');
        if (res.ok) {
          const data = await res.json();
          const p = data.provider || data;
          setProviderId(p.id);
          setProviderName([p.firstName, p.lastName].filter(Boolean).join(' ') || 'Provider');
        }
      } catch {
        // best-effort
      } finally {
        setIsLoading(false);
      }
    };
    fetchProvider();
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!providerId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Unable to load provider information.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-[#4fa77e]" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">My Availability</h1>
              <p className="text-xs text-gray-500">
                Set your weekly schedule and customize specific dates for telehealth consultations
              </p>
            </div>
          </div>
          <a
            href="/provider/calendar"
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            View Calendar
          </a>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="border-b bg-white px-6">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('weekly')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'weekly'
                ? 'border-[#4fa77e] text-[#4fa77e]'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <Calendar className="h-4 w-4" />
            Upcoming Weeks
          </button>
          <button
            onClick={() => setActiveTab('recurring')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'recurring'
                ? 'border-[#4fa77e] text-[#4fa77e]'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <Settings className="h-4 w-4" />
            Recurring Template
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="mx-auto max-w-5xl">
          {activeTab === 'weekly' ? (
            <ProviderWeeklyAvailabilityEditor providerId={providerId} providerName={providerName} />
          ) : (
            <div>
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-sm text-blue-700">
                  <strong>Recurring template</strong> is your default weekly schedule. It applies to
                  any day that doesn't have a custom override set in the "Upcoming Weeks" tab.
                </p>
              </div>
              <ProviderAvailabilityManager providerId={providerId} providerName={providerName} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
