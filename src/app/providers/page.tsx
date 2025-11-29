"use client";

import SignaturePadCanvas from "@/components/SignaturePadCanvas";
import { US_STATE_OPTIONS } from "@/lib/usStates";
import Link from "next/link";
import { useEffect, useState } from "react";
import { logger } from '@/lib/logger';
import { Patient, Order } from '@/types/models';

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
};

const TITLE_OPTIONS = [
  "MD",
  "DO",
  "NP",
  "PA",
  "PharmD",
  "DDS",
  "DMD",
  "OD",
  "DPM",
  "DC",
  "Other",
];

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  };
  const [form, setForm] = useState(providerInitialForm);
  const [useSignaturePad, setUseSignaturePad] = useState(true);
  const [verifyingNpi, setVerifyingNpi] = useState(false);
  const [step, setStep] = useState<"npi" | "details">("npi");

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/providers");
      const data = await res.json();
      setProviders(data.providers ?? []);
    } catch (err: any) {
    // @ts-ignore
   
      logger.error(err);
      setError("Failed to load providers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const updateForm = (k: string, v: string | null) =>
    setForm((f: any) => ({ ...f, [k]: v }));

  const resetForm = () => {
    setForm(providerInitialForm);
    setUseSignaturePad(true);
    setStep("npi");
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
      setError("Enter a 10-digit NPI before lookup.");
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
      if (!res.ok) {
        throw new Error(data.error ?? "Unable to verify NPI");
      }
      const basic = data.result.basic ?? {};
      const address =
        data.result.addresses?.find(
          (addr: any) => addr.addressPurpose === "LOCATION"
        ) ?? data.result.addresses?.[0];
      const firstNameFromRegistry =
        basic.firstName ?? basic.first_name ?? (basic as any)?.first ?? "";
      const lastNameFromRegistry =
        basic.lastName ?? basic.last_name ?? (basic as any)?.last ?? "";
      setForm((prev: any) => ({
        ...prev,
        npi,
        firstName: firstNameFromRegistry || prev.firstName,
        lastName: lastNameFromRegistry || prev.lastName,
        titleLine: basic.credential ?? prev.titleLine,
        licenseState: address?.state ?? prev.licenseState,
      }));
      setStep("details");
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    setError(errorMessage ?? "Failed to lookup NPI");
    } finally {
      setVerifyingNpi(false);
    }
  };

  const submit = async () => {
    try {
      if (!form.firstName || !form.lastName) {
        setError("First and last name are required.");
        return;
      }
      if (!/^\d{10}$/.test(form.npi.trim())) {
        setError("NPI must be exactly 10 digits.");
        return;
      }
      
      // Validate signature - check for actual data content
      if (!form.signatureDataUrl || form.signatureDataUrl.trim() === "") {
        setError("Provider signature is required for e-prescriptions. Please draw or upload a signature.");
        return;
      }
      
      // Additional validation for base64 data
      if (!form.signatureDataUrl.startsWith("data:image/")) {
        setError("Invalid signature format. Please try drawing or uploading the signature again.");
        return;
      }
      
      logger.debug("Submitting provider with signature:", { status: form.signatureDataUrl ? "Present" : "Missing" });
      logger.debug("Signature format:", { format: form.signatureDataUrl?.substring(0, 30) || "None" });
      setError(null);
      
      const payload = {
        ...form,
        npi: form.npi.trim(),
        licenseState: form.licenseState?.trim() || null,
        signatureDataUrl: form.signatureDataUrl,
      };
      
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create provider");
      }
      alert("Provider added successfully!");
      resetForm();
      fetchProviders();
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    setError(errorMessage ?? "Failed to add provider");
    }
  };

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Providers</h1>
      <section className="border rounded p-4 space-y-4 bg-white shadow">
        <h2 className="text-xl font-semibold">Add Provider</h2>
        <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Step 1 · Verify NPI
              </p>
              <p className="text-sm text-gray-700">
                We’ll pull the prescriber’s legal name and credential directly from NPPES.
              </p>
            </div>
            {step === "details" && (
              <button
                type="button"
                onClick={() => setStep("npi")}
                className="text-sm text-[#4fa77e] underline"
              >
                Use different NPI
              </button>
            )}
          </div>
          {step === "npi" ? (
            <>
              <div className="flex gap-2">
                <input
                  className="border p-2 text-base flex-1"
                  value={form.npi}
                  onChange={(e: any) => updateForm("npi", e.target.value)}
                  placeholder="10-digit NPI"
                />
                <button
                  type="button"
                  onClick={lookupNpi}
                  className="btn-primary whitespace-nowrap"
                  disabled={verifyingNpi}
                >
                  {verifyingNpi ? "Verifying…" : "Lookup"}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Need to enter details manually?</span>
                <button
                  type="button"
                  onClick={() => setStep("details")}
                  className="text-[#4fa77e] underline"
                >
                  Skip lookup
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">NPI ready</p>
                <p className="text-lg font-semibold tracking-wide">{form.npi}</p>
              </div>
              <p className="text-xs text-gray-500">
                Lookup completed. Finish the remaining details below.
              </p>
            </div>
          )}
        </div>

        {step === "details" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col text-sm font-medium text-gray-600">
                NPI (locked)
                <input className="border p-2 text-base bg-gray-100" value={form.npi} disabled />
              </label>
              <span />
              <label className="flex flex-col text-sm font-medium text-gray-600">
                First Name
                <input
                  className="border p-2 text-base"
                  value={form.firstName}
                  onChange={(e: any) => updateForm("firstName", e.target.value)}
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-gray-600">
                Last Name
                <input
                  className="border p-2 text-base"
                  value={form.lastName}
                  onChange={(e: any) => updateForm("lastName", e.target.value)}
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-gray-600">
                Professional Title
                <select
                  className="border p-2 text-base"
                  value={form.titleLine}
                  onChange={(e: any) => updateForm("titleLine", e.target.value)}
                >
                  <option value="">Select title…</option>
                  {TITLE_OPTIONS.map((title: any) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-sm font-medium text-gray-600">
                License State
                <select
                  className="border p-2 text-base"
                  value={form.licenseState}
                  onChange={(e: any) => updateForm("licenseState", e.target.value)}
                >
                  <option value="">Select state…</option>
                  {US_STATE_OPTIONS.map((state: any) => (
                    <option key={state.value} value={state.value}>
                      {state.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-sm font-medium text-gray-600">
                License Number
                <input
                  className="border p-2 text-base"
                  value={form.licenseNumber}
                  onChange={(e: any) => updateForm("licenseNumber", e.target.value)}
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-gray-600">
                DEA Number
                <input
                  className="border p-2 text-base"
                  value={form.dea}
                  onChange={(e: any) => updateForm("dea", e.target.value)}
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-gray-600">
                Email
                <input
                  className="border p-2 text-base"
                  value={form.email}
                  onChange={(e: any) => updateForm("email", e.target.value)}
                />
              </label>
              <label className="flex flex-col text-sm font-medium text-gray-600">
                Phone
                <input
                  className="border p-2 text-base"
                  value={form.phone}
                  onChange={(e: any) => updateForm("phone", e.target.value)}
                />
              </label>
              <div className="col-span-2 space-y-2">
                <p className="text-sm font-medium text-gray-600">
                  Provider Signature (Required for e-prescriptions)
                </p>
                <div className="flex gap-4 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setUseSignaturePad(true)}
                    className={`px-3 py-1 rounded border ${
                      useSignaturePad ? "bg-[#17aa7b] text-white border-transparent" : ""
                    }`}
                  >
                    Draw
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseSignaturePad(false)}
                    className={`px-3 py-1 rounded border ${
                      !useSignaturePad ? "bg-[#17aa7b] text-white border-transparent" : ""
                    }`}
                  >
                    Upload
                  </button>
                </div>
                {useSignaturePad ? (
                  <SignaturePadCanvas
                    onChange={(dataUrl: any) => {
                      logger.debug("Signature changed:", { value: dataUrl ? "Present" : "Cleared" });
                      updateForm("signatureDataUrl", dataUrl);
                    }}
                    initialSignature={form.signatureDataUrl || undefined}
                  />
                ) : (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e: any) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const base64 = await handleSignatureUpload(file);
                      updateForm("signatureDataUrl", base64);
                    }}
                  />
                )}
                {form.signatureDataUrl && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                    <p className="text-sm text-green-700">✓ Signature captured</p>
                  </div>
                )}
              </div>
            </div>
            <button onClick={submit} className="btn-primary">
              Add Provider
            </button>
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      <section className="border rounded p-4 bg-white shadow">
        <h2 className="text-xl font-semibold mb-3">Existing Providers</h2>
        {loading ? (
          <p>Loading…</p>
        ) : providers.length === 0 ? (
          <p>No providers yet.</p>
        ) : (
          <table className="w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1 text-left">Name</th>
                <th className="border px-2 py-1 text-left">NPI</th>
                <th className="border px-2 py-1 text-left">License</th>
                <th className="border px-2 py-1 text-left">DEA</th>
                <th className="border px-2 py-1 text-left">Verified</th>
                <th className="border px-2 py-1 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider: any) => (
                <tr key={provider.id} className="hover:bg-gray-50">
                  <td className="border px-2 py-1">
                    <div className="font-semibold">
                      {provider.firstName} {provider.lastName}
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">
                      #PROVIDER
                    </span>
                    <div className="text-xs text-gray-500">{provider.titleLine}</div>
                  </td>
                  <td className="border px-2 py-1">{provider.npi}</td>
                  <td className="border px-2 py-1">
                    {provider.licenseState} {provider.licenseNumber}
                  </td>
                  <td className="border px-2 py-1">{provider.dea ?? "—"}</td>
                  <td className="border px-2 py-1">
                    {provider.npiVerifiedAt
                      ? new Date(provider.npiVerifiedAt).toLocaleDateString()
                      : "Not verified"}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    <Link
                      href={`/providers/${provider.id}`}
                      className="text-[#4fa77e] underline text-xs"
                    >
                      View profile
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

