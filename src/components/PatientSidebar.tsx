'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import EditPatientModal from './EditPatientModal';
import DeletePatientModal from './DeletePatientModal';

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

  const formatDob = (dob: string | null) => {
    if (!dob) return "—";
    const clean = dob.trim();
    if (!clean) return "—";
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
    const birthDate = new Date(dob);
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

  const formatPhone = (phone: string) => {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `+1(${cleaned.slice(0, 3)})${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1(${cleaned.slice(1, 4)})${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
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
    const response = await fetch(`/api/patients/${patient.id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete patient');
    }

    // Redirect to patients list
    router.push('/patients');
  };

  const age = calculateAge(patient.dob);
  const genderLabel = formatGender(patient.gender);
  const cityStateZip = [patient.city, `${patient.state} ${patient.zip}`].filter(Boolean).join(', ');
  const fullAddress = [patient.address1, patient.address2, cityStateZip].filter(Boolean).join(', ');
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;

  return (
    <>
      <div className="w-72 flex-shrink-0 bg-white rounded-2xl border border-gray-200 p-6 h-fit sticky top-6">
        {/* Avatar and Edit */}
        <div className="flex items-start justify-between mb-4">
          <div className="w-20 h-20 rounded-full bg-[#4fa77e]/10 flex items-center justify-center">
            <svg className="w-12 h-12 text-[#4fa77e]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
          <button
            onClick={() => setShowEditModal(true)}
            className="text-[#4fa77e] text-sm font-medium hover:underline"
          >
            Edit
          </button>
        </div>

        {/* Name and basic info */}
        <h2 className="text-xl font-bold text-gray-900">{patient.firstName} {patient.lastName}</h2>
        <p className="text-sm text-gray-500 mb-3">{age}, {genderLabel}</p>

        {/* Contact info */}
        <div className="space-y-1 text-sm text-gray-600 mb-3">
          <p><span className="text-gray-500">DOB:</span> {formatDob(patient.dob)}</p>
          <p>{patient.email}</p>
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
          className="text-sm text-gray-600 hover:text-[#4fa77e] block mb-6"
        >
          {patient.address1 && <p>{patient.address1}</p>}
          {patient.address2 && <p>{patient.address2}</p>}
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
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                  isActive ? 'bg-purple-500' : 'bg-gray-400'
                }`}>
                  {item.icon}
                </div>
                <span className={`text-sm ${isActive ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Delete Button */}
        <div className="pt-4 border-t">
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
    </>
  );
}
