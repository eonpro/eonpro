'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddressInput, AddressData } from '@/components/AddressAutocomplete';
import { MEDS, MedicationConfig, SigTemplate } from '@/lib/medications';
import { SHIPPING_METHODS } from '@/lib/shipping';
import SignaturePadCanvas from './SignaturePadCanvas';
import SigBuilder from './SigBuilder';
import MedicationSelector from './MedicationSelector';
import { US_STATE_OPTIONS } from '@/lib/usStates';
import { formatDobInput } from '@/lib/format';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';
import { apiFetch } from '@/lib/api/fetch';
import { safeJson, SafeJsonParseError } from '@/lib/safe-json';

type RxForm = {
  medicationKey: string;
  sig: string;
  quantity: string;
  refills: string;
};

type ProviderOption = {
  id: number;
  firstName: string;
  lastName: string;
  titleLine?: string | null;
  npi: string;
  signatureDataUrl?: string | null;
};

export type PatientOption = {
  id: number;
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  address1: string;
  address2?: string | null;
  city: string;
  state: string;
  zip: string;
};

const deriveDefaultValues = (
  med: MedicationConfig
): { sig?: string; quantity?: string; refills?: string } => {
  if (!med) return {};
  if (med.sigTemplates?.length) {
    const first = med.sigTemplates[0];
    return {
      sig: first.sig,
      quantity: first.quantity,
      refills: first.refills,
    };
  }
  const base = {
    sig: med.defaultSig,
    quantity: med.defaultQuantity,
    refills: med.defaultRefills,
  };
  if (base.sig || base.quantity || base.refills) {
    return base;
  }
  switch (med.form) {
    case 'INJ':
      return {
        sig: 'Inject once per week subcutaneously. Store in refrigerator.',
        quantity: '1',
        refills: '0',
      };
    case 'TAB':
    case 'CAP':
    case 'TROCHE':
      return {
        sig: 'Take 1 by mouth once daily as directed.',
        quantity: '30',
        refills: '0',
      };
    case 'CREAM':
    case 'GEL':
      return {
        sig: 'Apply a thin layer to affected area as directed.',
        quantity: '1',
        refills: '1',
      };
    case 'SWAB':
      return {
        sig: 'Use to cleanse skin prior to injection as directed.',
        quantity: '30',
        refills: '0',
      };
    default:
      return {
        sig: 'Use as directed.',
        quantity: '1',
        refills: '0',
      };
  }
};

type PrescriptionFormProps = {
  patientContext?: {
    id?: number | null;
    firstName: string;
    lastName: string;
    dob: string;
    gender: string;
    phone: string;
    email: string;
    address1: string;
    address2?: string | null;
    city: string;
    state: string;
    zip: string;
  };
  redirectPath?: string;
  onSuccess?: () => void;
};

const EMPTY_PATIENT = {
  firstName: '',
  lastName: '',
  dob: '',
  gender: '',
  phone: '',
  email: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  zip: '',
};

function normalizeGender(raw: string | null | undefined): string {
  const g = (raw || '').toLowerCase().trim();
  if (['m', 'male', 'man'].includes(g)) return 'm';
  if (['f', 'female', 'woman'].includes(g)) return 'f';
  return '';
}

export default function PrescriptionForm({
  patientContext,
  redirectPath,
  onSuccess,
}: PrescriptionFormProps = {}) {
  const router = useRouter();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [form, setForm] = useState<any>({
    patient: patientContext
      ? {
          firstName: patientContext.firstName,
          lastName: patientContext.lastName,
          dob: patientContext.dob,
          gender: normalizeGender(patientContext.gender),
          phone: patientContext.phone,
          email: patientContext.email,
          address1: patientContext.address1,
          address2: patientContext.address2 ?? '',
          city: patientContext.city,
          state: patientContext.state,
          zip: patientContext.zip,
        }
      : { ...EMPTY_PATIENT },
    rxs: [
      {
        medicationKey: '',
        sig: '',
        quantity: '',
        refills: '',
      } as RxForm,
    ],
    shippingMethod: 8115,
    signatureDataUrl: null,
    providerId: null,
    clinicId: null, // Will be set from localStorage on mount
  });

  // Load active clinic ID from localStorage on mount (for multi-tenant support)
  useEffect(() => {
    const activeClinicId = localStorage.getItem('activeClinicId');
    if (activeClinicId) {
      const clinicIdNum = parseInt(activeClinicId, 10);
      if (!isNaN(clinicIdNum)) {
        setForm((f: any) => ({ ...f, clinicId: clinicIdNum }));
        logger.info(`[PrescriptionForm] Set active clinicId: ${clinicIdNum}`);
      }
    }
  }, []);

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientAddressLocked, setPatientAddressLocked] = useState(Boolean(patientContext));
  const [patientMode, setPatientMode] = useState<'new' | 'existing'>(
    patientContext ? 'existing' : 'new'
  );
  const [patientQuery, setPatientQuery] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(
    patientContext?.id ?? null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Role-based provider management
  const [userRole, setUserRole] = useState<string | null>(null);
  const [selfProvider, setSelfProvider] = useState<ProviderOption | null>(null);
  const [providerLoadError, setProviderLoadError] = useState<string | null>(null);
  const [isLoadingProvider, setIsLoadingProvider] = useState(true);

  // Determine if user is a provider (uses their own profile) or admin (selects from dropdown)
  const isProviderRole = userRole === 'provider';
  const isAdminRole = userRole === 'admin' || userRole === 'super_admin';
  const selectedProvider = isProviderRole
    ? selfProvider
    : providers.find((p: any) => p.id === form.providerId);
  const filteredPatients = useMemo(() => {
    const query = patientQuery.trim().toLowerCase();
    if (!query) {
      return patients.slice(0, 5);
    }
    return patients
      .filter((patient: any) => {
        const blob = `${patient.firstName} ${patient.lastName} ${patient.dob} ${patient.phone}`
          .toLowerCase()
          .replace(/\s+/g, ' ');
        return blob.includes(query);
      })
      .slice(0, 10);
  }, [patientQuery, patients]);

  // Load provider(s) - single API call, cookie auth, no client role guessing
  useEffect(() => {
    async function loadProviderData() {
      setIsLoadingProvider(true);
      setProviderLoadError(null);

      const PROVIDER_DEBUG = typeof window !== 'undefined' && localStorage.getItem('PROVIDER_DEBUG') === 'true';

      const trace = (msg: string, ctx?: Record<string, unknown>) => {
        if (PROVIDER_DEBUG) {
          logger.info(`[PrescriptionForm] ${msg}`, ctx ?? {});
        }
      };

      try {
        const activeClinicId = localStorage.getItem('activeClinicId');
        const clinicNum = activeClinicId && !Number.isNaN(parseInt(activeClinicId, 10))
          ? parseInt(activeClinicId, 10)
          : null;

        const url = clinicNum != null
          ? `/api/provider/self?activeClinicId=${clinicNum}&clinicId=${clinicNum}`
          : '/api/provider/self';

        trace('Fetching', { url });

        const res = await apiFetch(url, { cache: 'no-store' });

        trace('Response', {
          status: res.status,
          contentType: res.headers.get('content-type') ?? 'unknown',
        });

        if (!res.ok) {
          let parsed: { code?: string; message?: string; error?: string } = {};
          try {
            parsed = await safeJson(res);
          } catch (parseErr) {
            trace('Parse error', {
              status: res.status,
              msg: parseErr instanceof Error ? parseErr.message : String(parseErr),
            });
            setProviderLoadError(`Request failed (${res.status}). Please refresh and try again.`);
            setIsLoadingProvider(false);
            return;
          }
          const message =
            parsed.code === 'PROVIDER_NOT_LINKED'
              ? parsed.message ?? 'Your account is not linked to a provider profile. Please contact your administrator.'
              : parsed.message ?? parsed.error ?? `Request failed (${res.status}). Please try again.`;
          setProviderLoadError(message);
          setIsLoadingProvider(false);
          return;
        }

        const data = await safeJson<
          | { provider: { id: number; firstName?: string; lastName?: string; titleLine?: string | null; npi?: string; signatureDataUrl?: string | null }; role: 'provider'; isComplete?: boolean; missing?: { npi?: boolean; dea?: boolean } }
          | { providers: ProviderOption[]; role: 'admin' | 'super_admin' }
          | null
        >(res);

        // Guard against null/undefined response body
        if (!data || typeof data !== 'object') {
          logger.error('[PrescriptionForm] Invalid response body', { data: String(data), status: res.status });
          setProviderLoadError('Unexpected server response. Please refresh and try again.');
          setIsLoadingProvider(false);
          return;
        }

        trace('Parsed', { hasProvider: 'provider' in data && !!data.provider, hasProviders: 'providers' in data, role: 'provider' in data ? 'provider' : 'admin' });

        if ('provider' in data && data.provider) {
          const p = data.provider;
          const myProvider: ProviderOption = {
            id: p.id,
            firstName: p.firstName ?? '',
            lastName: p.lastName ?? '',
            titleLine: p.titleLine ?? undefined,
            npi: p.npi ?? '',
            signatureDataUrl: p.signatureDataUrl ?? undefined,
          };
          setSelfProvider(myProvider);
          setForm((f: any) => ({ ...f, providerId: myProvider.id }));
          setUserRole('provider');
          logger.info(`[PrescriptionForm] Provider loaded: ${myProvider.firstName} ${myProvider.lastName}`);
          if (!data.isComplete && data.missing) {
            const missing: string[] = [];
            if (data.missing.npi) missing.push('NPI');
            if (data.missing.dea) missing.push('DEA');
            if (missing.length > 0) {
              setProviderLoadError(`Missing credentials: ${missing.join(', ')}`);
            }
          }
        } else if ('providers' in data && data.providers?.length) {
          setProviders(data.providers);
          setForm((f: any) => ({ ...f, providerId: data.providers![0].id }));
          setUserRole(data.role === 'super_admin' ? 'super_admin' : 'admin');
          logger.info(`[PrescriptionForm] Loaded ${data.providers.length} providers for clinic`);
        } else {
          setProviderLoadError(
            'Could not find your provider profile. Please ensure your account is linked to a provider.'
          );
        }
      } catch (err: unknown) {
        const isAuthError = err && typeof err === 'object' && 'isAuthError' in err && (err as { isAuthError?: boolean }).isAuthError;
        if (isAuthError) {
          setProviderLoadError('Session expired. Please log in again.');
          return;
        }
        if (err instanceof SafeJsonParseError) {
          logger.error('[PrescriptionForm] JSON parse failed', {
            status: err.status,
            contentType: err.contentType,
            bodyPreview: err.bodyPreview?.slice(0, 100),
          });
          setProviderLoadError(
            `Invalid response from server (status ${err.status}). Please refresh and try again.`
          );
        } else if (err instanceof Error) {
          logger.error('[PrescriptionForm] Provider load failed', { message: err.message });
          setProviderLoadError(
            err.message.includes('fetch') || err.message.includes('network')
              ? 'Network error. Please check your connection and try again.'
              : err.message
          );
        } else {
          logger.error('[PrescriptionForm] Provider load failed (non-Error)', {
            errType: typeof err,
            errStr: String(err),
            errKeys: err && typeof err === 'object' ? Object.keys(err) : [],
          });
          setProviderLoadError('Failed to load provider information. Please try again.');
        }
      } finally {
        setIsLoadingProvider(false);
      }
    }
    loadProviderData();
  }, []);

  useEffect(() => {
    if (patientContext) return;
    async function loadPatients() {
      try {
        // Get auth token from localStorage - include provider-token
        const token =
          localStorage.getItem('token') ||
          localStorage.getItem('auth-token') ||
          localStorage.getItem('provider-token') ||
          localStorage.getItem('admin-token') ||
          localStorage.getItem('super_admin-token');

        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await apiFetch('/api/patients', { headers });
        const data = await res.json();
        setPatients(data.patients ?? []);
      } catch (err: any) {
        logger.error('Failed to load patients', err);
      }
    }
    loadPatients();
  }, [patientContext]);

  useEffect(() => {
    if (!patientContext) return;
    setForm((f: any) => ({
      ...f,
      patient: {
        firstName: patientContext.firstName,
        lastName: patientContext.lastName,
        dob: patientContext.dob,
        gender: normalizeGender(patientContext.gender),
        phone: patientContext.phone,
        email: patientContext.email,
        address1: patientContext.address1,
        address2: patientContext.address2 ?? '',
        city: patientContext.city,
        state: patientContext.state,
        zip: patientContext.zip,
      },
    }));
    setSelectedPatientId(patientContext.id ?? null);
    setPatientAddressLocked(true);
    setPatientMode('existing');
  }, [patientContext]);

  const updateRoot = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const updatePatient = (k: string, v: any) =>
    setForm((f: any) => ({ ...f, patient: { ...f.patient, [k]: v } }));
  const updateRx = (index: number, k: keyof RxForm, v: string) =>
    setForm((f: any) => {
      const rxs: RxForm[] = [...f.rxs];
      rxs[index] = { ...rxs[index], [k]: v };
      return { ...f, rxs };
    });

  const addRx = () =>
    setForm((f: any) => ({
      ...f,
      rxs: [...f.rxs, { medicationKey: '', sig: '', quantity: '', refills: '' }],
    }));

  const removeRx = (index: number) =>
    setForm((f: any) => {
      if (f.rxs.length === 1) return f;
      const rxs: RxForm[] = [...f.rxs];
      rxs.splice(index, 1);
      return { ...f, rxs };
    });

  const onSignatureChange = (dataUrl: string | null) => {
    updateRoot('signatureDataUrl', dataUrl);
  };

  const applySigTemplate = (index: number, template: SigTemplate) => {
    if (!template) return;
    setForm((f: any) => {
      const rxs: RxForm[] = [...f.rxs];
      rxs[index] = {
        ...rxs[index],
        sig: template.sig,
        quantity: template.quantity,
        refills: template.refills,
      };
      return { ...f, rxs };
    });
  };

  const applyPatient = (patient: PatientOption | null) => {
    if (!patient) {
      setPatientAddressLocked(false);
      setForm((f: any) => ({
        ...f,
        patient: {
          firstName: '',
          lastName: '',
          dob: '',
          gender: '',
          phone: '',
          email: '',
          address1: '',
          address2: '',
          city: '',
          state: '',
          zip: '',
        },
      }));
      setSelectedPatientId(null);
      return;
    }

    setPatientAddressLocked(true);
    setForm((f: any) => ({
      ...f,
      patient: {
        firstName: patient.firstName,
        lastName: patient.lastName,
        dob: patient.dob,
        gender: normalizeGender(patient.gender),
        phone: patient.phone,
        email: patient.email,
        address1: patient.address1,
        address2: patient.address2 ?? '',
        city: patient.city,
        state: patient.state,
        zip: patient.zip,
      },
    }));
    setSelectedPatientId(patient.id);
  };

  async function handlePreviewClick() {
    if (!form.providerId) {
      alert('Please select a provider before submitting.');
      return;
    }
    if (!['m', 'f'].includes(form.patient.gender)) {
      alert('Select patient gender before submitting.');
      return;
    }
    if (!form.patient.state) {
      alert('Select patient state before submitting.');
      return;
    }
    setShowConfirmation(true);
  }

  async function submit(queueForProvider = false) {
    try {
      setIsSubmitting(true);
      // Include patientId when prescribing for an existing patient
      // This prevents duplicate patient creation across clinics
      const submissionData = {
        ...form,
        patientId: selectedPatientId || null,
        queueForProvider: queueForProvider && isAdminRole,
      };
      const res = await apiFetch('/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData),
      });
      const data = await res.json();
      if (!res.ok) {
        logger.error('Prescription submission error:', data);
        // Surface validation details so users know which field failed
        const errorMsg = data.error || data.detail || 'Unknown error';
        const details = data.details as Record<string, string[]> | undefined;
        const formErrors = data.formErrors as string[] | undefined;
        const detailLines: string[] = [];
        if (details && typeof details === 'object') {
          for (const [field, msgs] of Object.entries(details)) {
            if (Array.isArray(msgs) && msgs.length) {
              detailLines.push(`${field}: ${msgs.join(', ')}`);
            }
          }
        }
        if (formErrors?.length) detailLines.push(...formErrors);
        const detailMsg = detailLines.length ? `\n\n${detailLines.join('\n')}` : '';
        alert(`Error submitting prescription:\n${errorMsg}${detailMsg}`);
        return;
      }

      // If queued for provider, show success message; redirect/navigate same as sent
      if (data.queuedForProvider) {
        if (onSuccess) onSuccess();
        else if (selectedPatientId)
          window.location.href = `/patients/${selectedPatientId}?tab=prescriptions&queued=1`;
        else if (data.patientId)
          window.location.href = `/patients/${data.patientId}?tab=prescriptions&queued=1`;
        else window.location.href = '/orders/dashboard?queued=1';
        return;
      }
      // If onSuccess callback is provided, call it (modal flow stays in place)
      if (onSuccess) {
        onSuccess();
      } else if (redirectPath) {
        window.location.href = redirectPath;
      } else if (selectedPatientId) {
        window.location.href = `/patients/${selectedPatientId}?tab=prescriptions&submitted=1`;
      } else if (data.patientId) {
        window.location.href = `/patients/${data.patientId}?tab=prescriptions&submitted=1`;
      } else {
        window.location.href = '/orders/dashboard?submitted=1';
      }
    } catch (err: any) {
      logger.error('Prescription fetch error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Unexpected error submitting prescription:\n${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Confirmation View
  if (showConfirmation) {
    // Note: selectedProvider is already computed at component level (line ~208)
    // using the correct logic for both provider role (selfProvider) and admin role (providers array)
    const shippingMethod = SHIPPING_METHODS.find((m: any) => m.id === form.shippingMethod);

    return (
      <div className="max-w-4xl space-y-6">
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-lg">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold">Prescription Confirmation</h1>
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-medium text-yellow-800">
              Pending Review
            </span>
          </div>

          <div className="mb-6 rounded-lg bg-gray-50 p-4">
            <p className="text-sm text-gray-600">
              Please review all prescription details carefully before sending to the pharmacy. Once
              submitted, this prescription will be processed and sent for fulfillment.
            </p>
            {isAdminRole && (
              <p className="mt-2 text-sm text-amber-700">
                As an admin, you can <strong>Queue for Provider</strong> to send this prescription
                to your clinic&apos;s provider queue. A provider will then review, approve, and send
                it to the pharmacy. This is logged for compliance.
              </p>
            )}
          </div>

          {/* Patient Information */}
          <div className="mb-6 border-b pb-6">
            <h2 className="mb-4 text-lg font-semibold">Patient Information</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Name:</span>{' '}
                <span className="font-medium">
                  {form.patient.firstName} {form.patient.lastName}
                </span>
              </div>
              <div>
                <span className="text-gray-600">DOB:</span>{' '}
                <span className="font-medium">{form.patient.dob}</span>
              </div>
              <div>
                <span className="text-gray-600">Gender:</span>{' '}
                <span className="font-medium">
                  {(() => {
                    const g = form.patient.gender?.toLowerCase().trim();
                    if (g === 'f' || g === 'female' || g === 'woman') return 'Female';
                    if (g === 'm' || g === 'male' || g === 'man') return 'Male';
                    return form.patient.gender || '—';
                  })()}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Phone:</span>{' '}
                <span className="font-medium">{form.patient.phone}</span>
              </div>
              <div>
                <span className="text-gray-600">Email:</span>{' '}
                <span className="font-medium">{form.patient.email}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-600">Address:</span>{' '}
                <span className="font-medium">
                  {form.patient.address1}
                  {form.patient.address2 && `, ${form.patient.address2}`}, {form.patient.city},{' '}
                  {form.patient.state} {form.patient.zip}
                </span>
              </div>
            </div>
          </div>

          {/* Provider Information */}
          <div className="mb-6 border-b pb-6">
            <h2 className="mb-4 text-lg font-semibold">Provider Information</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Provider:</span>{' '}
                <span className="font-medium">
                  {selectedProvider?.firstName} {selectedProvider?.lastName}
                  {selectedProvider?.titleLine && `, ${selectedProvider.titleLine}`}
                </span>
              </div>
              <div>
                <span className="text-gray-600">NPI:</span>{' '}
                <span className="font-medium">{selectedProvider?.npi}</span>
              </div>
              <div>
                <span className="text-gray-600">Signature:</span>{' '}
                <span
                  className={`font-medium ${selectedProvider?.signatureDataUrl || form.signatureDataUrl ? 'text-green-600' : 'text-amber-600'}`}
                >
                  {selectedProvider?.signatureDataUrl || form.signatureDataUrl
                    ? 'Captured'
                    : 'Missing'}
                </span>
              </div>
            </div>
          </div>

          {/* Medications */}
          <div className="mb-6 border-b pb-6">
            <h2 className="mb-4 text-lg font-semibold">Medications</h2>
            {form.rxs.map((rx: any, index: number) => {
              const med = MEDS[rx.medicationKey];
              if (!med) return null;
              return (
                <div key={index} className="mb-3 rounded-lg bg-blue-50 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="mb-2 text-sm font-semibold">Medication #{index + 1}</h3>
                      <p className="font-medium">
                        {med.name} - {med.strength}
                        {med.formLabel && ` (${med.formLabel})`}
                      </p>
                      <div className="mt-2 space-y-1 text-sm">
                        <p>
                          <span className="text-gray-600">SIG:</span> {rx.sig}
                        </p>
                        <p>
                          <span className="text-gray-600">Quantity:</span> {rx.quantity} •{' '}
                          <span className="text-gray-600">Refills:</span> {rx.refills}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shipping Information */}
          <div className="mb-6 border-b pb-6">
            <h2 className="mb-4 text-lg font-semibold">Shipping Information</h2>
            <div className="text-sm">
              <p>
                <span className="text-gray-600">Method:</span>{' '}
                <span className="font-medium">{shippingMethod?.label}</span>
              </p>
              <p className="mt-2">
                <span className="text-gray-600">Delivery Address:</span>{' '}
                <span className="font-medium">
                  {form.patient.address1}
                  {form.patient.address2 && `, ${form.patient.address2}`}, {form.patient.city},{' '}
                  {form.patient.state} {form.patient.zip}
                </span>
              </p>
            </div>
          </div>

          {/* Important Notice */}
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Important Notice</h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>By clicking "Send to Pharmacy", you confirm that:</p>
                  <ul className="mt-1 list-inside list-disc">
                    <li>All patient information is accurate and up-to-date</li>
                    <li>The prescribed medications and dosages are correct</li>
                    <li>You have authority to prescribe these medications</li>
                    <li>The prescription complies with all applicable regulations</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => setShowConfirmation(false)}
              className="min-w-[120px] flex-1 rounded-lg border border-gray-300 px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              ← Back to Edit
            </button>
            {isAdminRole && (
              <button
                onClick={() => submit(true)}
                disabled={isSubmitting}
                className="min-w-[180px] flex-1 rounded-lg bg-amber-500 px-6 py-3 font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="-ml-1 mr-2 h-5 w-5 animate-spin text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Queueing...
                  </span>
                ) : (
                  'Queue for Provider'
                )}
              </button>
            )}
            <button
              onClick={() => submit(false)}
              disabled={isSubmitting}
              className="min-w-[180px] flex-1 rounded-lg bg-[#4fa77e] px-6 py-3 font-medium text-white transition-colors hover:bg-[#3f8660] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="-ml-1 mr-3 h-5 w-5 animate-spin text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Sending to Pharmacy...
                </span>
              ) : (
                'Send to Pharmacy →'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* Only show Patient Information section if no patientContext */}
      {!patientContext && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Patient Information</h2>
            <div className="flex gap-2">
              {(['new', 'existing'] as const).map((mode: any) => (
                <button
                  key={mode}
                  type="button"
                  className={`rounded-lg border px-4 py-2 text-sm ${
                    patientMode === mode ? 'border-transparent bg-[#17aa7b] text-white' : 'bg-white'
                  }`}
                  onClick={() => {
                    setPatientMode(mode);
                    if (mode === 'new') {
                      setPatientQuery('');
                      applyPatient(null);
                    } else {
                      applyPatient(null);
                    }
                  }}
                >
                  {mode === 'new' ? 'New Patient' : 'Existing Patient'}
                </button>
              ))}
            </div>
          </div>

          {patientMode === 'existing' && (
            <div className="space-y-2">
              <input
                placeholder="Search by name, DOB, or phone"
                className="w-full border p-2"
                value={patientQuery}
                onChange={(e: any) => setPatientQuery(e.target.value)}
              />
              <div className="max-h-56 divide-y overflow-y-auto rounded-lg border bg-white">
                {filteredPatients.length === 0 ? (
                  <p className="p-3 text-sm text-gray-500">No patients found.</p>
                ) : (
                  filteredPatients.map((patient: any) => {
                    const isActive = selectedPatientId === patient.id;
                    return (
                      <button
                        key={patient.id}
                        type="button"
                        className={`w-full p-3 text-left text-sm ${isActive ? 'bg-[#e9f7f2]' : ''}`}
                        onClick={() => {
                          setPatientQuery(`${patient.firstName} ${patient.lastName}`.trim());
                          applyPatient(patient);
                          setPatientMode('existing');
                        }}
                      >
                        <div className="font-semibold">
                          {patient.firstName} {patient.lastName}
                        </div>
                        <div className="text-xs text-gray-500">
                          DOB {patient.dob} • {patient.phone}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="First Name"
              className="border p-2"
              value={form.patient.firstName}
              onChange={(e: any) => updatePatient('firstName', e.target.value)}
            />
            <input
              placeholder="Last Name"
              className="border p-2"
              value={form.patient.lastName}
              onChange={(e: any) => updatePatient('lastName', e.target.value)}
            />
            <input
              placeholder="DOB MM/DD/YYYY"
              className="border p-2"
              value={form.patient.dob}
              onChange={(e: any) => updatePatient('dob', formatDobInput(e.target.value))}
            />
            <select
              className="border p-2"
              value={form.patient.gender}
              onChange={(e: any) => updatePatient('gender', e.target.value)}
            >
              <option value="">Gender</option>
              <option value="m">Male</option>
              <option value="f">Female</option>
            </select>
            <input
              placeholder="Phone"
              className="border p-2"
              value={form.patient.phone}
              onChange={(e: any) => updatePatient('phone', e.target.value)}
            />
            <input
              placeholder="Email"
              className="border p-2"
              value={form.patient.email}
              onChange={(e: any) => updatePatient('email', e.target.value)}
            />
            <div className="col-span-2">
              <AddressInput
                value={form.patient.address1}
                onChange={(value: string, parsed?: AddressData) => {
                  if (parsed) {
                    setPatientAddressLocked(true);
                    updatePatient('address1', parsed.address1);
                    updatePatient('city', parsed.city);
                    updatePatient('state', parsed.state);
                    updatePatient('zip', parsed.zip);
                  } else {
                    setPatientAddressLocked(false);
                    updatePatient('address1', value);
                  }
                }}
                placeholder="Address Line 1"
                className="w-full"
              />
            </div>
            <input
              placeholder="Apartment / Suite"
              className="col-span-2 border p-2"
              value={form.patient.address2}
              onChange={(e: any) => updatePatient('address2', e.target.value)}
            />
            <input
              placeholder="City"
              className={`border p-2 ${patientAddressLocked ? 'bg-gray-100' : ''}`}
              value={form.patient.city}
              readOnly={patientAddressLocked}
              onChange={(e: any) => {
                setPatientAddressLocked(false);
                updatePatient('city', e.target.value);
              }}
            />
            <select
              className={`border p-2 ${patientAddressLocked ? 'bg-gray-100' : ''}`}
              value={form.patient.state}
              disabled={patientAddressLocked}
              onChange={(e: any) => {
                setPatientAddressLocked(false);
                updatePatient('state', e.target.value);
              }}
            >
              <option value="">State</option>
              {US_STATE_OPTIONS.map((state: any) => (
                <option key={state.value} value={state.value}>
                  {state.label}
                </option>
              ))}
            </select>
            <input
              placeholder="ZIP"
              className={`border p-2 ${patientAddressLocked ? 'bg-gray-100' : ''}`}
              value={form.patient.zip}
              readOnly={patientAddressLocked}
              onChange={(e: any) => {
                setPatientAddressLocked(false);
                updatePatient('zip', e.target.value);
              }}
            />
            {patientAddressLocked && (
              <p className="col-span-2 text-xs text-gray-500">
                City, state, and ZIP were auto-filled from Google. Edit the street line to change.
              </p>
            )}
          </div>
        </section>
      )}

      <label className="mb-1 mt-4 block text-sm font-medium">Provider</label>
      {isLoadingProvider ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm text-gray-600">Loading provider information...</p>
        </div>
      ) : providerLoadError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">Provider Profile Issue</p>
          <p className="mt-1 text-sm text-amber-700">{providerLoadError}</p>
          <a
            href="/provider/settings"
            className="mt-2 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700"
          >
            {isProviderRole ? 'Update Provider Profile' : 'Complete Provider Profile'}
          </a>
        </div>
      ) : isProviderRole && selfProvider ? (
        // PROVIDER ROLE: Show their own profile (read-only, no dropdown)
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 font-bold text-white">
              {selfProvider.firstName?.[0]}
              {selfProvider.lastName?.[0]}
            </div>
            <div>
              <p className="font-medium text-green-900">
                {selfProvider.firstName} {selfProvider.lastName}
                {selfProvider.titleLine && (
                  <span className="text-green-700">, {selfProvider.titleLine}</span>
                )}
              </p>
              <p className="text-sm text-green-700">NPI: {selfProvider.npi}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-green-600">
            Prescribing as yourself. Your signature will be used automatically.
          </p>
        </div>
      ) : providers.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">No Providers Available</p>
          <p className="mt-1 text-sm text-amber-700">
            No providers found for your clinic. Please ensure provider profiles are set up.
          </p>
        </div>
      ) : (
        // ADMIN/STAFF ROLE: Show provider dropdown
        <div>
          <select
            className="w-full border p-2"
            value={form.providerId ?? ''}
            onChange={(e: any) => {
              const id = Number(e.target.value);
              updateRoot('providerId', id);
            }}
          >
            {providers.map((provider: any) => (
              <option key={provider.id} value={provider.id}>
                {provider.firstName} {provider.lastName} (NPI {provider.npi})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Select the provider who will sign this prescription.
          </p>
        </div>
      )}

      <h2 className="mb-2 mt-6 text-2xl font-bold">Medications</h2>
      {form.rxs.map((rx: RxForm, index: number) => {
        const selectedMed = rx.medicationKey ? MEDS[rx.medicationKey] : undefined;
        return (
          <div key={index} className="mb-3 space-y-2 rounded border bg-[#f9f8f6] p-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Medication #{index + 1}</h3>
              {form.rxs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRx(index)}
                  className="text-xs text-red-600 underline"
                >
                  Remove
                </button>
              )}
            </div>
            <label className="mb-1 block text-sm font-medium">Medication</label>
            <MedicationSelector
              value={rx.medicationKey}
              onChange={(key: string) => {
                const med = MEDS[key];
                updateRx(index, 'medicationKey', key);
                if (med) {
                  const defaults = deriveDefaultValues(med);
                  if (defaults.sig && !rx.sig) updateRx(index, 'sig', defaults.sig);
                  if (defaults.quantity && !rx.quantity)
                    updateRx(index, 'quantity', defaults.quantity);
                  if (defaults.refills && !rx.refills) updateRx(index, 'refills', defaults.refills);
                }
              }}
              showCategoryBadge={true}
            />

            {/* Enhanced SigBuilder Component */}
            <SigBuilder
              medicationKey={rx.medicationKey}
              initialSig={rx.sig}
              initialQuantity={rx.quantity}
              initialRefills={rx.refills}
              onSigChange={(sig) => updateRx(index, 'sig', sig)}
              onQuantityChange={(quantity) => updateRx(index, 'quantity', quantity)}
              onRefillsChange={(refills) => updateRx(index, 'refills', refills)}
              disabled={!rx.medicationKey}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Quantity"
                className="border p-2"
                value={rx.quantity}
                onChange={(e: any) => updateRx(index, 'quantity', e.target.value)}
              />
              <input
                placeholder="Refills"
                className="border p-2"
                value={rx.refills}
                onChange={(e: any) => updateRx(index, 'refills', e.target.value)}
              />
            </div>
          </div>
        );
      })}

      <button type="button" onClick={addRx} className="text-sm text-[#4fa77e] underline">
        + Add another medication
      </button>

      <label className="mb-1 mt-4 block text-sm font-medium">Shipping Method</label>
      <select
        className="w-full border p-2"
        value={String(form.shippingMethod)}
        onChange={(e: any) => updateRoot('shippingMethod', Number(e.target.value))}
      >
        {SHIPPING_METHODS.map((method: any) => (
          <option key={method.id} value={String(method.id)}>
            {method.label}
          </option>
        ))}
      </select>

      {/* Only show Provider Signature section if no patientContext or provider has no signature */}
      {!patientContext && (
        <>
          <h2 className="mb-2 mt-6 text-2xl font-bold">Provider Signature</h2>
          {selectedProvider?.signatureDataUrl ? (
            <p className="text-sm text-gray-600">
              ✓ Signature on file for {selectedProvider.firstName} {selectedProvider.lastName} will
              be automatically applied to the e-prescription.
            </p>
          ) : form.signatureDataUrl ? (
            <div>
              <p className="mb-2 text-sm text-gray-600">
                ✓ Signature captured for this prescription.
              </p>
              <button
                type="button"
                onClick={() => updateRoot('signatureDataUrl', null)}
                className="text-sm text-[#4fa77e] hover:underline"
              >
                Clear and re-sign
              </button>
            </div>
          ) : (
            <div>
              <p className="mb-2 flex items-center gap-2 text-sm text-red-600">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                No signature on file for this provider. Please sign below (this will be saved for
                future use).
              </p>
              <SignaturePadCanvas onChange={onSignatureChange} />
            </div>
          )}
        </>
      )}

      <button onClick={handlePreviewClick} disabled={isSubmitting} className="btn-primary mt-2">
        Review Prescription
      </button>
    </div>
  );
}
