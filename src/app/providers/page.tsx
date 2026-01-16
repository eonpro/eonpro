"use client";

import SignaturePadCanvas from "@/components/SignaturePadCanvas";
import Breadcrumb from "@/components/Breadcrumb";
import { US_STATE_OPTIONS } from "@/lib/usStates";
import Link from "next/link";
import { useEffect, useState } from "react";
import { logger } from '@/lib/logger';

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
  subdomain: string;
  status: string;
};

const TITLE_OPTIONS = [
  { value: "MD", label: "MD - Doctor of Medicine" },
  { value: "DO", label: "DO - Doctor of Osteopathic Medicine" },
  { value: "NP", label: "NP - Nurse Practitioner" },
  { value: "PA", label: "PA - Physician Assistant" },
  { value: "PharmD", label: "PharmD - Doctor of Pharmacy" },
  { value: "DDS", label: "DDS - Doctor of Dental Surgery" },
  { value: "DMD", label: "DMD - Doctor of Dental Medicine" },
  { value: "OD", label: "OD - Doctor of Optometry" },
  { value: "DPM", label: "DPM - Doctor of Podiatric Medicine" },
  { value: "DC", label: "DC - Doctor of Chiropractic" },
  { value: "Other", label: "Other" },
];

// Modern Icons
const Icons = {
  search: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  check: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  user: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  building: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  badge: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  ),
  pencil: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  ),
  signature: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  shield: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  sparkles: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  arrowRight: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  ),
  loader: (
    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  ),
};

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("");
  const [userClinicId, setUserClinicId] = useState<number | null>(null);

  const providerInitialForm = {
    npi: "",
    firstName: "",
    lastName: "",
    titleLine: "",
    licenseState: "",
    licenseNumber: "",
    dea: "",
    email: "",
    phone: "",
    signatureDataUrl: undefined as string | undefined,
    clinicId: "" as string,
  };
  const [form, setForm] = useState(providerInitialForm);
  const [useSignaturePad, setUseSignaturePad] = useState(true);
  const [verifyingNpi, setVerifyingNpi] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      const user = JSON.parse(userData);
      const role = user.role?.toLowerCase() || '';
      setUserRole(role);
      setUserClinicId(user.clinicId || null);
      if (role !== 'super_admin' && user.clinicId) {
        setForm(prev => ({ ...prev, clinicId: String(user.clinicId) }));
      }
    }
  }, []);

  const fetchClinics = async () => {
    try {
      const token = localStorage.getItem('auth-token') ||
                   localStorage.getItem('super_admin-token') ||
                   localStorage.getItem('admin-token');
      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};
      const endpoints = ["/api/user/clinics", "/api/admin/clinics", "/api/clinic/list"];
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, { headers });
          if (res.ok) {
            const data = await res.json();
            const clinicList = data.clinics || (Array.isArray(data) ? data : []);
            if (clinicList.length > 0) {
              setClinics(clinicList);
              return;
            }
          }
        } catch { /* Continue */ }
      }
      setClinics([]);
    } catch (err: any) {
      logger.error("Failed to fetch clinics:", err);
      setClinics([]);
    }
  };

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/providers");
      const data = await res.json();
      setProviders(data.providers ?? []);
    } catch (err: any) {
      logger.error(err);
      setError("Failed to load providers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
    fetchClinics();
  }, [userRole]);

  const updateForm = (k: string, v: string | null) =>
    setForm((f: any) => ({ ...f, [k]: v }));

  const resetForm = () => {
    const clinicIdToKeep = userRole !== 'super_admin' && userClinicId ? String(userClinicId) : "";
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
      setError("Please enter a valid 10-digit NPI number.");
      return;
    }
    try {
      setError(null);
      setVerifyingNpi(true);
      const res = await fetch("/api/providers/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ npi }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unable to verify NPI");
      
      const basic = data.result.basic ?? {};
      const address = data.result.addresses?.find((addr: any) => addr.addressPurpose === "LOCATION") ?? data.result.addresses?.[0];
      
      setForm((prev: any) => ({
        ...prev,
        npi,
        firstName: basic.firstName ?? basic.first_name ?? prev.firstName,
        lastName: basic.lastName ?? basic.last_name ?? prev.lastName,
        titleLine: basic.credential ?? prev.titleLine,
        licenseState: address?.state ?? prev.licenseState,
      }));
      setStep(2);
      setSuccess("NPI verified successfully! Provider information loaded from NPPES.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage ?? "Failed to lookup NPI");
    } finally {
      setVerifyingNpi(false);
    }
  };

  const submit = async () => {
    try {
      setSubmitting(true);
      if (!form.firstName || !form.lastName) {
        setError("First and last name are required.");
        return;
      }
      if (!/^\d{10}$/.test(form.npi.trim())) {
        setError("NPI must be exactly 10 digits.");
        return;
      }
      if (userRole === 'super_admin' && !form.clinicId) {
        setError("Please select a clinic for this provider.");
        return;
      }
      if (!form.signatureDataUrl || !form.signatureDataUrl.startsWith("data:image/")) {
        setError("Please provide a valid signature for e-prescriptions.");
        return;
      }

      setError(null);
      const payload = {
        ...form,
        npi: form.npi.trim(),
        licenseState: form.licenseState?.trim() || null,
        signatureDataUrl: form.signatureDataUrl,
        clinicId: form.clinicId ? parseInt(form.clinicId) : (userClinicId || null),
      };

      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create provider");
      
      setSuccess("🎉 Provider added successfully!");
      resetForm();
      fetchProviders();
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage ?? "Failed to add provider");
    } finally {
      setSubmitting(false);
    }
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center">
          <div className={`
            flex items-center justify-center w-10 h-10 rounded-xl font-semibold text-sm
            transition-all duration-300 ease-out
            ${step >= s 
              ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-lg shadow-emerald-500/30' 
              : 'bg-slate-100 text-slate-400'
            }
          `}>
            {step > s ? Icons.check : s}
          </div>
          {s < 3 && (
            <div className={`w-16 h-1 mx-2 rounded-full transition-all duration-500 ${step > s ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Breadcrumb items={[{ label: "Providers" }]} />
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
                {Icons.user}
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                  Provider Management
                </h1>
                <p className="text-sm text-slate-500">Register and manage healthcare providers</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-medium">
                {providers.length} Provider{providers.length !== 1 ? 's' : ''} Registered
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Notifications */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2">
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-red-800">Error</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        
        {success && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
              {Icons.check}
            </div>
            <p className="flex-1 font-medium text-emerald-800">{success}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Add Provider Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200/50 overflow-hidden">
              {/* Form Header */}
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white">
                <div className="flex items-center gap-3 mb-2">
                  {Icons.sparkles}
                  <h2 className="text-xl font-bold">Add New Provider</h2>
                </div>
                <p className="text-slate-300 text-sm">Complete the steps below to register a provider</p>
              </div>

              <div className="p-6">
                <StepIndicator />

                {/* Step 1: NPI Verification */}
                {step === 1 && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 mb-4">
                        {Icons.shield}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">Verify NPI Number</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        We'll fetch provider details directly from NPPES registry
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full px-4 py-4 text-lg font-mono tracking-widest text-center border-2 border-slate-200 rounded-2xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none"
                          value={form.npi}
                          onChange={(e) => updateForm("npi", e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="0000000000"
                          maxLength={10}
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                          <span className={`text-sm font-medium ${form.npi.length === 10 ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {form.npi.length}/10
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={lookupNpi}
                        disabled={verifyingNpi || form.npi.length !== 10}
                        className="w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-2xl shadow-lg shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
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
                        className="w-full py-3 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
                      >
                        Skip verification and enter details manually →
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: Provider Details */}
                {step === 2 && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                    {/* NPI Badge */}
                    {form.npi && (
                      <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                        <div className="flex items-center gap-2">
                          {Icons.badge}
                          <span className="text-sm font-medium text-emerald-800">NPI: {form.npi}</span>
                        </div>
                        <button onClick={() => setStep(1)} className="text-xs text-emerald-600 hover:underline">
                          Change
                        </button>
                      </div>
                    )}

                    {/* Clinic Selection */}
                    {userRole === 'super_admin' && (
                      <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
                        <label className="block">
                          <span className="flex items-center gap-2 text-sm font-semibold text-amber-800 mb-2">
                            {Icons.building}
                            Assign to Clinic *
                          </span>
                          <select
                            className="w-full px-4 py-3 border-2 border-amber-200 rounded-xl bg-white focus:border-amber-400 focus:ring-4 focus:ring-amber-400/10 transition-all outline-none"
                            value={form.clinicId}
                            onChange={(e) => updateForm("clinicId", e.target.value)}
                          >
                            <option value="">Select a clinic...</option>
                            {clinics.filter(c => c.status === 'ACTIVE').map((clinic) => (
                              <option key={clinic.id} value={clinic.id}>
                                {clinic.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}

                    {/* Name Fields */}
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700 mb-1 block">First Name *</span>
                        <input
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none"
                          value={form.firstName}
                          onChange={(e) => updateForm("firstName", e.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700 mb-1 block">Last Name *</span>
                        <input
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none"
                          value={form.lastName}
                          onChange={(e) => updateForm("lastName", e.target.value)}
                        />
                      </label>
                    </div>

                    {/* Title & License */}
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700 mb-1 block">Title</span>
                        <select
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none"
                          value={form.titleLine}
                          onChange={(e) => updateForm("titleLine", e.target.value)}
                        >
                          <option value="">Select...</option>
                          {TITLE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>{t.value}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700 mb-1 block">License State</span>
                        <select
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none"
                          value={form.licenseState}
                          onChange={(e) => updateForm("licenseState", e.target.value)}
                        >
                          <option value="">Select...</option>
                          {US_STATE_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* License & DEA */}
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700 mb-1 block">License Number</span>
                        <input
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none"
                          value={form.licenseNumber}
                          onChange={(e) => updateForm("licenseNumber", e.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700 mb-1 block">DEA Number</span>
                        <input
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none"
                          value={form.dea}
                          onChange={(e) => updateForm("dea", e.target.value)}
                        />
                      </label>
                    </div>

                    {/* Contact */}
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700 mb-1 block">Email</span>
                        <input
                          type="email"
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none"
                          value={form.email}
                          onChange={(e) => updateForm("email", e.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700 mb-1 block">Phone</span>
                        <input
                          type="tel"
                          className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all outline-none"
                          value={form.phone}
                          onChange={(e) => updateForm("phone", e.target.value)}
                        />
                      </label>
                    </div>

                    <button
                      onClick={() => setStep(3)}
                      disabled={!form.firstName || !form.lastName}
                      className="w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-2xl shadow-lg shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
                    >
                      Continue to Signature
                      {Icons.arrowRight}
                    </button>
                  </div>
                )}

                {/* Step 3: Signature */}
                {step === 3 && (
                  <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="text-center mb-4">
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/30 mb-4">
                        {Icons.signature}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">Provider Signature</h3>
                      <p className="text-sm text-slate-500 mt-1">
                        Required for e-prescriptions and legal documents
                      </p>
                    </div>

                    {/* Signature Mode Toggle */}
                    <div className="flex rounded-xl bg-slate-100 p-1">
                      <button
                        onClick={() => setUseSignaturePad(true)}
                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                          useSignaturePad 
                            ? 'bg-white text-slate-900 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        ✏️ Draw
                      </button>
                      <button
                        onClick={() => setUseSignaturePad(false)}
                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                          !useSignaturePad 
                            ? 'bg-white text-slate-900 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        📤 Upload
                      </button>
                    </div>

                    {/* Signature Input */}
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50">
                      {useSignaturePad ? (
                        <SignaturePadCanvas
                          onChange={(dataUrl: any) => updateForm("signatureDataUrl", dataUrl)}
                          initialSignature={form.signatureDataUrl || undefined}
                        />
                      ) : (
                        <div className="text-center py-8">
                          <input
                            type="file"
                            accept="image/*"
                            id="signature-upload"
                            className="hidden"
                            onChange={async (e: any) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const base64 = await handleSignatureUpload(file);
                              updateForm("signatureDataUrl", base64);
                            }}
                          />
                          <label htmlFor="signature-upload" className="cursor-pointer">
                            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-200 flex items-center justify-center text-slate-400 mb-3">
                              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <p className="text-slate-600 font-medium">Click to upload signature</p>
                            <p className="text-sm text-slate-400 mt-1">PNG, JPG up to 2MB</p>
                          </label>
                        </div>
                      )}
                    </div>

                    {form.signatureDataUrl && (
                      <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                        {Icons.check}
                        <span className="text-sm font-medium text-emerald-800">Signature captured successfully</span>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setStep(2)}
                        className="flex-1 py-4 px-6 border-2 border-slate-200 text-slate-700 font-semibold rounded-2xl hover:bg-slate-50 transition-all"
                      >
                        Back
                      </button>
                      <button
                        onClick={submit}
                        disabled={submitting || !form.signatureDataUrl}
                        className="flex-1 py-4 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-2xl shadow-lg shadow-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
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
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200/50 overflow-hidden">
              <div className="p-6 border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-900">Registered Providers</h2>
                <p className="text-sm text-slate-500 mt-1">All active healthcare providers in your organization</p>
              </div>

              {loading ? (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center animate-pulse">
                    {Icons.loader}
                  </div>
                  <p className="mt-4 text-slate-500">Loading providers...</p>
                </div>
              ) : providers.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                    {Icons.user}
                  </div>
                  <p className="text-slate-600 font-medium">No providers registered yet</p>
                  <p className="text-sm text-slate-400 mt-1">Add your first provider using the form</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {providers.map((provider) => (
                    <div key={provider.id} className="p-5 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                          {provider.firstName[0]}{provider.lastName[0]}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-slate-900">
                              {provider.firstName} {provider.lastName}
                            </h3>
                            {provider.titleLine && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-lg">
                                {provider.titleLine}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                            <span className="font-mono">NPI: {provider.npi}</span>
                            {provider.licenseState && (
                              <span>{provider.licenseState} {provider.licenseNumber}</span>
                            )}
                            {provider.dea && <span>DEA: {provider.dea}</span>}
                          </div>

                          <div className="flex items-center gap-3 mt-2">
                            {provider.clinic && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg">
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
                          className="px-4 py-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors"
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
