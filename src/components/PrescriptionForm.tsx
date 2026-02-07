"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AddressInput, AddressData } from "@/components/AddressAutocomplete";
import { MEDS, MedicationConfig, SigTemplate } from "@/lib/medications";
import { SHIPPING_METHODS } from "@/lib/shipping";
import SignaturePadCanvas from "./SignaturePadCanvas";
import SigBuilder from "./SigBuilder";
import MedicationSelector from "./MedicationSelector";
import { US_STATE_OPTIONS } from "@/lib/usStates";
import { formatDobInput } from "@/lib/format";
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

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
    case "INJ":
      return {
        sig: "Inject once per week subcutaneously. Store in refrigerator.",
        quantity: "1",
        refills: "0",
      };
    case "TAB":
    case "CAP":
    case "TROCHE":
      return {
        sig: "Take 1 by mouth once daily as directed.",
        quantity: "30",
        refills: "0",
      };
    case "CREAM":
    case "GEL":
      return {
        sig: "Apply a thin layer to affected area as directed.",
        quantity: "1",
        refills: "1",
      };
    case "SWAB":
      return {
        sig: "Use to cleanse skin prior to injection as directed.",
        quantity: "30",
        refills: "0",
      };
    default:
      return {
        sig: "Use as directed.",
        quantity: "1",
        refills: "0",
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
  firstName: "",
  lastName: "",
  dob: "",
  gender: "",
  phone: "",
  email: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zip: "",
};

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
          gender: patientContext.gender,
          phone: patientContext.phone,
          email: patientContext.email,
          address1: patientContext.address1,
          address2: patientContext.address2 ?? "",
          city: patientContext.city,
          state: patientContext.state,
          zip: patientContext.zip,
        }
      : { ...EMPTY_PATIENT },
    rxs: [
      {
        medicationKey: "",
        sig: "",
        quantity: "",
        refills: "",
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
  const [patientAddressLocked, setPatientAddressLocked] = useState(
    Boolean(patientContext)
  );
  const [patientMode, setPatientMode] = useState<"new" | "existing">(
    patientContext ? "existing" : "new"
  );
  const [patientQuery, setPatientQuery] = useState("");
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
          .replace(/\s+/g, " ");
        return blob.includes(query);
      })
      .slice(0, 10);
  }, [patientQuery, patients]);

  // Load provider(s) based on user role
  useEffect(() => {
    async function loadProviderData() {
      setIsLoadingProvider(true);
      setProviderLoadError(null);
      
      try {
        // Get auth token from localStorage
        const token = localStorage.getItem('token') || 
                      localStorage.getItem('auth-token') || 
                      localStorage.getItem('provider-token') ||
                      localStorage.getItem('admin-token') ||
                      localStorage.getItem('super_admin-token');
        
        if (!token) {
          setProviderLoadError('No authentication token found');
          setIsLoadingProvider(false);
          return;
        }
        
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${token}`,
        };
        
        // Decode JWT to get user role (basic decode - not verification)
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const role = payload.role?.toLowerCase() || 'admin';
          setUserRole(role);
          logger.info(`[PrescriptionForm] User role: ${role}`);
          
          if (role === 'provider') {
            // PROVIDER ROLE: Fetch own profile via /api/providers/me
            const res = await fetch("/api/providers/me", { headers });
            const data = await res.json();
            
            if (res.ok && data.provider) {
              const myProvider: ProviderOption = {
                id: data.provider.id,
                firstName: data.provider.firstName,
                lastName: data.provider.lastName,
                titleLine: data.provider.titleLine,
                npi: data.provider.npi,
                signatureDataUrl: data.provider.signatureDataUrl,
              };
              setSelfProvider(myProvider);
              setForm((f: any) => ({ ...f, providerId: myProvider.id }));
              logger.info(`[PrescriptionForm] Provider self-loaded: ${myProvider.firstName} ${myProvider.lastName}`);
              
              // Check if provider profile is complete
              if (!data.isComplete) {
                const missing = [];
                if (data.missing?.npi) missing.push('NPI');
                if (data.missing?.dea) missing.push('DEA');
                if (missing.length > 0) {
                  setProviderLoadError(`Missing credentials: ${missing.join(', ')}`);
                }
              }
            } else {
              setProviderLoadError(data.message || 'Could not find your provider profile');
              logger.warn('[PrescriptionForm] Provider profile not found', { error: data.error });
            }
          } else {
            // ADMIN/STAFF ROLE: Fetch all providers for dropdown selection
            const res = await fetch("/api/providers", { headers });
            const data = await res.json();
            setProviders(data.providers ?? []);
            if (!form.providerId && data.providers?.length) {
              setForm((f: any) => ({ ...f, providerId: data.providers[0].id }));
            }
            logger.info(`[PrescriptionForm] Loaded ${data.providers?.length || 0} providers for admin`);
          }
        } catch (decodeErr) {
          logger.error('[PrescriptionForm] Failed to decode token', decodeErr);
          // Fallback: try loading providers list
          const res = await fetch("/api/providers", { headers });
          const data = await res.json();
          setProviders(data.providers ?? []);
          setUserRole('admin');
        }
      } catch (err: any) {
        logger.error("Failed to load provider data", err);
        setProviderLoadError('Failed to load provider information');
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
        const token = localStorage.getItem('token') || 
                      localStorage.getItem('auth-token') || 
                      localStorage.getItem('provider-token') ||
                      localStorage.getItem('admin-token') ||
                      localStorage.getItem('super_admin-token');
        
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        
        const res = await fetch("/api/patients", { headers });
        const data = await res.json();
        setPatients(data.patients ?? []);
      } catch (err: any) {
        logger.error("Failed to load patients", err);
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
        gender: patientContext.gender,
        phone: patientContext.phone,
        email: patientContext.email,
        address1: patientContext.address1,
        address2: patientContext.address2 ?? "",
        city: patientContext.city,
        state: patientContext.state,
        zip: patientContext.zip,
      },
    }));
    setSelectedPatientId(patientContext.id ?? null);
    setPatientAddressLocked(true);
    setPatientMode("existing");
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
      rxs: [...f.rxs, { medicationKey: "", sig: "", quantity: "", refills: "" }],
    }));

  const removeRx = (index: number) =>
    setForm((f: any) => {
      if (f.rxs.length === 1) return f;
      const rxs: RxForm[] = [...f.rxs];
      rxs.splice(index, 1);
      return { ...f, rxs };
    });

  const onSignatureChange = (dataUrl: string | null) => {
    updateRoot("signatureDataUrl", dataUrl);
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
          firstName: "",
          lastName: "",
          dob: "",
          gender: "",
          phone: "",
          email: "",
          address1: "",
          address2: "",
          city: "",
          state: "",
          zip: "",
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
        gender: patient.gender === "m" || patient.gender === "f" ? patient.gender : "",
        phone: patient.phone,
        email: patient.email,
        address1: patient.address1,
        address2: patient.address2 ?? "",
        city: patient.city,
        state: patient.state,
        zip: patient.zip,
      },
    }));
    setSelectedPatientId(patient.id);
  };

  async function handlePreviewClick() {
    if (!form.providerId) {
      alert("Please select a provider before submitting.");
      return;
    }
    if (!["m", "f"].includes(form.patient.gender)) {
      alert("Select patient gender before submitting.");
      return;
    }
    if (!form.patient.state) {
      alert("Select patient state before submitting.");
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
      const res = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submissionData),
      });
      const data = await res.json();
      if (!res.ok) {
        logger.error("Prescription submission error:", data);
        // Show detailed error message to user
        const errorMsg = data.error || data.detail || "Unknown error";
        const detailMsg = data.detail ? `\n\nDetails: ${data.detail}` : "";
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
        else
          window.location.href = "/orders/dashboard?queued=1";
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
        window.location.href = "/orders/dashboard?submitted=1";
      }
    } catch (err: any) {
      logger.error("Prescription fetch error:", err);
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
      <div className="space-y-6 max-w-4xl">
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Prescription Confirmation</h1>
            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full font-medium">
              Pending Review
            </span>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600">
              Please review all prescription details carefully before sending to the pharmacy.
              Once submitted, this prescription will be processed and sent for fulfillment.
            </p>
            {isAdminRole && (
              <p className="text-sm text-amber-700 mt-2">
                As an admin, you can <strong>Queue for Provider</strong> to send this prescription to your clinic&apos;s provider queue. A provider will then review, approve, and send it to the pharmacy. This is logged for compliance.
              </p>
            )}
          </div>

          {/* Patient Information */}
          <div className="border-b pb-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Patient Information</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Name:</span>{" "}
                <span className="font-medium">{form.patient.firstName} {form.patient.lastName}</span>
              </div>
              <div>
                <span className="text-gray-600">DOB:</span>{" "}
                <span className="font-medium">{form.patient.dob}</span>
              </div>
              <div>
                <span className="text-gray-600">Gender:</span>{" "}
                <span className="font-medium">{(() => {
                  const g = form.patient.gender?.toLowerCase().trim();
                  if (g === 'f' || g === 'female' || g === 'woman') return 'Female';
                  if (g === 'm' || g === 'male' || g === 'man') return 'Male';
                  return form.patient.gender || '—';
                })()}</span>
              </div>
              <div>
                <span className="text-gray-600">Phone:</span>{" "}
                <span className="font-medium">{form.patient.phone}</span>
              </div>
              <div>
                <span className="text-gray-600">Email:</span>{" "}
                <span className="font-medium">{form.patient.email}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-600">Address:</span>{" "}
                <span className="font-medium">
                  {form.patient.address1}
                  {form.patient.address2 && `, ${form.patient.address2}`}
                  , {form.patient.city}, {form.patient.state} {form.patient.zip}
                </span>
              </div>
            </div>
          </div>

          {/* Provider Information */}
          <div className="border-b pb-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Provider Information</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Provider:</span>{" "}
                <span className="font-medium">
                  {selectedProvider?.firstName} {selectedProvider?.lastName}
                  {selectedProvider?.titleLine && `, ${selectedProvider.titleLine}`}
                </span>
              </div>
              <div>
                <span className="text-gray-600">NPI:</span>{" "}
                <span className="font-medium">{selectedProvider?.npi}</span>
              </div>
              <div>
                <span className="text-gray-600">Signature:</span>{" "}
                <span className={`font-medium ${selectedProvider?.signatureDataUrl || form.signatureDataUrl ? 'text-green-600' : 'text-amber-600'}`}>
                  {selectedProvider?.signatureDataUrl || form.signatureDataUrl ? 'Captured' : 'Missing'}
                </span>
              </div>
            </div>
          </div>

          {/* Medications */}
          <div className="border-b pb-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Medications</h2>
            {form.rxs.map((rx: any, index: number) => {
              const med = MEDS[rx.medicationKey];
              if (!med) return null;
              return (
                <div key={index} className="bg-blue-50 rounded-lg p-4 mb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm mb-2">
                        Medication #{index + 1}
                      </h3>
                      <p className="font-medium">
                        {med.name} - {med.strength}
                        {med.formLabel && ` (${med.formLabel})`}
                      </p>
                      <div className="mt-2 space-y-1 text-sm">
                        <p><span className="text-gray-600">SIG:</span> {rx.sig}</p>
                        <p>
                          <span className="text-gray-600">Quantity:</span> {rx.quantity} •{" "}
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
          <div className="border-b pb-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Shipping Information</h2>
            <div className="text-sm">
              <p>
                <span className="text-gray-600">Method:</span>{" "}
                <span className="font-medium">{shippingMethod?.label}</span>
              </p>
              <p className="mt-2">
                <span className="text-gray-600">Delivery Address:</span>{" "}
                <span className="font-medium">
                  {form.patient.address1}
                  {form.patient.address2 && `, ${form.patient.address2}`}
                  , {form.patient.city}, {form.patient.state} {form.patient.zip}
                </span>
              </p>
            </div>
          </div>

          {/* Important Notice */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Important Notice
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p>
                    By clicking "Send to Pharmacy", you confirm that:
                  </p>
                  <ul className="list-disc list-inside mt-1">
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
              className="flex-1 min-w-[120px] px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              ← Back to Edit
            </button>
            {isAdminRole && (
              <button
                onClick={() => submit(true)}
                disabled={isSubmitting}
                className="flex-1 min-w-[180px] px-6 py-3 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Queueing...
                  </span>
                ) : (
                  "Queue for Provider"
                )}
              </button>
            )}
            <button
              onClick={() => submit(false)}
              disabled={isSubmitting}
              className="flex-1 min-w-[180px] px-6 py-3 bg-[#4fa77e] text-white rounded-lg font-medium hover:bg-[#3f8660] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Sending to Pharmacy...
                </span>
              ) : (
                "Send to Pharmacy →"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Only show Patient Information section if no patientContext */}
      {!patientContext && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Patient Information</h2>
            <div className="flex gap-2">
              {(["new", "existing"] as const).map((mode: any) => (
                <button
                  key={mode}
                  type="button"
                  className={`px-4 py-2 rounded-lg border text-sm ${
                    patientMode === mode
                      ? "bg-[#17aa7b] text-white border-transparent"
                      : "bg-white"
                  }`}
                  onClick={() => {
                    setPatientMode(mode);
                    if (mode === "new") {
                      setPatientQuery("");
                      applyPatient(null);
                    } else {
                      applyPatient(null);
                    }
                  }}
                >
                  {mode === "new" ? "New Patient" : "Existing Patient"}
                </button>
              ))}
            </div>
          </div>

        {patientMode === "existing" && (
          <div className="space-y-2">
            <input
              placeholder="Search by name, DOB, or phone"
              className="border p-2 w-full"
              value={patientQuery}
              onChange={(e: any) => setPatientQuery(e.target.value)}
            />
            <div className="border rounded-lg divide-y max-h-56 overflow-y-auto bg-white">
              {filteredPatients.length === 0 ? (
                <p className="p-3 text-sm text-gray-500">No patients found.</p>
              ) : (
                filteredPatients.map((patient: any) => {
                  const isActive = selectedPatientId === patient.id;
                  return (
                    <button
                      key={patient.id}
                      type="button"
                      className={`w-full text-left p-3 text-sm ${
                        isActive ? "bg-[#e9f7f2]" : ""
                      }`}
                      onClick={() => {
                        setPatientQuery(
                          `${patient.firstName} ${patient.lastName}`.trim()
                        );
                        applyPatient(patient);
                        setPatientMode("existing");
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
            onChange={(e: any) => updatePatient("firstName", e.target.value)}
          />
          <input
            placeholder="Last Name"
            className="border p-2"
            value={form.patient.lastName}
            onChange={(e: any) => updatePatient("lastName", e.target.value)}
          />
          <input
            placeholder="DOB MM/DD/YYYY"
            className="border p-2"
            value={form.patient.dob}
            onChange={(e: any) => updatePatient("dob", formatDobInput(e.target.value))}
          />
          <select
            className="border p-2"
            value={form.patient.gender}
            onChange={(e: any) => updatePatient("gender", e.target.value)}
          >
            <option value="">Gender</option>
            <option value="m">Male</option>
            <option value="f">Female</option>
          </select>
          <input
            placeholder="Phone"
            className="border p-2"
            value={form.patient.phone}
            onChange={(e: any) => updatePatient("phone", e.target.value)}
          />
          <input
            placeholder="Email"
            className="border p-2"
            value={form.patient.email}
            onChange={(e: any) => updatePatient("email", e.target.value)}
          />
          <div className="col-span-2">
            <AddressInput
              value={form.patient.address1}
              onChange={(value: string, parsed?: AddressData) => {
                if (parsed) {
                  setPatientAddressLocked(true);
                  updatePatient("address1", parsed.address1);
                  updatePatient("city", parsed.city);
                  updatePatient("state", parsed.state);
                  updatePatient("zip", parsed.zip);
                } else {
                  setPatientAddressLocked(false);
                  updatePatient("address1", value);
                }
              }}
              placeholder="Address Line 1"
              className="w-full"
            />
          </div>
          <input
            placeholder="Apartment / Suite"
            className="border p-2 col-span-2"
            value={form.patient.address2}
            onChange={(e: any) => updatePatient("address2", e.target.value)}
          />
          <input
            placeholder="City"
            className={`border p-2 ${patientAddressLocked ? "bg-gray-100" : ""}`}
            value={form.patient.city}
            readOnly={patientAddressLocked}
            onChange={(e: any) => {
              setPatientAddressLocked(false);
              updatePatient("city", e.target.value);
            }}
          />
          <select
            className={`border p-2 ${patientAddressLocked ? "bg-gray-100" : ""}`}
            value={form.patient.state}
            disabled={patientAddressLocked}
            onChange={(e: any) => {
              setPatientAddressLocked(false);
              updatePatient("state", e.target.value);
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
            className={`border p-2 ${patientAddressLocked ? "bg-gray-100" : ""}`}
            value={form.patient.zip}
            readOnly={patientAddressLocked}
            onChange={(e: any) => {
              setPatientAddressLocked(false);
              updatePatient("zip", e.target.value);
            }}
          />
          {patientAddressLocked && (
            <p className="text-xs text-gray-500 col-span-2">
              City, state, and ZIP were auto-filled from Google. Edit the street line to change.
            </p>
          )}
        </div>
      </section>
      )}

      <label className="block text-sm font-medium mt-4 mb-1">Provider</label>
      {isLoadingProvider ? (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-sm text-gray-600">Loading provider information...</p>
        </div>
      ) : providerLoadError ? (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800 font-medium">Provider Profile Issue</p>
          <p className="text-sm text-amber-700 mt-1">{providerLoadError}</p>
          <a
            href="/provider/settings"
            className="inline-block mt-2 px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700"
          >
            {isProviderRole ? 'Update Provider Profile' : 'Complete Provider Profile'}
          </a>
        </div>
      ) : isProviderRole && selfProvider ? (
        // PROVIDER ROLE: Show their own profile (read-only, no dropdown)
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white font-bold">
              {selfProvider.firstName?.[0]}{selfProvider.lastName?.[0]}
            </div>
            <div>
              <p className="font-medium text-green-900">
                {selfProvider.firstName} {selfProvider.lastName}
                {selfProvider.titleLine && <span className="text-green-700">, {selfProvider.titleLine}</span>}
              </p>
              <p className="text-sm text-green-700">NPI: {selfProvider.npi}</p>
            </div>
          </div>
          <p className="text-xs text-green-600 mt-2">
            Prescribing as yourself. Your signature will be used automatically.
          </p>
        </div>
      ) : providers.length === 0 ? (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800 font-medium">No Providers Available</p>
          <p className="text-sm text-amber-700 mt-1">
            No providers found for your clinic. Please ensure provider profiles are set up.
          </p>
        </div>
      ) : (
        // ADMIN/STAFF ROLE: Show provider dropdown
        <div>
          <select
            className="border p-2 w-full"
            value={form.providerId ?? ""}
            onChange={(e: any) => {
              const id = Number(e.target.value);
              updateRoot("providerId", id);
            }}
          >
            {providers.map((provider: any) => (
              <option key={provider.id} value={provider.id}>
                {provider.firstName} {provider.lastName} (NPI {provider.npi})
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Select the provider who will sign this prescription.
          </p>
        </div>
      )}

      <h2 className="text-2xl font-bold mt-6 mb-2">Medications</h2>
      {form.rxs.map((rx: RxForm, index: number) => {
        const selectedMed = rx.medicationKey  ? MEDS[rx.medicationKey]  : undefined;
        return (
          <div key={index} className="border rounded p-3 mb-3 space-y-2 bg-[#f9f8f6]">
            <div className="flex justify-between items-center">
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
            <label className="block text-sm font-medium mb-1">Medication</label>
            <MedicationSelector
              value={rx.medicationKey}
              onChange={(key: string) => {
                const med = MEDS[key];
                updateRx(index, "medicationKey", key);
                if (med) {
                  const defaults = deriveDefaultValues(med);
                  if (defaults.sig && !rx.sig) updateRx(index, "sig", defaults.sig);
                  if (defaults.quantity && !rx.quantity)
                    updateRx(index, "quantity", defaults.quantity);
                  if (defaults.refills && !rx.refills)
                    updateRx(index, "refills", defaults.refills);
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
              onSigChange={(sig) => updateRx(index, "sig", sig)}
              onQuantityChange={(quantity) => updateRx(index, "quantity", quantity)}
              onRefillsChange={(refills) => updateRx(index, "refills", refills)}
              disabled={!rx.medicationKey}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Quantity"
                className="border p-2"
                value={rx.quantity}
                onChange={(e: any) => updateRx(index, "quantity", e.target.value)}
              />
              <input
                placeholder="Refills"
                className="border p-2"
                value={rx.refills}
                onChange={(e: any) => updateRx(index, "refills", e.target.value)}
              />
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRx}
        className="text-sm underline text-[#4fa77e]"
      >
        + Add another medication
      </button>

      <label className="block text-sm font-medium mt-4 mb-1">Shipping Method</label>
      <select
        className="border p-2 w-full"
        value={String(form.shippingMethod)}
        onChange={(e: any) => updateRoot("shippingMethod", Number(e.target.value))}
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
          <h2 className="text-2xl font-bold mt-6 mb-2">Provider Signature</h2>
          {selectedProvider?.signatureDataUrl ? (
            <p className="text-sm text-gray-600">
              ✓ Signature on file for {selectedProvider.firstName}{" "}
              {selectedProvider.lastName} will be automatically applied to the e-prescription.
            </p>
          ) : form.signatureDataUrl ? (
            <div>
              <p className="text-sm text-gray-600 mb-2">
                ✓ Signature captured for this prescription.
              </p>
              <button 
                type="button"
                onClick={() => updateRoot("signatureDataUrl", null)}
                className="text-sm text-[#4fa77e] hover:underline"
              >
                Clear and re-sign
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-red-600 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                No signature on file for this provider. Please sign below (this will be saved for future use).
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
