'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, GitMerge, Link2, X, Check, Loader2, Unlink, Truck } from 'lucide-react';
import EditPatientModal from './EditPatientModal';
import DeletePatientModal from './DeletePatientModal';
import MergePatientModal from './MergePatientModal';
import FedExLabelModal from './FedExLabelModal';
import SalesRepDropdown from './SalesRepDropdown';
import { apiFetch } from '@/lib/api/fetch';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';

interface AffiliateAttribution {
  affiliateId: number;
  refCode?: string;
  affiliateName?: string;
}

interface PatientSidebarProps {
  patient: {
    id: number;
    patientId?: string | null;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dob: string;
    gender: string;
    address1: string;
    address2?: string | null;
    city: string;
    state: string;
    zip: string;
  };
  currentTab: string;
  affiliateCode?: string | null;
  /** Structured attribution data from the patient record (attributionAffiliateId) */
  affiliateAttribution?: AffiliateAttribution;
  currentSalesRep?: {
    id: number;
    firstName: string;
    lastName: string;
  } | null;
  userRole?: string;
  /** Clinic info for FedEx label origin address */
  clinicInfo?: {
    name?: string;
    phone?: string;
    address?: { address1?: string; address2?: string; city?: string; state?: string; zip?: string } | null;
  };
  /** Show Labs tab (bloodwork). Default true. Set from clinic feature BLOODWORK_LABS so OT and all clinics can show it. */
  showLabsTab?: boolean;
  /** Base path for patient detail links. Use /provider/patients when rendered from provider route. */
  patientDetailBasePath?: string;
  /** When set, show an "Active membership" badge (e.g. from active subscription). */
  activeMembership?: { planName?: string } | null;
}

const navItems = [
  { id: 'profile', label: 'Profile', icon: 'Pp' },
  { id: 'notes', label: 'Notes', icon: 'Nt' },
  { id: 'lab', label: 'Labs', icon: 'Lb' },
  { id: 'intake', label: 'Intake', icon: 'Pi' },
  { id: 'prescriptions', label: 'Prescriptions', icon: 'Rx' },
  { id: 'soap-notes', label: 'Soap Notes', icon: 'Sn' },
  { id: 'progress', label: 'Progress', icon: 'Ps' },
  { id: 'photos', label: 'Photos', icon: 'Ph' },
  { id: 'billing', label: 'Invoices', icon: '$' },
  { id: 'chat', label: 'Chat', icon: 'Ch' },
  { id: 'documents', label: 'Documents', icon: 'Dc' },
  { id: 'appointments', label: 'Appointments', icon: 'Ap' },
];

// ---------------------------------------------------------------------------
// Types for ref code dropdown
// ---------------------------------------------------------------------------
interface RefCodeOption {
  id: number;
  code: string;
  affiliateId: number;
  affiliateName: string;
  affiliateStatus: string;
}

// ---------------------------------------------------------------------------
// Affiliate Attribution Section — shows existing banner or searchable dropdown
// ---------------------------------------------------------------------------
function AffiliateAttributionSection({
  patientId,
  affiliateAttribution,
  affiliateCode,
  isAdmin,
}: {
  patientId: number;
  affiliateAttribution?: AffiliateAttribution;
  affiliateCode?: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [options, setOptions] = useState<RefCodeOption[]>([]);
  const [selectedCode, setSelectedCode] = useState<RefCodeOption | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [showPasswordConfirm, setShowPasswordConfirm] = useState<'link' | 'remove' | null>(null);

  const hasAttribution = !!(affiliateAttribution || affiliateCode);

  // Fetch ref codes when form opens or search changes
  const fetchOptions = useCallback(async (query: string) => {
    setLoadingOptions(true);
    try {
      const params = query ? `?search=${encodeURIComponent(query)}` : '';
      const res = await apiFetch(`/api/admin/affiliates/ref-codes${params}`);
      if (res.ok) {
        const data = await res.json();
        setOptions(data.refCodes || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  // Load all codes when form opens
  const handleOpenForm = useCallback(() => {
    setShowForm(true);
    fetchOptions('');
  }, [fetchOptions]);

  // Debounced search
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    setSelectedCode(null);
    setShowDropdown(true);
    setError(null);
    const timer = setTimeout(() => fetchOptions(value), 200);
    return () => clearTimeout(timer);
  }, [fetchOptions]);

  const handleSelect = useCallback((option: RefCodeOption) => {
    setSelectedCode(option);
    setSearchQuery(`${option.code} — ${option.affiliateName}`);
    setShowDropdown(false);
    setError(null);
  }, []);

  // Request password before linking
  const requestLinkConfirm = useCallback(() => {
    if (!selectedCode) {
      setError('Select an affiliate code from the list');
      return;
    }
    setShowPasswordConfirm('link');
    setAdminPassword('');
    setError(null);
  }, [selectedCode]);

  // Request password before removing
  const requestRemoveConfirm = useCallback(() => {
    setShowPasswordConfirm('remove');
    setAdminPassword('');
    setError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const code = selectedCode?.code;
    if (!code) {
      setError('Select an affiliate code from the list');
      return;
    }
    if (!adminPassword.trim()) {
      setError('Admin password is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/affiliates/attribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, refCode: code, password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(true);
        setShowPasswordConfirm(null);
        setTimeout(() => {
          router.refresh();
          window.location.reload();
        }, 600);
      } else {
        setError(data.message || data.error || 'Attribution failed');
      }
    } catch {
      setError('Network error — try again');
    } finally {
      setLoading(false);
    }
  }, [patientId, selectedCode, adminPassword, router]);

  const handleRemove = useCallback(async () => {
    if (!adminPassword.trim()) {
      setError('Admin password is required');
      return;
    }
    setRemoving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/affiliates/attribute', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowPasswordConfirm(null);
        router.refresh();
        window.location.reload();
      } else {
        setError(data.message || data.error || 'Failed to remove');
      }
    } catch {
      setError('Network error — try again');
    } finally {
      setRemoving(false);
    }
  }, [patientId, adminPassword, router]);

  const handleClose = useCallback(() => {
    setShowForm(false);
    setError(null);
    setSearchQuery('');
    setSelectedCode(null);
    setShowDropdown(false);
    setOptions([]);
    setShowPasswordConfirm(null);
    setAdminPassword('');
  }, []);

  // --- Existing attribution: show banner ---
  if (hasAttribution) {
    const name = affiliateAttribution?.affiliateName;
    const code = affiliateAttribution?.refCode || affiliateCode;
    const affId = affiliateAttribution?.affiliateId;

    return (
      <div className="mb-3">
        {affId ? (
          <a href={`/admin/affiliates/${affId}`} className="block transition-opacity hover:opacity-80">
            <AffiliateTag name={name} code={code} />
          </a>
        ) : (
          <AffiliateTag name={name} code={code} />
        )}
        {isAdmin && !showPasswordConfirm && (
          <button
            onClick={requestRemoveConfirm}
            disabled={removing}
            className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg py-1 text-xs text-gray-400 transition-colors hover:text-red-500"
          >
            {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlink className="h-3 w-3" />}
            Remove attribution
          </button>
        )}
        {showPasswordConfirm === 'remove' && (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2.5">
            <p className="mb-1.5 text-xs font-medium text-red-700">Enter admin password to confirm</p>
            <div className="flex gap-1.5">
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => { setAdminPassword(e.target.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRemove(); }}
                placeholder="Password"
                className="min-w-0 flex-1 rounded border border-red-200 bg-white px-2 py-1 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                autoFocus
                disabled={removing}
              />
              <button
                onClick={handleRemove}
                disabled={removing || !adminPassword.trim()}
                className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Remove'}
              </button>
              <button
                onClick={() => { setShowPasswordConfirm(null); setAdminPassword(''); setError(null); }}
                className="rounded px-1.5 py-1 text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
        )}
      </div>
    );
  }

  // --- No attribution: show "Link" button or dropdown form ---
  if (!isAdmin) return null;

  if (!showForm) {
    return (
      <button
        onClick={handleOpenForm}
        className="mb-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50/50 px-3.5 py-2.5 text-sm font-medium text-violet-600 transition-all hover:border-violet-400 hover:bg-violet-50"
      >
        <Link2 className="h-4 w-4" />
        Link to Affiliate
      </button>
    );
  }

  // --- Searchable dropdown form ---
  return (
    <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-500">Link to Affiliate</p>
        <button onClick={handleClose} className="rounded p-0.5 text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search input + dropdown */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => { if (!selectedCode) setShowDropdown(true); }}
              placeholder="Search affiliate code or name..."
              className="w-full rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm text-violet-900 placeholder-violet-300 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
              autoFocus
              disabled={loading || success}
            />
            {loadingOptions && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
              </div>
            )}
          </div>
          <button
            onClick={requestLinkConfirm}
            disabled={loading || success || !selectedCode}
            className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
          >
            {success ? <Check className="h-3.5 w-3.5" /> : 'Link'}
          </button>
        </div>

        {/* Dropdown list */}
        {showDropdown && !selectedCode && options.length > 0 && (
          <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-violet-200 bg-white shadow-lg">
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleSelect(opt)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-violet-50"
              >
                <span className="font-semibold text-violet-700">{opt.code}</span>
                <span className="truncate text-gray-500">— {opt.affiliateName}</span>
                {opt.affiliateStatus !== 'ACTIVE' && (
                  <span className="ml-auto rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-700">
                    {opt.affiliateStatus}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* No results */}
        {showDropdown && !selectedCode && !loadingOptions && options.length === 0 && searchQuery && (
          <div className="absolute left-0 right-0 z-50 mt-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-400 shadow-lg">
            No affiliate codes found
          </div>
        )}
      </div>

      {/* Password confirmation for linking */}
      {showPasswordConfirm === 'link' && (
        <div className="mt-2 rounded-lg border border-violet-200 bg-white p-2.5">
          <p className="mb-1.5 text-xs font-medium text-violet-700">Enter admin password to confirm</p>
          <div className="flex gap-1.5">
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => { setAdminPassword(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder="Password"
              className="min-w-0 flex-1 rounded border border-violet-200 bg-white px-2 py-1 text-sm outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400"
              autoFocus
              disabled={loading}
            />
            <button
              onClick={handleSubmit}
              disabled={loading || !adminPassword.trim()}
              className="rounded bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirm'}
            </button>
            <button
              onClick={() => { setShowPasswordConfirm(null); setAdminPassword(''); setError(null); }}
              className="rounded px-1.5 py-1 text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      {success && <p className="mt-1.5 text-xs font-medium text-green-600">Attributed! Refreshing...</p>}
    </div>
  );
}

// Reusable affiliate tag display
function AffiliateTag({ name, code }: { name?: string; code?: string | null }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-500">Affiliate Referral</p>
        <p className="truncate text-sm font-bold text-violet-900">
          {name ? `${name}` : ''}{name && code ? ' ' : ''}{code ? <span className="font-semibold text-violet-600">({code})</span> : ''}
        </p>
      </div>
    </div>
  );
}

export default function PatientSidebar({
  patient,
  currentTab,
  affiliateCode,
  affiliateAttribution,
  currentSalesRep,
  userRole,
  clinicInfo,
  showLabsTab = true,
  patientDetailBasePath = '/patients',
  activeMembership = null,
}: PatientSidebarProps) {
  const router = useRouter();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showFedExModal, setShowFedExModal] = useState(false);

  const formatDob = (dob: string | null) => {
    if (!dob) return '—';
    const clean = dob.trim();
    if (!clean) return '—';
    // Check if the value looks like encrypted data
    if (clean.includes(':') && clean.length > 50) return '—';
    // Check for placeholder dates (1900-01-01, 1899-12-31, etc.)
    if (clean.startsWith('1900') || clean.startsWith('1899')) return '—';
    if (clean === '01/01/1900' || clean === '12/31/1899') return '—';
    // Parse and check year
    const dobDate = new Date(clean);
    const year = dobDate.getFullYear();
    if (isNaN(year) || year < 1920) return '—'; // Unrealistic DOB
    // Format output
    if (clean.includes('/')) return clean;
    const parts = clean.split('-');
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts;
      return `${mm.padStart(2, '0')}/${dd.padStart(2, '0')}/${yyyy}`;
    }
    return clean;
  };

  const calculateAge = (dob: string) => {
    if (!dob) return '';
    // Check if the value looks like encrypted data
    if (dob.includes(':') && dob.length > 50) return '';
    // Check for placeholder dates
    if (dob.startsWith('1900') || dob.startsWith('1899')) return '';
    const birthDate = new Date(dob);
    // Check if date is valid
    if (isNaN(birthDate.getTime())) return '';
    const year = birthDate.getFullYear();
    if (year < 1920) return ''; // Unrealistic DOB
    const today = new Date();
    let age = today.getFullYear() - year;
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const formatGender = (g: string | null | undefined) => {
    if (!g) return 'Not set';
    const gl = g.toLowerCase().trim();
    if (gl === 'f' || gl === 'female' || gl === 'woman') return 'Female';
    if (gl === 'm' || gl === 'male' || gl === 'man') return 'Male';
    return g;
  };

  // Helper to detect encrypted data (base64:base64:base64 format)
  const isEncryptedData = (value: string | null | undefined): boolean => {
    if (!value || typeof value !== 'string') return false;
    const parts = value.split(':');
    if (parts.length !== 3) return false;
    return parts.every((part) => /^[A-Za-z0-9+/]+=*$/.test(part) && part.length > 10);
  };

  const formatPhone = (phone: string) => {
    if (!phone) return '—';
    // Placeholder stored when intake had no phone
    const digits = phone.replace(/\D/g, '');
    if (digits === '0000000000' || digits === '0') return '—';
    if (isEncryptedData(phone)) return '(encrypted)';
    if (digits.length === 10) {
      return `+1(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1(${digits.slice(1, 4)})${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return phone;
  };

  const formatEmail = (email: string | null | undefined): string => {
    if (!email) return '-';
    if (isEncryptedData(email)) return '(encrypted)';
    return email;
  };

  // Format address with proper title case (first letter of each word capitalized)
  const toTitleCase = (str: string | null | undefined): string => {
    if (!str) return '';
    if (isEncryptedData(str)) return '(encrypted)';
    return str
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Format city/state/zip - keeps state abbreviation uppercase; label zip when city/state missing
  const formatCityStateZip = (city: string, state: string, zip: string): string => {
    const formattedCity = toTitleCase(city);
    const formattedState = state ? state.toUpperCase() : '';
    const hasCityOrState = !!(formattedCity || formattedState);
    if (hasCityOrState) {
      const parts = [formattedCity, `${formattedState} ${zip}`.trim()].filter(Boolean);
      return parts.join(', ');
    }
    if (zip && !isEncryptedData(zip)) return `ZIP: ${zip}`;
    return zip || '';
  };

  const handleSavePatient = async (data: any) => {
    const response = await apiFetch(`/api/patients/${patient.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || err.message || 'Failed to update patient');
    }

    // Refresh the page to show updated data
    router.refresh();
  };

  const handleDeletePatient = async () => {
    const response = await apiFetch(`/api/patients/${patient.id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete patient');
    }

    // Redirect to the correct patients list (provider vs admin)
    const listPath = patientDetailBasePath?.startsWith('/provider') ? '/provider/patients' : '/admin/patients';
    router.push(listPath);
  };

  const age = calculateAge(patient.dob);
  const genderLabel = formatGender(patient.gender);
  const formattedAddress1 = toTitleCase(patient.address1);
  const formattedAddress2 = toTitleCase(patient.address2);
  const cityStateZip = formatCityStateZip(patient.city, patient.state, patient.zip);
  const fullAddress = [patient.address1, patient.address2, patient.city, patient.state, patient.zip]
    .filter(Boolean)
    .join(' ');
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

  return (
    <>
      <div className="sticky top-6 h-fit w-72 flex-shrink-0 rounded-2xl border border-gray-200 bg-white p-6">
        {/* Avatar and Edit */}
        <div className="mb-4 flex items-start justify-between">
          <div
            className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))' }}
          >
            <svg className="h-16 w-16" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M168.87 474.18c117.83 47.3 249.86-8.68 299.06-123.14 49.63-115.44-1.6-248.95-115.65-301.7-113.17-52.33-248.52-5.4-304.63 107.98-21.33 43.11-28.68 92.39-20.36 140.67.9 5.23-2.3 9.11-6.51 9.86s-8.68-1.48-9.58-6.51c-13.29-73.89 8.82-149.3 57.39-204.81 96.07-109.8 264.09-113.5 364.9-9.46 93.33 96.31 93.6 250.56-2.16 346.99-55.72 56.12-134.34 83.01-215.35 70.33-71.32-11.16-137.76-55.71-175.24-121.32-2.19-3.84-1.15-8.94 2.91-11.23 3.7-2.09 8.72-1.26 11.37 3.28 25.94 44.47 65.71 79.73 113.85 99.05Z"
                style={{ fill: '#000000' }}
              />
              <path
                d="M345.18 382.76c-.05-50.13-40.1-89.72-88.82-90.28-48.94-.56-90.13 38.67-90.72 88.74-.06 5.17-3.07 8.89-7.96 9.13-3.94.19-8.61-2.81-8.6-8.03.05-43.71 26.14-82.36 67.77-99.35-45.83-25.2-57.38-84.24-25-124.12 32.5-40.03 93.53-40.37 126.42-.73 33.01 39.78 21.98 99.97-24.45 124.76 41.17 16.86 67.29 54.91 67.82 98.26.06 4.94-2.54 8.34-7.04 9.12-3.35.58-9.41-1.72-9.42-7.5M223.5 266.86c29.21 18.67 69.6 7.25 87.54-22.07s9.59-68.68-19.23-88.19c-30.69-20.77-72.46-12.36-92.29 19.83-18.9 30.68-8.8 74.07 23.97 90.43Z"
                style={{ fill: '#000000' }}
              />
              <path
                d="M291.82 156.6c28.81 19.5 37.7 58 19.23 88.19s-58.33 40.74-87.54 22.07c-.16-2.14-1.7-3.59-3.33-5.52-19.28-22.78-20.55-55.38-3.63-79.61 16.36-23.43 46.57-33.84 74.43-24.48.75.25 1.08.07.85-.65Z"
                style={{ fill: 'var(--brand-accent, #f6f2a2)' }}
              />
            </svg>
          </div>
          <button
            onClick={() => setShowEditModal(true)}
            className="text-sm font-medium hover:underline"
            style={{ color: 'var(--brand-primary, #4fa77e)' }}
          >
            Edit
          </button>
        </div>

        {/* Name and basic info */}
        <h2 className="text-xl font-bold text-gray-900">
          {patient.firstName} {patient.lastName}
        </h2>
        {activeMembership && (
          <span
            className="mb-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: 'var(--brand-primary-light, #e8f5e9)',
              color: 'var(--brand-primary, #4fa77e)',
            }}
          >
            Active membership
            {activeMembership.planName ? ` · ${activeMembership.planName}` : ''}
          </span>
        )}
        <p className="mb-3 text-sm text-gray-500">
          {age ? `${age}, ` : ''}
          {genderLabel}
        </p>

        {/* Contact info */}
        <div className="mb-3 space-y-1 text-sm text-gray-600">
          <p>
            <span className="text-gray-500">DOB:</span> {formatDob(patient.dob)}
          </p>
          <p>{formatEmail(patient.email)}</p>
          <p>{formatPhone(patient.phone)}</p>
        </div>

        {/* ID */}
        <p className="mb-3 text-sm font-medium text-gray-900">
          ID #{formatPatientDisplayId(patient.patientId, patient.id)}
        </p>

        {/* Affiliate Attribution — banner or manual link button */}
        <AffiliateAttributionSection
          patientId={patient.id}
          affiliateAttribution={affiliateAttribution}
          affiliateCode={affiliateCode}
          isAdmin={!!userRole && ['super_admin', 'admin'].includes(userRole.toLowerCase())}
        />

        {/* Address */}
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-4 block text-sm text-gray-600 transition-colors"
          style={{ '--hover-color': 'var(--brand-primary, #4fa77e)' } as React.CSSProperties}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#4b5563')}
        >
          {formattedAddress1 && <p>{formattedAddress1}</p>}
          {formattedAddress2 && <p>{formattedAddress2}</p>}
          {cityStateZip && <p>{cityStateZip}</p>}
        </a>

        {/* Sales Rep Assignment - Only shown for clinics that use sales reps */}
        {userRole && (
          <div className="mb-6">
            <SalesRepDropdown
              patientId={patient.id}
              currentSalesRep={currentSalesRep}
              userRole={userRole}
            />
          </div>
        )}

        {/* Navigation - use native <a> tags for reliability (router.push/Link had issues with searchParams) */}
        <nav className="mb-6 space-y-1">
          {(showLabsTab === false ? navItems.filter((i) => i.id !== 'lab') : navItems).map((item) => {
            const isActive = currentTab === item.id;
            const href = `${patientDetailBasePath}/${patient.id}?tab=${item.id}`;
            return (
              <a
                key={item.id}
                href={href}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                  isActive ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: isActive ? 'var(--brand-primary, #4fa77e)' : '#9ca3af',
                    color: isActive ? 'var(--brand-primary-text, #ffffff)' : '#ffffff',
                  }}
                >
                  {item.icon}
                </div>
                <span
                  className={`text-sm ${isActive ? 'font-medium text-gray-900' : 'text-gray-600'}`}
                >
                  {item.label}
                </span>
              </a>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="space-y-1 border-t pt-4">
          {/* FedEx Label — admin only */}
          {userRole &&
            ['super_admin', 'admin'].includes(userRole.toLowerCase()) && (
              <button
                onClick={() => setShowFedExModal(true)}
                disabled={!patient.address1 || !patient.city || !patient.state || !patient.zip}
                title={
                  !patient.address1 || !patient.city || !patient.state || !patient.zip
                    ? 'Patient address is required to print a FedEx label'
                    : 'Print a FedEx shipping label for this patient'
                }
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  !patient.address1 || !patient.city || !patient.state || !patient.zip
                    ? 'cursor-not-allowed text-gray-400'
                    : 'text-[#4D148C] hover:bg-purple-50'
                }`}
              >
                <Truck className="h-4 w-4" />
                Print FedEx Label
              </button>
            )}
          <button
            onClick={() => setShowMergeModal(true)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            <GitMerge className="h-4 w-4" />
            Merge with another patient
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete Patient
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <EditPatientModal
          patient={patient}
          onClose={() => setShowEditModal(false)}
          onSave={handleSavePatient}
        />
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <DeletePatientModal
          patient={patient}
          onClose={() => setShowDeleteModal(false)}
          onDelete={handleDeletePatient}
        />
      )}

      {/* Merge Modal */}
      {showMergeModal && (
        <MergePatientModal
          sourcePatient={{
            id: patient.id,
            patientId: patient.patientId || null,
            firstName: patient.firstName,
            lastName: patient.lastName,
            email: patient.email,
            phone: patient.phone,
            dob: patient.dob,
            createdAt: new Date().toISOString(), // Will be fetched in preview
          }}
          onClose={() => setShowMergeModal(false)}
          onMergeComplete={(mergedPatientId) => {
            setShowMergeModal(false);
            window.location.href = `/patients/${mergedPatientId}`;
          }}
        />
      )}

      {/* FedEx Label Modal */}
      {showFedExModal && (
        <FedExLabelModal
          patientId={patient.id}
          clinicAddress={
            clinicInfo?.address
              ? {
                  address1: clinicInfo.address.address1,
                  address2: clinicInfo.address.address2,
                  city: clinicInfo.address.city,
                  state: clinicInfo.address.state,
                  zip: clinicInfo.address.zip,
                }
              : null
          }
          clinicName={clinicInfo?.name}
          clinicPhone={clinicInfo?.phone}
          patientName={`${patient.firstName} ${patient.lastName}`}
          patientPhone={patient.phone}
          patientAddress={{
            address1: patient.address1,
            address2: patient.address2,
            city: patient.city,
            state: patient.state,
            zip: patient.zip,
          }}
          onClose={() => setShowFedExModal(false)}
        />
      )}
    </>
  );
}
