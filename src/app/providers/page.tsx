'use client';

import SignaturePadCanvas from '@/components/SignaturePadCanvas';
import { US_STATE_OPTIONS } from '@/lib/usStates';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';
import { apiFetch } from '@/lib/api/fetch';

type Provider = {
  id: number;
  firstName: string;
  lastName: string;
  titleLine?: string | null;
  npi: string;
  licenseState?: string | null;
  licenseNumber?: string | null;
  dea?: string | null;
  email?: string | null;
  phone?: string | null;
  npiVerifiedAt?: string | null;
  signatureDataUrl?: string | null;
  clinicId?: number | null;
  clinic?: { name: string } | null;
};

type Clinic = {
  id: number;
  name: string;
  subdomain?: string;
  status: string;
  customDomain?: string | null;
};

const TITLE_OPTIONS = [
  { value: 'MD', label: 'MD - Doctor of Medicine' },
  { value: 'DO', label: 'DO - Doctor of Osteopathic Medicine' },
  { value: 'NP', label: 'NP - Nurse Practitioner' },
  { value: 'PA', label: 'PA - Physician Assistant' },
  { value: 'PharmD', label: 'PharmD - Doctor of Pharmacy' },
  { value: 'DDS', label: 'DDS - Doctor of Dental Surgery' },
  { value: 'DMD', label: 'DMD - Doctor of Dental Medicine' },
  { value: 'OD', label: 'OD - Doctor of Optometry' },
  { value: 'DPM', label: 'DPM - Doctor of Podiatric Medicine' },
  { value: 'DC', label: 'DC - Doctor of Chiropractic' },
  { value: 'Other', label: 'Other' },
];

// Modern Icons
const Icons = {
  search: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  ),
  check: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  user: (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  ),
  building: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  ),
  badge: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
      />
    </svg>
  ),
  pencil: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  ),
  signature: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  ),
  shield: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  ),
  sparkles: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
      />
    </svg>
  ),
  arrowRight: (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 7l5 5m0 0l-5 5m5-5H6"
      />
    </svg>
  ),
  loader: (
    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  ),
};

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [userClinicId, setUserClinicId] = useState<number | null>(null);

  const providerInitialForm = {
    npi: '',
    firstName: '',
    lastName: '',
    titleLine: '',
    licenseState: '',
    licenseNumber: '',
    dea: '',
    email: '',
    phone: '',
    signatureDataUrl: undefined as string | undefined,
    clinicId: '' as string,
  };
  const [form, setForm] = useState(providerInitialForm);
  const [useSignaturePad, setUseSignaturePad] = useState(true);
  const [verifyingNpi, setVerifyingNpi] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) return;
    try {
      const user = JSON.parse(userData);
      const role = user.role?.toLowerCase() || '';
      setUserRole(role);
      setUserClinicId(user.clinicId ?? null);
      if (role !== 'super_admin' && user.clinicId) {
        setForm((prev) => ({ ...prev, clinicId: String(user.clinicId) }));
      }
    } catch {
      // Invalid stored user; clear and let auth flow handle it
      localStorage.removeItem('user');
    }
  }, []);

  const fetchClinics = async () => {
    try {
      // Try multiple token storage locations
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('token');

      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Try multiple endpoints with auth
      const authenticatedEndpoints = [
        '/api/super-admin/clinics', // Super admin - returns { clinics: [...] }
        '/api/admin/clinics', // Admin endpoint
        '/api/user/clinics', // User's assigned clinics
      ];

      for (const endpoint of authenticatedEndpoints) {
        if (!token) continue; // Skip auth endpoints if no token
        try {
          const res = await apiFetch(endpoint, { headers });

          if (res.ok) {
            const data = await res.json();
            const clinicList = data.clinics || (Array.isArray(data) ? data : []);
            if (clinicList.length > 0) {
              setClinics(clinicList);
              return;
            }
          }
        } catch (e) {
          // Silently try next endpoint
        }
      }

      // Fallback: Try public clinic list (no auth required)
      try {
        const res = await apiFetch('/api/clinics');
        if (res.ok) {
          const data = await res.json();
          const clinicList = data.clinics || (Array.isArray(data) ? data : []);
          if (clinicList.length > 0) {
            setClinics(clinicList);
            return;
          }
        }
      } catch (e) {
        // Silently handle error
      }

      setClinics([]);
    } catch (err: any) {
      logger.error('Failed to fetch clinics:', err);
      setClinics([]);
    }
  };

  const fetchProviders = async () => {
    try {
      setLoading(true);
      // Get auth token from localStorage
      const token =
        localStorage.getItem('token') ||
        localStorage.getItem('auth-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('super_admin-token');

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await apiFetch('/api/providers', { headers });
      const data = await res.json();
      setProviders(data.providers ?? []);
    } catch (err: any) {
      logger.error(err);
      setError('Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
    fetchClinics();
  }, []);

  // Refetch clinics when userRole changes
  useEffect(() => {
    if (userRole) {
      fetchClinics();
    }
  }, [userRole]);

  const updateForm = (k: string, v: string | null) => setForm((f: any) => ({ ...f, [k]: v }));

  const resetForm = () => {
    const clinicIdToKeep = userRole !== 'super_admin' && userClinicId ? String(userClinicId) : '';
    setForm({ ...providerInitialForm, clinicId: clinicIdToKeep });
    setUseSignaturePad(true);
    setStep(1);
  };

  const handleSignatureUpload = async (file: File) => {
    return new Promise<string | null>((resolve: any) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  const lookupNpi = async () => {
    const npi = form.npi.trim();
    if (!/^\d{10}$/.test(npi)) {
      setError('Please enter a valid 10-digit NPI number.');
      return;
    }
    try {
      setError(null);
      setVerifyingNpi(true);
      const res = await apiFetch('/api/providers/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npi }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unable to verify NPI');

      const basic = data.result.basic ?? {};
      const address =
        data.result.addresses?.find((addr: any) => addr.addressPurpose === 'LOCATION') ??
        data.result.addresses?.[0];

      setForm((prev: any) => ({
        ...prev,
        npi,
        firstName: basic.firstName ?? basic.first_name ?? prev.firstName,
        lastName: basic.lastName ?? basic.last_name ?? prev.lastName,
        titleLine: basic.credential ?? prev.titleLine,
        licenseState: address?.state ?? prev.licenseState,
      }));
      setStep(2);
      setSuccess('NPI verified successfully! Provider information loaded from NPPES.');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage ?? 'Failed to lookup NPI');
    } finally {
      setVerifyingNpi(false);
    }
  };

  const submit = async () => {
    try {
      setSubmitting(true);
      if (!form.firstName || !form.lastName) {
        setError('First and last name are required.');
        return;
      }
      if (!/^\d{10}$/.test(form.npi.trim())) {
        setError('NPI must be exactly 10 digits.');
        return;
      }
      if (userRole === 'super_admin' && !form.clinicId) {
        setError('Please select a clinic for this provider.');
        return;
      }
      if (!form.signatureDataUrl || !form.signatureDataUrl.startsWith('data:image/')) {
        setError('Please provide a valid signature for e-prescriptions.');
        return;
      }

      setError(null);
      const payload = {
        ...form,
        npi: form.npi.trim(),
        licenseState: form.licenseState?.trim() || null,
        signatureDataUrl: form.signatureDataUrl,
        clinicId: form.clinicId ? parseInt(form.clinicId) : userClinicId || null,
      };

      const res = await apiFetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create provider');

      setSuccess('Provider added successfully!');
      resetForm();
      fetchProviders();
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage ?? 'Failed to add provider');
    } finally {
      setSubmitting(false);
    }
  };

  const StepIndicator = () => (
    <div className="mb-8 flex items-center justify-center gap-2">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-semibold transition-all duration-300 ease-out ${
              step >= s
                ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-500/30'
                : 'bg-slate-100 text-slate-400'
            } `}
          >
            {step > s ? Icons.check : s}
          </div>
          {s < 3 && (
            <div
              className={`mx-2 h-1 w-16 rounded-full transition-all duration-500 ${step > s ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-slate-200'}`}
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-slate-200/50 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-500/30">
                {Icons.user}
              </div>
              <div>
                <h1 className="bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-2xl font-bold text-transparent">
                  Provider Management
                </h1>
                <p className="text-sm text-slate-500">Register and manage healthcare providers</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                {providers.length} Provider{providers.length !== 1 ? 's' : ''} Registered
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Notifications */}
        {error && (
          <div className="animate-in slide-in-from-top-2 mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-red-800">Error</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {success && (
          <div className="animate-in slide-in-from-top-2 mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              {Icons.check}
            </div>
            <p className="flex-1 font-medium text-emerald-800">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* Add Provider Form */}
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-3xl border border-slate-200/50 bg-white shadow-xl shadow-slate-200/50">
              {/* Form Header */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white">
                <div className="mb-2 flex items-center gap-3">
                  {Icons.sparkles}
                  <h2 className="text-xl font-bold">Add New Provider</h2>
                </div>
                <p className="text-sm text-slate-300">
                  Complete the steps below to register a provider
                </p>
              </div>

              <div className="p-6">
                <StepIndicator />

                {/* Step 1: NPI Verification */}
                {step === 1 && (
                  <div className="animate-in fade-in slide-in-from-right-4 space-y-6 duration-300">
                    <div className="mb-6 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--brand-primary)] text-white shadow-lg shadow-blue-500/30">
                        {Icons.shield}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">Verify NPI Number</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        We'll fetch provider details directly from NPPES registry
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full rounded-2xl border-2 border-slate-200 px-4 py-4 text-center font-mono text-lg tracking-widest outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          value={form.npi}
                          onChange={(e) =>
                            updateForm('npi', e.target.value.replace(/\D/g, '').slice(0, 10))
                          }
                          placeholder="0000000000"
                          maxLength={10}
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                          <span
                            className={`text-sm font-medium ${form.npi.length === 10 ? 'text-emerald-600' : 'text-slate-400'}`}
                          >
                            {form.npi.length}/10
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={lookupNpi}
                        disabled={verifyingNpi || form.npi.length !== 10}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-4 font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all duration-200 hover:from-emerald-600 hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {verifyingNpi ? (
                          <>
                            {Icons.loader}
                            Verifying...
                          </>
                        ) : (
                          <>
                            {Icons.search}
                            Verify NPI
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setStep(2)}
                        className="w-full py-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
                      >
                        Skip verification and enter details manually →
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: Provider Details */}
                {step === 2 && (
                  <div className="animate-in fade-in slide-in-from-right-4 space-y-5 duration-300">
                    {/* NPI Badge */}
                    {form.npi && (
                      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <div className="flex items-center gap-2">
                          {Icons.badge}
                          <span className="text-sm font-medium text-emerald-800">
                            NPI: {form.npi}
                          </span>
                        </div>
                        <button
                          onClick={() => setStep(1)}
                          className="text-xs text-emerald-600 hover:underline"
                        >
                          Change
                        </button>
                      </div>
                    )}

                    {/* Clinic Selection - Always show if clinics are available */}
                    {clinics.length > 0 && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <label className="block">
                          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
                            {Icons.building}
                            Assign to Clinic *
                          </span>
                          <select
                            className="w-full rounded-xl border-2 border-amber-200 bg-white px-4 py-3 outline-none transition-all focus:border-amber-400 focus:ring-4 focus:ring-amber-400/10"
                            value={form.clinicId}
                            onChange={(e) => updateForm('clinicId', e.target.value)}
                          >
                            <option value="">Select a clinic...</option>
                            {clinics
                              .filter(
                                (c) => !c.status || c.status === 'ACTIVE' || c.status === 'active'
                              )
                              .map((clinic) => (
                                <option key={clinic.id} value={String(clinic.id)}>
                                  {clinic.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                    )}

                    {/* Debug: Show if no clinics loaded */}
                    {clinics.length === 0 && (
                      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                        <p className="text-sm text-red-700">
                          No clinics loaded. User role: {userRole || 'unknown'}
                        </p>
                      </div>
                    )}

                    {/* Name Fields */}
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700">
                          First Name *
                        </span>
                        <input
                          className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          value={form.firstName}
                          onChange={(e) => updateForm('firstName', e.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700">
                          Last Name *
                        </span>
                        <input
                          className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          value={form.lastName}
                          onChange={(e) => updateForm('lastName', e.target.value)}
                        />
                      </label>
                    </div>

                    {/* Title & License */}
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700">Title</span>
                        <select
                          className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          value={form.titleLine}
                          onChange={(e) => updateForm('titleLine', e.target.value)}
                        >
                          <option value="">Select...</option>
                          {TITLE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.value}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700">
                          License State
                        </span>
                        <select
                          className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          value={form.licenseState}
                          onChange={(e) => updateForm('licenseState', e.target.value)}
                        >
                          <option value="">Select...</option>
                          {US_STATE_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* License & DEA */}
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700">
                          License Number
                        </span>
                        <input
                          className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          value={form.licenseNumber}
                          onChange={(e) => updateForm('licenseNumber', e.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700">
                          DEA Number
                        </span>
                        <input
                          className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          value={form.dea}
                          onChange={(e) => updateForm('dea', e.target.value)}
                        />
                      </label>
                    </div>

                    {/* Contact */}
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
                        <input
                          type="email"
                          className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          value={form.email}
                          onChange={(e) => updateForm('email', e.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-sm font-medium text-slate-700">Phone</span>
                        <input
                          type="tel"
                          className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                          value={form.phone}
                          onChange={(e) => updateForm('phone', e.target.value)}
                        />
                      </label>
                    </div>

                    <button
                      onClick={() => setStep(3)}
                      disabled={!form.firstName || !form.lastName}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-4 font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all duration-200 hover:from-emerald-600 hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Continue to Signature
                      {Icons.arrowRight}
                    </button>
                  </div>
                )}

                {/* Step 3: Signature */}
                {step === 3 && (
                  <div className="animate-in fade-in slide-in-from-right-4 space-y-5 duration-300">
                    <div className="mb-4 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--brand-primary)] text-white shadow-lg">
                        {Icons.signature}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">Provider Signature</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Required for e-prescriptions and legal documents
                      </p>
                    </div>

                    {/* Signature Mode Toggle */}
                    <div className="flex rounded-xl bg-slate-100 p-1">
                      <button
                        onClick={() => setUseSignaturePad(true)}
                        className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                          useSignaturePad
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        ✏️ Draw
                      </button>
                      <button
                        onClick={() => setUseSignaturePad(false)}
                        className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                          !useSignaturePad
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        📤 Upload
                      </button>
                    </div>

                    {/* Signature Input */}
                    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4">
                      {useSignaturePad ? (
                        <SignaturePadCanvas
                          onChange={(dataUrl: any) => updateForm('signatureDataUrl', dataUrl)}
                          initialSignature={form.signatureDataUrl || undefined}
                        />
                      ) : (
                        <div className="py-8 text-center">
                          <input
                            type="file"
                            accept="image/*"
                            id="signature-upload"
                            className="hidden"
                            onChange={async (e: any) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const base64 = await handleSignatureUpload(file);
                              updateForm('signatureDataUrl', base64);
                            }}
                          />
                          <label htmlFor="signature-upload" className="cursor-pointer">
                            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200 text-slate-400">
                              <svg
                                className="h-8 w-8"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                              </svg>
                            </div>
                            <p className="font-medium text-slate-600">Click to upload signature</p>
                            <p className="mt-1 text-sm text-slate-400">PNG, JPG up to 2MB</p>
                          </label>
                        </div>
                      )}
                    </div>

                    {form.signatureDataUrl && (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        {Icons.check}
                        <span className="text-sm font-medium text-emerald-800">
                          Signature captured successfully
                        </span>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep(2)}
                        className="flex-1 rounded-2xl border-2 border-slate-200 px-6 py-4 font-semibold text-slate-700 transition-all hover:bg-slate-50"
                      >
                        Back
                      </button>
                      <button
                        onClick={submit}
                        disabled={submitting || !form.signatureDataUrl}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-4 font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all duration-200 hover:from-emerald-600 hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submitting ? Icons.loader : Icons.check}
                        {submitting ? 'Creating...' : 'Create Provider'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Providers List */}
          <div className="lg:col-span-3">
            <div className="overflow-hidden rounded-3xl border border-slate-200/50 bg-white shadow-xl shadow-slate-200/50">
              <div className="border-b border-slate-100 p-6">
                <h2 className="text-xl font-bold text-slate-900">Registered Providers</h2>
                <p className="mt-1 text-sm text-slate-500">
                  All active healthcare providers in your organization
                </p>
              </div>

              {loading ? (
                <div className="p-12 text-center">
                  <div className="mx-auto flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl bg-slate-100">
                    {Icons.loader}
                  </div>
                  <p className="mt-4 text-slate-500">Loading providers...</p>
                </div>
              ) : providers.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    {Icons.user}
                  </div>
                  <p className="font-medium text-slate-600">No providers registered yet</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Add your first provider using the form
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {providers.map((provider) => (
                    <div key={provider.id} className="p-5 transition-colors hover:bg-slate-50/50">
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 text-lg font-bold text-white shadow-lg">
                          {provider.firstName[0]}
                          {provider.lastName[0]}
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <h3 className="font-bold text-slate-900">
                              {provider.firstName} {provider.lastName}
                            </h3>
                            {provider.titleLine && (
                              <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                {provider.titleLine}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                            <span className="font-mono">NPI: {provider.npi}</span>
                            {provider.licenseState && (
                              <span>
                                {provider.licenseState} {provider.licenseNumber}
                              </span>
                            )}
                            {provider.dea && <span>DEA: {provider.dea}</span>}
                          </div>

                          <div className="mt-2 flex items-center gap-3">
                            {provider.clinic && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                                {Icons.building}
                                {provider.clinic.name}
                              </span>
                            )}
                            {provider.npiVerifiedAt && (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                                {Icons.check}
                                Verified
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <Link
                          href={`/providers/${provider.id}`}
                          className="rounded-xl px-4 py-2 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          View →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
