'use client';

import SignaturePadCanvas from '@/components/SignaturePadCanvas';
import { US_STATE_OPTIONS } from '@/lib/usStates';
import { useState, useEffect } from 'react';
import ProviderPasswordSetup from './ProviderPasswordSetup';
import { Building2 } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

type Clinic = {
  id: number;
  name: string;
  subdomain: string;
  status: string;
};

type EditableProvider = {
  id: number;
  npi: string;
  firstName: string;
  lastName: string;
  titleLine?: string | null;
  licenseState?: string | null;
  licenseNumber?: string | null;
  dea?: string | null;
  email?: string | null;
  phone?: string | null;
  signatureDataUrl?: string | null;
  passwordHash?: string | null;
  clinicId?: number | null;
  clinic?: { id: number; name: string } | null;
};

type Props = {
  provider: EditableProvider;
};

export default function EditProviderForm({ provider }: Props) {
  const [form, setForm] = useState({
    ...provider,
    titleLine: provider.titleLine ?? '',
    licenseState: provider.licenseState ?? '',
    licenseNumber: provider.licenseNumber ?? '',
    dea: provider.dea ?? '',
    email: provider.email ?? '',
    phone: provider.phone ?? '',
    signatureDataUrl: provider.signatureDataUrl ?? '',
    clinicId: provider.clinicId ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [useSignaturePad, setUseSignaturePad] = useState(true);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);

  // Fetch available clinics
  useEffect(() => {
    const fetchClinics = async () => {
      try {
        const res = await apiFetch('/api/clinics/list');
        if (res.ok) {
          const data = await res.json();
          setClinics(Array.isArray(data) ? data : data.clinics || []);
        }
      } catch (err) {
        console.error('Failed to fetch clinics:', err);
      } finally {
        setLoadingClinics(false);
      }
    };
    fetchClinics();
  }, []);

  const update = (key: keyof typeof form, value: string | null) => {
    setForm((prev: any) => ({ ...prev, [key]: value ?? '' }));
  };

  const handleSignatureUpload = async (file: File) => {
    return new Promise<string | null>((resolve: any) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  const save = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const res = await apiFetch(`/api/providers/${provider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to update provider');
      }
      setMessage('Provider updated.');
    } catch (err: any) {
      // @ts-ignore

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setMessage(errorMessage ?? 'Failed to update provider');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">NPI</label>
          <input className="w-full border bg-gray-100 p-2" value={form.npi} disabled />
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">
            Professional Title
          </label>
          <input
            className="w-full border p-2"
            value={form.titleLine ?? ''}
            onChange={(e: any) => update('titleLine', e.target.value)}
          />
        </div>
        <input
          className="border p-2"
          placeholder="First Name"
          value={form.firstName}
          onChange={(e: any) => update('firstName', e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="Last Name"
          value={form.lastName}
          onChange={(e: any) => update('lastName', e.target.value)}
        />
        <select
          className="border p-2"
          value={form.licenseState ?? ''}
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
          className="border p-2"
          placeholder="License Number"
          value={form.licenseNumber ?? ''}
          onChange={(e: any) => update('licenseNumber', e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="DEA Number"
          value={form.dea ?? ''}
          onChange={(e: any) => update('dea', e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="Email"
          value={form.email ?? ''}
          onChange={(e: any) => update('email', e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="Phone"
          value={form.phone ?? ''}
          onChange={(e: any) => update('phone', e.target.value)}
        />

        {/* Clinic Assignment */}
        <div className="col-span-2">
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">
            <Building2 className="mr-1 inline h-3 w-3" />
            Assigned Clinic
          </label>
          <select
            className="w-full rounded border p-2"
            value={form.clinicId ?? ''}
            onChange={(e: any) => {
              const val = e.target.value;
              setForm((prev: any) => ({
                ...prev,
                clinicId: val ? parseInt(val, 10) : null,
              }));
            }}
            disabled={loadingClinics}
          >
            <option value="">-- No Clinic Assigned --</option>
            {clinics.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>
                {clinic.name} ({clinic.subdomain})
              </option>
            ))}
          </select>
          {provider.clinic && (
            <p className="mt-1 text-xs text-gray-500">
              Currently assigned to: <strong>{provider.clinic.name}</strong>
            </p>
          )}
        </div>

        <div className="col-span-2 space-y-2">
          <p className="text-sm font-medium text-gray-600">Provider Signature (upload or draw)</p>
          <div className="flex gap-3">
            <button
              type="button"
              className={`rounded border px-3 py-1 ${
                useSignaturePad ? 'bg-[#17aa7b] text-white' : ''
              }`}
              onClick={() => setUseSignaturePad(true)}
            >
              Draw
            </button>
            <button
              type="button"
              className={`rounded border px-3 py-1 ${
                !useSignaturePad ? 'bg-[#17aa7b] text-white' : ''
              }`}
              onClick={() => setUseSignaturePad(false)}
            >
              Upload
            </button>
          </div>
          {useSignaturePad ? (
            <SignaturePadCanvas
              onChange={(dataUrl: any) => update('signatureDataUrl', dataUrl)}
              initialSignature={form.signatureDataUrl ?? undefined}
            />
          ) : (
            <input
              type="file"
              accept="image/*"
              onChange={async (event: any) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const base64 = await handleSignatureUpload(file);
                update('signatureDataUrl', base64);
              }}
            />
          )}
        </div>
      </div>
      <div className="flex items-center space-x-3">
        <button type="button" onClick={save} disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        <ProviderPasswordSetup
          providerId={provider.id}
          providerName={`Dr. ${form.firstName} ${form.lastName}`}
          hasPassword={!!provider.passwordHash}
          onPasswordSet={() => setMessage('Password updated successfully')}
        />
      </div>
      {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}
    </div>
  );
}
