"use client";

import { AddressInput, AddressData } from "@/components/AddressAutocomplete";
import { formatDobInput } from "@/lib/format";
import { US_STATE_OPTIONS } from "@/lib/usStates";
import Link from "next/link";
import { useEffect, useState } from "react";
import { logger } from '@/lib/logger';
import { Provider, Order, Clinic } from '@/types/models';

type Patient = {
  id: number;
  patientId?: string | null;
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
  createdAt: string;
  notes?: string | null;
  tags?: string[] | null;
  clinicId?: number | null;
  clinicName?: string | null;
};

const GENDER_OPTIONS = [
  { value: "m", label: "Male" },
  { value: "f", label: "Female" },
];

const getGenderLabel = (value: string) =>
  GENDER_OPTIONS.find((opt: any) => opt.value === value)?.label ?? "Not set";

const initialForm = {
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
  notes: "",
  tagsInput: "",
  clinicId: "" as string,
};

const parseTagsInput = (input: string): string[] =>
  input
    .split(/[\s,]+/)
    .map((tag: any) => tag.replace(/^#/, "").trim().toLowerCase())
    .filter(Boolean);

const toTagArray = (tags?: string[] | null) =>
  Array.isArray(tags)
    ? tags.filter((tag: any) => typeof tag === "string").map((tag: any) => tag.replace(/^#/, ""))
    : [];

const formatPatientAddress = (patient: Patient) => {
  const base = [patient.address1, patient.address2].filter(Boolean).join(", ");
  const cityLine = [patient.city, patient.state, patient.zip].filter(Boolean).join(" ");
  if (!patient.city) {
    return base;
  }
  const normalizedBase = base.toLowerCase();
  if (
    normalizedBase.includes(patient.city.toLowerCase()) &&
    normalizedBase.includes(patient.state.toLowerCase())
  ) {
    return base;
  }
  return [base, cityLine.trim()].filter(Boolean).join(", ");
};

const formatDob = (isoDob: string) => {
  if (!isoDob) return "—";
  const clean = isoDob.trim();
  // Already formatted (contains /), return as-is
  if (clean.includes("/")) return clean;
  const parts = clean.split("-");
  if (parts.length === 3) {
    const [yyyy, mm, dd] = parts;
    if (yyyy && mm && dd) {
      return `${mm.padStart(2, "0")}/${dd.padStart(2, "0")}/${yyyy}`;
    }
  }
  return clean;
};

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [addressLocked, setAddressLocked] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userClinicId, setUserClinicId] = useState<number | null>(null);

  const updateForm = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const fetchPatients = async () => {
    try {
      setLoading(true);
      // Get token from localStorage or cookies (check all possible token storage locations)
      const token = localStorage.getItem('auth-token') ||
                   localStorage.getItem('super_admin-token') ||
                   localStorage.getItem('admin-token') ||
                   localStorage.getItem('provider-token') ||
                   localStorage.getItem('SUPER_ADMIN-token') ||
                   sessionStorage.getItem('auth-token');

      const res = await fetch("/api/patients", {
        headers: token ? {
          'Authorization': `Bearer ${token}`
        } : {}
      });

      if (!res.ok) {
        if (res.status === 401) {
          setError("Please log in to view patients");
          // Optionally redirect to login
          // router.push('/login');
          return;
        }
        throw new Error('Failed to fetch patients');
      }

      const data = await res.json();
      const patientData = data.patients ?? [];
      setPatients(patientData);
      setFilteredPatients(patientData);
    } catch (err: any) {
    // @ts-ignore

      logger.error(err);
      setError("Failed to load patients");
    } finally {
      setLoading(false);
    }
  };

  const fetchClinics = async () => {
    try {
      const token = localStorage.getItem('auth-token') ||
                   localStorage.getItem('super_admin-token') ||
                   localStorage.getItem('admin-token');
      
      const headers: HeadersInit = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      // Try multiple endpoints in order of preference
      const endpoints = [
        "/api/user/clinics",     // User's assigned clinics
        "/api/admin/clinics",    // Admin endpoint (returns array)
        "/api/clinic/list",      // Public clinic list (returns array)
      ];
      
      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, { headers });
          
          if (res.ok) {
            const data = await res.json();
            // Handle different response formats
            const clinicList = data.clinics || (Array.isArray(data) ? data : []);
            if (clinicList.length > 0) {
              setClinics(clinicList);
              return;
            }
          }
        } catch {
          // Continue to next endpoint
        }
      }
      
      // If all endpoints fail or return empty, set empty array
      setClinics([]);
    } catch (err) {
      logger.error("Error fetching clinics:", err);
      setClinics([]);
    }
  };

  useEffect(() => {
    // Get user info from localStorage
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setUserRole(parsedUser.role?.toLowerCase());
        setUserClinicId(parsedUser.clinicId || null);
      } catch (e) {
        logger.error("Error parsing user data:", e);
      }
    }
    fetchPatients();
    fetchClinics();
  }, []);

  useEffect(() => {
    if (!searchQuery) {
      setFilteredPatients(patients);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = patients.filter((patient: any) => {
        const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
        const email = patient.email.toLowerCase();
        const phone = patient.phone.toLowerCase();
        const id = patient.patientId?.toLowerCase() || "";
        const tags = toTagArray(patient.tags).join(" ").toLowerCase();
        const address = formatPatientAddress(patient).toLowerCase();

        return (
          fullName.includes(query) ||
          email.includes(query) ||
          phone.includes(query) ||
          id.includes(query) ||
          tags.includes(query) ||
          address.includes(query)
        );
      });
      setFilteredPatients(filtered);
    }
  }, [searchQuery, patients]);

  const submit = async () => {
    try {
      setError(null);
      if (!["m", "f"].includes(form.gender)) {
        setError("Please select patient gender.");
        return;
      }
      if (!form.state) {
        setError("Please select a state.");
        return;
      }
      // Validate clinic selection for super admin
      if (userRole === 'super_admin' && !form.clinicId) {
        setError("Please select a clinic for this patient.");
        return;
      }
      const { tagsInput, clinicId, ...rest } = form as typeof initialForm;
      const payload = {
        ...rest,
        address2: rest.address2 || undefined,
        notes: rest.notes?.trim() || undefined,
        tags: parseTagsInput(tagsInput),
        clinicId: clinicId ? parseInt(clinicId) : (userClinicId || undefined),
      };

      // Get token from localStorage or cookies (check all possible token storage locations)
      const token = localStorage.getItem('auth-token') ||
                   localStorage.getItem('super_admin-token') ||
                   localStorage.getItem('admin-token') ||
                   localStorage.getItem('provider-token') ||
                   localStorage.getItem('SUPER_ADMIN-token') ||
                   sessionStorage.getItem('auth-token');

      const res = await fetch("/api/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          setError("Invalid or expired token. Please log in again.");
          // Optionally redirect to login
          // router.push('/login');
          return;
        }
        throw new Error(data.error ?? "Failed to save patient");
      }

      setForm(initialForm);
      setAddressLocked(false);
      fetchPatients();
    } catch (err: any) {
    // @ts-ignore

    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    setError(errorMessage ?? "Failed to save patient");
    }
  };

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-3xl font-bold">Patients</h1>
      <section className="border rounded p-4 space-y-3 bg-white shadow">
        <h2 className="text-xl font-semibold">Add Patient</h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            className="border p-2"
            placeholder="First Name"
            value={form.firstName}
            onChange={(e: any) => updateForm("firstName", e.target.value)}
          />
          <input
            className="border p-2"
            placeholder="Last Name"
            value={form.lastName}
            onChange={(e: any) => updateForm("lastName", e.target.value)}
          />
          <input
            className="border p-2"
            placeholder="DOB (MM/DD/YYYY)"
            value={form.dob}
            onChange={(e: any) => updateForm("dob", formatDobInput(e.target.value))}
          />
          <select
            className="border p-2 text-gray-700"
            value={form.gender}
            onChange={(e: any) => updateForm("gender", e.target.value)}
          >
            <option value="">Gender</option>
            {GENDER_OPTIONS.map((opt: any) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            className="border p-2"
            placeholder="Phone"
            value={form.phone}
            onChange={(e: any) => updateForm("phone", e.target.value)}
          />
          <input
            className="border p-2"
            placeholder="Email"
            value={form.email}
            onChange={(e: any) => updateForm("email", e.target.value)}
          />
        <div className="col-span-2">
          <AddressInput
            value={form.address1}
            onChange={(value: string, parsed?: AddressData) => {
              if (parsed) {
                setAddressLocked(true);
                updateForm("address1", parsed.address1);
                updateForm("city", parsed.city);
                updateForm("state", parsed.state);
                updateForm("zip", parsed.zip);
              } else {
                setAddressLocked(false);
                updateForm("address1", value);
              }
            }}
            placeholder="Address Line 1"
            className="w-full"
          />
        </div>
        <input
          className="border p-2 col-span-2"
          placeholder="Apartment / Suite"
          value={form.address2}
          onChange={(e: any) => updateForm("address2", e.target.value)}
        />
          <input
          className={`border p-2 ${addressLocked ? "bg-gray-100" : ""}`}
            placeholder="City"
            value={form.city}
          readOnly={addressLocked}
          onChange={(e: any) => {
            setAddressLocked(false);
            updateForm("city", e.target.value);
          }}
          />
          <select
          className={`border p-2 ${addressLocked ? "bg-gray-100" : ""}`}
            value={form.state}
          disabled={addressLocked}
          onChange={(e: any) => {
            setAddressLocked(false);
            updateForm("state", e.target.value);
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
          className={`border p-2 ${addressLocked ? "bg-gray-100" : ""}`}
            placeholder="ZIP"
            value={form.zip}
          readOnly={addressLocked}
          onChange={(e: any) => {
            setAddressLocked(false);
            updateForm("zip", e.target.value);
          }}
          />
        {addressLocked && (
          <p className="text-xs text-gray-500 col-span-2">
            City, state, and ZIP auto-filled from Google. Edit address line to change.
          </p>
        )}
          <textarea
            className="border p-2 col-span-2"
            placeholder="Patient notes (optional)"
            rows={3}
            value={form.notes}
            onChange={(e: any) => updateForm("notes", e.target.value)}
          />
          <div className="col-span-2">
            <input
              className="border p-2 w-full"
              placeholder="Hashtags (e.g. #weightloss #hormone)"
              value={form.tagsInput}
              onChange={(e: any) => updateForm("tagsInput", e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Separate tags with spaces or commas. We'll store without the # symbol.
            </p>
          </div>
          {/* Clinic selection for super admin */}
          {userRole === 'super_admin' && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assign to Clinic *
              </label>
              <select
                className="border p-2 w-full"
                value={form.clinicId}
                onChange={(e: any) => updateForm("clinicId", e.target.value)}
              >
                <option value="">Select a clinic...</option>
                {clinics.map((clinic) => (
                  <option key={clinic.id} value={clinic.id}>
                    {clinic.name} ({clinic.subdomain})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button onClick={submit} className="btn-primary">
          Save Patient
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      <section className="border rounded p-4 bg-white shadow">
        <h2 className="text-xl font-semibold mb-3">Saved Patients</h2>

        {/* Search Bar */}
        {patients.length > 0 && (
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search patients by name, email, phone, ID, tags, or address..."
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e] focus:border-transparent"
            />
          </div>
        )}

        {loading ? (
          <p>Loading…</p>
        ) : patients.length === 0 ? (
          <p>No patients yet.</p>
        ) : filteredPatients.length === 0 ? (
          <p className="text-gray-500">No patients found matching "{searchQuery}"</p>
        ) : (
          <table className="w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1 text-left">Name</th>
                <th className="border px-2 py-1 text-left">DOB</th>
                <th className="border px-2 py-1 text-left">Contact</th>
                <th className="border px-2 py-1 text-left">Address</th>
                <th className="border px-2 py-1 text-left">Tags</th>
                {userRole === 'super_admin' && (
                  <th className="border px-2 py-1 text-left">Clinic</th>
                )}
                <th className="border px-2 py-1 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.map((patient: any) => (
                <tr key={patient.id} className="hover:bg-gray-50">
                  <td className="border px-2 py-1">
                    <div className="font-medium">
                      {patient.firstName} {patient.lastName}
                    </div>
                    <div className="text-xs text-gray-500">
                      ID #{patient.patientId ?? "—"}
                    </div>
                  </td>
                  <td className="border px-2 py-1">
                    {formatDob(patient.dob)} ({getGenderLabel(patient.gender)})
                  </td>
                  <td className="border px-2 py-1">
                    <div>{patient.phone}</div>
                    <div className="text-xs text-gray-500">{patient.email}</div>
                  </td>
                  <td className="border px-2 py-1">
                    {formatPatientAddress(patient)}
                  </td>
                  <td className="border px-2 py-1">
                    <div className="flex flex-wrap gap-1">
                      {toTagArray(patient.tags).length > 0 ? (
                        toTagArray(patient.tags).map((tag: any) => (
                          <span
                            key={tag}
                            className="text-xs bg-gray-100 border px-2 py-0.5 rounded-full"
                          >
                            #{tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                  {userRole === 'super_admin' && (
                    <td className="border px-2 py-1">
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        {patient.clinicName || 'Not assigned'}
                      </span>
                    </td>
                  )}
                  <td className="border px-2 py-1 text-right">
                    <Link
                      href={`/patients/${patient.id}`}
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

