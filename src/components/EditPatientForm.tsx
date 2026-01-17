"use client";

import { AddressInput, AddressData } from "@/components/AddressAutocomplete";
import { formatDobInput } from "@/lib/format";
import { US_STATE_OPTIONS } from "@/lib/usStates";
import { ChangeEvent, useState } from "react";
import { Patient, Provider, Order } from '@/types/models';

const GENDER_OPTIONS = [
  { value: "m", label: "Male" },
  { value: "f", label: "Female" },
];

type EditablePatient = {
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
  notes?: string | null;
  tags?: string[] | null;
};

type PatientDocument = {
  id: number;
  filename: string;
  mimeType: string;
  createdAt: string;
  externalUrl?: string | null;
  category?: string | null;
  sourceSubmissionId?: string | null;
};

type Props = {
  patient: EditablePatient;
  documents: PatientDocument[];
};

const parseTags = (input: string): string[] =>
  input
    .split(/[\s,]+/)
    .map((tag: any) => tag.replace(/^#/, "").trim().toLowerCase())
    .filter(Boolean);

const formatTagsInput = (tags?: string[] | null) =>
  Array.isArray(tags) && tags.length > 0
    ? tags.map((tag: any) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ")
    : "";

export default function EditPatientForm({ patient, documents }: Props) {
  const [form, setForm] = useState({
    ...patient,
    gender: patient.gender === "m" || patient.gender === "f" ? patient.gender : "",
    address2: patient.address2 ?? "",
    notes: patient.notes ?? "",
  });
  const [tagsInput, setTagsInput] = useState(formatTagsInput(patient.tags));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [docs, setDocs] = useState<PatientDocument[]>(documents);
  const [uploading, setUploading] = useState(false);

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    if (!["m", "f"].includes(form.gender)) {
      setMessage("Select patient gender before saving.");
      return;
    }
    if (!form.state) {
      setMessage("Select a state before saving.");
      return;
    }
    try {
      setSaving(true);
      setMessage(null);
      const payload = {
        ...form,
        address2: form.address2 || undefined,
        notes: form.notes?.trim() || undefined,
        tags: parseTags(tagsInput),
      };
      // Get auth token
      const token = localStorage.getItem('auth-token') ||
                    localStorage.getItem('super_admin-token') ||
                    localStorage.getItem('admin-token') ||
                    localStorage.getItem('provider-token');
      const authHeaders: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      const res = await fetch(`/api/patients/${patient.id}`, {
        method: "PATCH",
        credentials: 'include',
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update patient");
      }
      setMessage("Patient updated.");
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    setMessage(errorMessage ?? "Failed to update patient");
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      // Get auth token
      const token = localStorage.getItem('auth-token') ||
                    localStorage.getItem('super_admin-token') ||
                    localStorage.getItem('admin-token') ||
                    localStorage.getItem('provider-token');
      const authHeaders: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      const res = await fetch(`/api/patients/${patient.id}/documents`, {
        method: "POST",
        credentials: 'include',
        headers: authHeaders,
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to upload document");
      }
      setDocs((prev: any) => [data.document, ...prev]);
      event.target.value = "";
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    setMessage(errorMessage ?? "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
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
        <input
          className="border p-2"
          placeholder="DOB MM/DD/YYYY"
          value={form.dob}
          onChange={(e: any) => update("dob", formatDobInput(e.target.value))}
        />
        <select
          className="border p-2"
          value={form.gender}
          onChange={(e: any) => update("gender", e.target.value)}
        >
          <option value="">Gender</option>
          {GENDER_OPTIONS.map((option: any) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          className="border p-2"
          placeholder="Phone"
          value={form.phone}
          onChange={(e: any) => update("phone", e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="Email"
          value={form.email}
          onChange={(e: any) => update("email", e.target.value)}
        />
        <div className="col-span-2">
          <AddressInput
            value={form.address1}
            onChange={(value: string, parsed?: AddressData) => {
              if (parsed) {
                update("address1", parsed.address1);
                update("city", parsed.city);
                update("state", parsed.state);
                update("zip", parsed.zip);
              } else {
                update("address1", value);
              }
            }}
            placeholder="Address Line 1"
            className="w-full"
          />
        </div>
        <input
          className="border p-2 col-span-2"
          placeholder="Apartment / Suite"
          value={form.address2 ?? ""}
          onChange={(e: any) => update("address2", e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="City"
          value={form.city}
          onChange={(e: any) => update("city", e.target.value)}
        />
        <select
          className="border p-2"
          value={form.state}
          onChange={(e: any) => update("state", e.target.value)}
        >
          <option value="">State</option>
          {US_STATE_OPTIONS.map((state: any) => (
            <option key={state.value} value={state.value}>
              {state.label}
            </option>
          ))}
        </select>
        <input
          className="border p-2"
          placeholder="ZIP"
          value={form.zip}
          onChange={(e: any) => update("zip", e.target.value)}
        />
        <textarea
          className="border p-2 col-span-2"
          rows={4}
          placeholder="Patient notes (optional)"
          value={form.notes}
          onChange={(e: any) => update("notes", e.target.value)}
        />
        <div className="col-span-2">
          <input
            className="border p-2 w-full"
            placeholder="Hashtags (e.g. #weightloss #peptide)"
            value={tagsInput}
            onChange={(e: any) => setTagsInput(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">
            Separate tags with spaces or commas.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="btn-primary"
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
      {message && <p className="text-sm text-gray-600">{message}</p>}

      <div className="border rounded-lg p-4 mt-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Intake Documents</h4>
          <label className="text-sm text-[#4fa77e] cursor-pointer">
            <input
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={handleUpload}
            />
            {uploading ? "Uploading…" : "Upload file"}
          </label>
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-gray-500 mt-2">No documents uploaded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {docs.map((doc: any) => (
              <li
                key={doc.id}
                className="flex items-center justify-between rounded border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{doc.filename}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(doc.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">
                    {doc.category ?? "OTHER"}
                    {doc.sourceSubmissionId ? ` • ${doc.sourceSubmissionId}` : ""}
                  </p>
                </div>
                <a
                  href={`/api/patients/${patient.id}/documents/${doc.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-[#4fa77e] underline"
                >
                  View
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

