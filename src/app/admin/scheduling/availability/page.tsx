'use client';

import { useState, useEffect } from 'react';
import { Settings, ChevronLeft, Loader2, User } from 'lucide-react';
import ProviderAvailabilityManager from '@/components/ProviderAvailabilityManager';
import { apiFetch } from '@/lib/api/fetch';

interface Provider {
  id: number;
  firstName: string;
  lastName: string;
  titleLine?: string;
  email: string;
}

export default function AdminAvailabilityPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      const res = await apiFetch('/api/providers');
      if (res.ok) {
        const data = await res.json();
        const providerList = data.providers || [];
        setProviders(providerList);
        if (providerList.length > 0 && !selectedProviderId) {
          setSelectedProviderId(providerList[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch providers', err);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedProvider = providers.find((p) => p.id === selectedProviderId);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/admin/scheduling"
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <ChevronLeft className="h-5 w-5" />
            </a>
            <Settings className="h-6 w-6 text-[#4fa77e]" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Provider Availability</h1>
              <p className="text-xs text-gray-500">Manage weekly schedules and time-off for providers</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mx-auto max-w-4xl">
          {/* Provider Selector */}
          <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <label className="mb-2 block text-sm font-medium text-gray-700">Select Provider</label>
            {isLoading ? (
              <div className="flex items-center gap-2 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                <span className="text-sm text-gray-500">Loading providers...</span>
              </div>
            ) : providers.length === 0 ? (
              <p className="text-sm text-gray-500">No providers found for this clinic.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProviderId(p.id)}
                    className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                      selectedProviderId === p.id
                        ? 'border-[#4fa77e] bg-[#4fa77e]/5 text-[#4fa77e] ring-1 ring-[#4fa77e]'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`flex h-7 w-7 items-center justify-center rounded-full ${
                      selectedProviderId === p.id ? 'bg-[#4fa77e] text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <User className="h-3.5 w-3.5" />
                    </div>
                    {p.firstName} {p.lastName}
                    {p.titleLine && <span className="text-xs text-gray-400">, {p.titleLine}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Availability Manager */}
          {selectedProviderId && (
            <ProviderAvailabilityManager
              providerId={selectedProviderId}
              providerName={selectedProvider ? `${selectedProvider.firstName} ${selectedProvider.lastName}` : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
