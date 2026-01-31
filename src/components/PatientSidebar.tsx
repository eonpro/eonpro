'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2, GitMerge } from 'lucide-react';
import EditPatientModal from './EditPatientModal';
import DeletePatientModal from './DeletePatientModal';
import MergePatientModal from './MergePatientModal';

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
}

const navItems = [
  { id: 'profile', label: 'Profile', icon: 'Pp' },
  { id: 'intake', label: 'Intake', icon: 'Pi' },
  { id: 'prescriptions', label: 'Prescriptions', icon: 'Rx' },
  { id: 'soap-notes', label: 'Soap Notes', icon: 'Sn' },
  { id: 'progress', label: 'Progress', icon: 'Ps' },
  { id: 'billing', label: 'Invoices', icon: '$' },
  { id: 'chat', label: 'Chat', icon: 'Ch' },
  { id: 'documents', label: 'Documents', icon: 'Dc' },
  { id: 'appointments', label: 'Appointments', icon: 'Ap' },
];

export default function PatientSidebar({ patient, currentTab }: PatientSidebarProps) {
  const router = useRouter();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);

  const formatDob = (dob: string | null) => {
    if (!dob) return "—";
    const clean = dob.trim();
    if (!clean) return "—";
    // Check if the value looks like encrypted data
    if (clean.includes(':') && clean.length > 50) return "—";
    if (clean.includes("/")) return clean;
    const parts = clean.split("-");
    if (parts.length === 3) {
      const [yyyy, mm, dd] = parts;
      return `${mm.padStart(2, "0")}/${dd.padStart(2, "0")}/${yyyy}`;
    }
    return clean;
  };

  const calculateAge = (dob: string) => {
    if (!dob) return '';
    // Check if the value looks like encrypted data
    if (dob.includes(':') && dob.length > 50) return '';
    const birthDate = new Date(dob);
    // Check if date is valid
    if (isNaN(birthDate.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const formatGender = (g: string | null | undefined) => {
    if (!g) return "Not set";
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
    return parts.every(part => /^[A-Za-z0-9+/]+=*$/.test(part) && part.length > 10);
  };

  const formatPhone = (phone: string) => {
    if (!phone) return '';
    // Check if encrypted
    if (isEncryptedData(phone)) return '(encrypted)';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `+1(${cleaned.slice(0, 3)})${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1(${cleaned.slice(1, 4)})${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
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
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Format city/state/zip - keeps state abbreviation uppercase
  const formatCityStateZip = (city: string, state: string, zip: string): string => {
    const formattedCity = toTitleCase(city);
    // State abbreviations should stay uppercase (e.g., OR, CA, NY)
    const formattedState = state ? state.toUpperCase() : '';
    const parts = [formattedCity, `${formattedState} ${zip}`.trim()].filter(Boolean);
    return parts.join(' , ');
  };

  const handleSavePatient = async (data: any) => {
    const response = await fetch(`/api/patients/${patient.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update patient');
    }

    // Refresh the page to show updated data
    router.refresh();
  };

  const handleDeletePatient = async () => {
    // Get auth token from localStorage
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
    
    const response = await fetch(`/api/patients/${patient.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete patient');
    }

    // Redirect to patients list
    router.push('/admin/patients');
  };

  const age = calculateAge(patient.dob);
  const genderLabel = formatGender(patient.gender);
  const formattedAddress1 = toTitleCase(patient.address1);
  const formattedAddress2 = toTitleCase(patient.address2);
  const cityStateZip = formatCityStateZip(patient.city, patient.state, patient.zip);
  const fullAddress = [patient.address1, patient.address2, patient.city, patient.state, patient.zip].filter(Boolean).join(' ');
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

  return (
    <>
      <div className="w-72 flex-shrink-0 bg-white rounded-2xl border border-gray-200 p-6 h-fit sticky top-6">
        {/* Avatar and Edit */}
        <div className="flex items-start justify-between mb-4">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden"
            style={{ backgroundColor: 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))' }}
          >
            <svg className="w-16 h-16" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
              <path d="M168.87 474.18c117.83 47.3 249.86-8.68 299.06-123.14 49.63-115.44-1.6-248.95-115.65-301.7-113.17-52.33-248.52-5.4-304.63 107.98-21.33 43.11-28.68 92.39-20.36 140.67.9 5.23-2.3 9.11-6.51 9.86s-8.68-1.48-9.58-6.51c-13.29-73.89 8.82-149.3 57.39-204.81 96.07-109.8 264.09-113.5 364.9-9.46 93.33 96.31 93.6 250.56-2.16 346.99-55.72 56.12-134.34 83.01-215.35 70.33-71.32-11.16-137.76-55.71-175.24-121.32-2.19-3.84-1.15-8.94 2.91-11.23 3.7-2.09 8.72-1.26 11.37 3.28 25.94 44.47 65.71 79.73 113.85 99.05Z" style={{ fill: 'var(--brand-primary, #17aa7b)' }}/>
              <path d="M345.18 382.76c-.05-50.13-40.1-89.72-88.82-90.28-48.94-.56-90.13 38.67-90.72 88.74-.06 5.17-3.07 8.89-7.96 9.13-3.94.19-8.61-2.81-8.6-8.03.05-43.71 26.14-82.36 67.77-99.35-45.83-25.2-57.38-84.24-25-124.12 32.5-40.03 93.53-40.37 126.42-.73 33.01 39.78 21.98 99.97-24.45 124.76 41.17 16.86 67.29 54.91 67.82 98.26.06 4.94-2.54 8.34-7.04 9.12-3.35.58-9.41-1.72-9.42-7.5M223.5 266.86c29.21 18.67 69.6 7.25 87.54-22.07s9.59-68.68-19.23-88.19c-30.69-20.77-72.46-12.36-92.29 19.83-18.9 30.68-8.8 74.07 23.97 90.43Z" style={{ fill: 'var(--brand-primary, #17aa7b)' }}/>
              <path d="M291.82 156.6c28.81 19.5 37.7 58 19.23 88.19s-58.33 40.74-87.54 22.07c-.16-2.14-1.7-3.59-3.33-5.52-19.28-22.78-20.55-55.38-3.63-79.61 16.36-23.43 46.57-33.84 74.43-24.48.75.25 1.08.07.85-.65Z" style={{ fill: 'var(--brand-accent, #f6f2a2)' }}/>
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
        <h2 className="text-xl font-bold text-gray-900">{patient.firstName} {patient.lastName}</h2>
        <p className="text-sm text-gray-500 mb-3">{age ? `${age}, ` : ''}{genderLabel}</p>

        {/* Contact info */}
        <div className="space-y-1 text-sm text-gray-600 mb-3">
          <p><span className="text-gray-500">DOB:</span> {formatDob(patient.dob)}</p>
          <p>{formatEmail(patient.email)}</p>
          <p>{formatPhone(patient.phone)}</p>
        </div>

        {/* ID */}
        <p className="text-sm font-medium text-gray-900 mb-3">
          ID #{patient.patientId || String(patient.id).padStart(6, '0')}
        </p>

        {/* Address */}
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-600 block mb-6 transition-colors"
          style={{ '--hover-color': 'var(--brand-primary, #4fa77e)' } as React.CSSProperties}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#4b5563'}
        >
          {formattedAddress1 && <p>{formattedAddress1}</p>}
          {formattedAddress2 && <p>{formattedAddress2}</p>}
          {cityStateZip && <p>{cityStateZip}</p>}
        </a>

        {/* Navigation */}
        <nav className="space-y-1 mb-6">
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <Link
                key={item.id}
                href={`/patients/${patient.id}?tab=${item.id}`}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{
                    backgroundColor: isActive ? 'var(--brand-primary, #4fa77e)' : '#9ca3af',
                    color: isActive ? 'var(--brand-primary-text, #ffffff)' : '#ffffff'
                  }}
                >
                  {item.icon}
                </div>
                <span className={`text-sm ${isActive ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Actions */}
        <div className="pt-4 border-t space-y-1">
          <button
            onClick={() => setShowMergeModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors w-full text-sm"
          >
            <GitMerge className="w-4 h-4" />
            Merge with another patient
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors w-full text-sm"
          >
            <Trash2 className="w-4 h-4" />
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
            router.push(`/patients/${mergedPatientId}`);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
