"use client";

import SignaturePadCanvas from "@/components/SignaturePadCanvas";
import { US_STATE_OPTIONS } from "@/lib/usStates";
import { useState } from "react";
import ProviderPasswordSetup from "./ProviderPasswordSetup";
import { Patient, Provider, Order } from '@/types/models';

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
};

type Props = {
  provider: EditableProvider;
};

export default function EditProviderForm({ provider }: Props) {
  const [form, setForm] = useState({
    ...provider,
    titleLine: provider.titleLine ?? "",
    licenseState: provider.licenseState ?? "",
    licenseNumber: provider.licenseNumber ?? "",
    dea: provider.dea ?? "",
    email: provider.email ?? "",
    phone: provider.phone ?? "",
    signatureDataUrl: provider.signatureDataUrl ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [useSignaturePad, setUseSignaturePad] = useState(true);

  const update = (key: keyof typeof form, value: string | null) => {
    setForm((prev: any) => ({ ...prev, [key]: value ?? "" }));
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
      const res = await fetch(`/api/providers/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update provider");
      }
      setMessage("Provider updated.");
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    setMessage(errorMessage ?? "Failed to update provider");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
            NPI
          </label>
          <input className="border p-2 w-full bg-gray-100" value={form.npi} disabled />
        </div>
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">
            Professional Title
          </label>
          <input
            className="border p-2 w-full"
            value={form.titleLine ?? ""}
            onChange={(e: any) => update("titleLine", e.target.value)}
          />
        </div>
        <input
          className="border p-2"
          placeholder="First Name"
          value={form.firstName}
          onChange={(e: any) => update("firstName", e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="Last Name"
          value={form.lastName}
          onChange={(e: any) => update("lastName", e.target.value)}
        />
        <select
          className="border p-2"
          value={form.licenseState ?? ""}
          onChange={(e: any) => update("licenseState", e.target.value)}
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
          value={form.licenseNumber ?? ""}
          onChange={(e: any) => update("licenseNumber", e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="DEA Number"
          value={form.dea ?? ""}
          onChange={(e: any) => update("dea", e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="Email"
          value={form.email ?? ""}
          onChange={(e: any) => update("email", e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="Phone"
          value={form.phone ?? ""}
          onChange={(e: any) => update("phone", e.target.value)}
        />
        <div className="col-span-2 space-y-2">
          <p className="text-sm font-medium text-gray-600">
            Provider Signature (upload or draw)
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              className={`px-3 py-1 rounded border ${
                useSignaturePad ? "bg-[#17aa7b] text-white" : ""
              }`}
              onClick={() => setUseSignaturePad(true)}
            >
              Draw
            </button>
            <button
              type="button"
              className={`px-3 py-1 rounded border ${
                !useSignaturePad ? "bg-[#17aa7b] text-white" : ""
              }`}
              onClick={() => setUseSignaturePad(false)}
            >
              Upload
            </button>
          </div>
          {useSignaturePad ? (
            <SignaturePadCanvas
              onChange={(dataUrl: any) => update("signatureDataUrl", dataUrl)}
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
                update("signatureDataUrl", base64);
              }}
            />
          )}
        </div>
      </div>
      <div className="flex items-center space-x-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        
        <ProviderPasswordSetup
          providerId={provider.id}
          providerName={`Dr. ${form.firstName} ${form.lastName}`}
          hasPassword={!!provider.passwordHash}
          onPasswordSet={() => setMessage('Password updated successfully')}
        />
      </div>
      {message && <p className="text-sm text-gray-600 mt-2">{message}</p>}
    </div>
  );
}

