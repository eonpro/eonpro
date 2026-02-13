'use client';

import SignaturePadCanvas from '@/components/SignaturePadCanvas';
import { US_STATE_OPTIONS } from '@/lib/usStates';
import { useState } from 'react';
import { Patient, Provider, Order } from '@/types/models';

const initialForm = {
  firstName: '',
  lastName: '',
  npi: '',
  titleLine: '',
  licenseState: '',
  licenseNumber: '',
  dea: '',
  email: '',
  phone: '',
  signatureDataUrl: undefined as string | undefined,
};

const TITLE_OPTIONS = ['MD', 'DO', 'NP', 'PA', 'PharmD', 'DDS', 'DMD', 'OD', 'DPM', 'DC', 'Other'];

export default function ProviderSignupPage() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [useSignaturePad, setUseSignaturePad] = useState(true);
  const [verifyingNpi, setVerifyingNpi] = useState(false);
  const [step, setStep] = useState<'npi' | 'details'>('npi');

  const update = (k: string, v: string | null) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleSignatureUpload = async (file: File) =>
    new Promise<string | null>((resolve: any) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

  const submit = async () => {
    setStatus('submitting');
    setMessage(null);
    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Unable to register provider');
      }
      setStatus('success');
      setMessage('Submitted successfully. Our team will review and approve your profile shortly.');
      setForm(initialForm);
      setUseSignaturePad(true);
      setStep('npi');
    } catch (err: any) {
      // @ts-ignore

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setStatus('error');
      setMessage(errorMessage ?? 'Something went wrong. Please try again.');
    }
  };

  const lookupNpi = async () => {
    const npi = form.npi.trim();
    if (!/^\d{10}$/.test(npi)) {
      setStatus('error');
      setMessage('Enter a 10-digit NPI before lookup.');
      return;
    }
    try {
      setMessage(null);
      setVerifyingNpi(true);
      const res = await fetch('/api/providers/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npi }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Unable to verify NPI');
      }
      const basic = data.result.basic ?? {};
      const address =
        data.result.addresses?.find((addr: any) => addr.addressPurpose === 'LOCATION') ??
        data.result.addresses?.[0];
      const firstNameFromRegistry =
        basic.firstName ?? basic.first_name ?? (basic as any)?.first ?? '';
      const lastNameFromRegistry = basic.lastName ?? basic.last_name ?? (basic as any)?.last ?? '';
      setForm((prev: any) => ({
        ...prev,
        firstName: firstNameFromRegistry || prev.firstName,
        lastName: lastNameFromRegistry || prev.lastName,
        titleLine: basic.credential ?? prev.titleLine,
        licenseState: address?.state ?? prev.licenseState,
      }));
      setStep('details');
      setStatus('success');
      setMessage('NPI verified and info populated.');
    } catch (err: any) {
      // @ts-ignore

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setStatus('error');
      setMessage(errorMessage ?? 'Failed to lookup NPI');
    } finally {
      setVerifyingNpi(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">Provider Enrollment</h1>
        <p className="mt-2 text-gray-600">
          Submit your prescriber credentials. We automatically verify your NPI via the NPPES
          registry before activation.
        </p>
      </div>

      <div className="space-y-4 rounded border bg-white p-6 shadow">
        <div className="space-y-3 rounded-lg border bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Step 1 · Verify NPI</p>
              <p className="text-sm text-gray-700">
                We use the NPPES registry to preload your legal name and credential.
              </p>
            </div>
            {step === 'details' && (
              <button
                type="button"
                onClick={() => setStep('npi')}
                className="text-sm text-[#4fa77e] underline"
              >
                Use different NPI
              </button>
            )}
          </div>
          {step === 'npi' ? (
            <>
              <div className="flex flex-wrap gap-3">
                <input
                  className="min-w-[200px] flex-1 border p-2"
                  placeholder="10-digit NPI"
                  value={form.npi}
                  onChange={(e: any) => update('npi', e.target.value)}
                />
                <button
                  type="button"
                  onClick={lookupNpi}
                  className="btn-primary"
                  disabled={verifyingNpi}
                >
                  {verifyingNpi ? 'Verifying…' : 'Lookup'}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Can't find your record?</span>
                <button
                  type="button"
                  onClick={() => setStep('details')}
                  className="text-[#4fa77e] underline"
                >
                  Enter manually
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
                We imported your name and license details from the registry.
              </p>
            </div>
          )}
        </div>

        {step === 'details' && (
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col text-sm font-medium text-gray-600">
              NPI (locked)
              <input className="border bg-gray-100 p-2" value={form.npi} disabled />
            </label>
            <span />
            <input
              className="col-span-2 border p-2 sm:col-span-1"
              placeholder="First Name"
              value={form.firstName}
              onChange={(e: any) => update('firstName', e.target.value)}
            />
            <input
              className="col-span-2 border p-2 sm:col-span-1"
              placeholder="Last Name"
              value={form.lastName}
              onChange={(e: any) => update('lastName', e.target.value)}
            />
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-600">
                Professional Title
              </label>
              <select
                className="w-full border p-2"
                value={form.titleLine}
                onChange={(e: any) => update('titleLine', e.target.value)}
              >
                <option value="">Select title…</option>
                {TITLE_OPTIONS.map((title: any) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </div>
            <select
              className="col-span-2 border p-2 sm:col-span-1"
              value={form.licenseState}
              onChange={(e: any) => update('licenseState', e.target.value)}
            >
              <option value="">License State</option>
              {US_STATE_OPTIONS.map((state: any) => (
                <option key={state.value} value={state.value}>
                  {state.label}
                </option>
              ))}
            </select>
            <input
              className="col-span-2 border p-2 sm:col-span-1"
              placeholder="License Number"
              value={form.licenseNumber}
              onChange={(e: any) => update('licenseNumber', e.target.value)}
            />
            <input
              className="col-span-2 border p-2 sm:col-span-1"
              placeholder="DEA Number"
              value={form.dea}
              onChange={(e: any) => update('dea', e.target.value)}
            />
            <input
              className="col-span-2 border p-2 sm:col-span-1"
              placeholder="Email"
              value={form.email}
              onChange={(e: any) => update('email', e.target.value)}
            />
            <input
              className="col-span-2 border p-2 sm:col-span-1"
              placeholder="Phone"
              value={form.phone}
              onChange={(e: any) => update('phone', e.target.value)}
            />
            <div className="col-span-2 space-y-2">
              <p className="text-sm font-medium text-gray-600">Signature (upload or draw)</p>
              <div className="flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => setUseSignaturePad(true)}
                  className={`rounded border px-3 py-1 ${
                    useSignaturePad ? 'border-transparent bg-[#17aa7b] text-white' : ''
                  }`}
                >
                  Draw
                </button>
                <button
                  type="button"
                  onClick={() => setUseSignaturePad(false)}
                  className={`rounded border px-3 py-1 ${
                    !useSignaturePad ? 'border-transparent bg-[#17aa7b] text-white' : ''
                  }`}
                >
                  Upload
                </button>
              </div>
              {useSignaturePad ? (
                <SignaturePadCanvas
                  onChange={(dataUrl: any) => update('signatureDataUrl', dataUrl)}
                />
              ) : (
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e: any) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const base64 = await handleSignatureUpload(file);
                    update('signatureDataUrl', base64);
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={submit}
          disabled={status === 'submitting' || step === 'npi'}
          className="btn-primary disabled:opacity-50"
        >
          {status === 'submitting' ? 'Submitting…' : 'Submit Provider Application'}
        </button>
        {message && (
          <p className={status === 'error' ? 'text-red-600' : 'text-green-600'}>{message}</p>
        )}
      </div>
    </div>
  );
}
