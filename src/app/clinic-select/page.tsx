'use client';

import { useEffect, useState } from 'react';
import { logger } from '../../lib/logger';

import { Building2, Check, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ClinicOption {
  id: number;
  name: string;
  subdomain: string;
  logoUrl?: string | null;
  iconUrl?: string | null;
  faviconUrl?: string | null;
  status: string;
  billingPlan: string;
  patientCount: number;
  providerCount: number;
}

export default function ClinicSelectPage() {
  const router = useRouter();
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClinic, setSelectedClinic] = useState<number | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    loadClinics();
  }, []);

  const loadClinics = async () => {
    try {
      const response = await fetch('/api/clinic/list');
      if (response.ok) {
        const data = await response.json();
        setClinics(data);

        // If only one clinic is available, auto-select it
        if (data.length === 1 && data[0].status === 'ACTIVE') {
          handleSelectClinic(data[0].id);
        }
      }
    } catch (error) {
      logger.error('Error loading clinics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClinic = async (clinicId: number) => {
    setSelectedClinic(clinicId);
    setSwitching(true);

    try {
      const response = await fetch('/api/clinic/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId }),
      });

      if (response.ok) {
        // Redirect to dashboard after successful selection
        router.push('/admin');
      } else {
        setSwitching(false);
        setSelectedClinic(null);
      }
    } catch (error) {
      logger.error('Error selecting clinic:', error);
      setSwitching(false);
      setSelectedClinic(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-green-50">
        <div className="text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <Building2 className="h-8 w-8 animate-pulse text-blue-600" />
          </div>
          <p className="text-gray-600">Loading available clinics...</p>
        </div>
      </div>
    );
  }

  if (clinics.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-green-50">
        <div className="max-w-md text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
            <AlertCircle className="h-8 w-8 text-yellow-600" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">No Clinics Available</h1>
          <p className="mb-6 text-gray-600">
            There are no active clinics available for you to access. Please contact your
            administrator.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 py-12">
      <div className="mx-auto max-w-4xl px-4">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <Building2 className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Select Your Clinic</h1>
          <p className="text-gray-600">Choose the clinic you want to access</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {clinics.map((clinic) => (
            <button
              key={clinic.id}
              onClick={() => handleSelectClinic(clinic.id)}
              disabled={clinic.status !== 'ACTIVE' || switching}
              className={`relative rounded-xl border-2 bg-white p-6 shadow-sm transition-all ${
                selectedClinic === clinic.id
                  ? 'border-blue-500 shadow-lg'
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
              } ${
                clinic.status !== 'ACTIVE' ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              } ${switching && selectedClinic !== clinic.id ? 'opacity-50' : ''} `}
            >
              {selectedClinic === clinic.id && (
                <div className="absolute right-4 top-4">
                  <Check className="h-5 w-5 text-green-500" />
                </div>
              )}

              <div className="flex items-start gap-4">
                {/* Use iconUrl or faviconUrl for smaller icon display, fallback to logoUrl */}
                {clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl ? (
                  <img
                    src={clinic.iconUrl || clinic.faviconUrl || clinic.logoUrl || ''}
                    alt={clinic.name}
                    className="h-12 w-12 rounded-lg object-contain"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-lg font-bold text-white">
                    {clinic.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="flex-1 text-left">
                  <h3 className="mb-1 text-lg font-semibold text-gray-900">{clinic.name}</h3>
                  <p className="mb-3 text-sm text-gray-500">
                    {clinic.subdomain}.{process.env.NEXT_PUBLIC_BASE_DOMAIN || 'localhost:3001'}
                  </p>

                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="text-gray-400">Patients:</span>
                      <span className="font-medium text-gray-700">{clinic.patientCount}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-gray-400">Providers:</span>
                      <span className="font-medium text-gray-700">{clinic.providerCount}</span>
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        clinic.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-800'
                          : clinic.status === 'TRIAL'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-800'
                      } `}
                    >
                      {clinic.status}
                    </span>
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                      {clinic.billingPlan}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {switching && (
          <div className="mt-6 text-center text-gray-600">
            <div className="inline-flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-gray-900"></div>
              Switching to clinic...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
