'use client';

import { useState } from 'react';
import EditPatientForm from './EditPatientForm';
import { MapPin } from 'lucide-react';

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

export default function PatientProfileView({ patient, documents }: Props) {
  const [isEditing, setIsEditing] = useState(false);

  // Generate consistent colors for hashtags
  const getTagColor = (tag: string) => {
    const colors = [
      { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
      { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
      { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700' },
      { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700' },
      { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
      { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
      { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
      { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700' },
      { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
    ];

    // Generate a consistent hash from the tag string
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = (hash << 5) - hash + tag.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }

    return colors[Math.abs(hash) % colors.length];
  };

  const formatDob = (dob: string) => {
    if (!dob) return '—';
    if (dob.includes('-')) {
      const [year, month, day] = dob.split('-');
      return `${month}/${day}/${year}`;
    }
    return dob;
  };

  // Format gender - handles "m", "f", "male", "female", "man", "woman"
  const formatGenderValue = (g: string | null | undefined) => {
    if (!g) return '—';
    const gl = g.toLowerCase().trim();
    if (gl === 'f' || gl === 'female' || gl === 'woman') return 'Female';
    if (gl === 'm' || gl === 'male' || gl === 'man') return 'Male';
    return g;
  };
  const genderLabel = formatGenderValue(patient.gender);

  if (isEditing) {
    return (
      <div className="rounded-lg border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Edit Patient Information</h3>
          <button
            onClick={() => setIsEditing(false)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
        <EditPatientForm patient={patient} documents={documents} />
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white">
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Patient Information</h3>
          <button
            onClick={() => setIsEditing(true)}
            className="rounded-lg bg-[#4fa77e] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3f8660]"
          >
            Edit Profile
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Personal Information */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                First Name
              </label>
              <p className="mt-1 text-sm text-gray-900">{patient.firstName}</p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Last Name
              </label>
              <p className="mt-1 text-sm text-gray-900">{patient.lastName}</p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Date of Birth
              </label>
              <p className="mt-1 text-sm text-gray-900">{formatDob(patient.dob)}</p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Gender
              </label>
              <p className="mt-1 text-sm text-gray-900">{genderLabel}</p>
            </div>
          </div>

          {/* Contact Information */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Phone
              </label>
              <p className="mt-1 text-sm text-gray-900">{patient.phone}</p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Email
              </label>
              <p className="mt-1 text-sm text-gray-900">{patient.email}</p>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Address
              </label>
              {(() => {
                // Check if address1 already contains city/state/zip
                const hasFullAddress =
                  patient.address1 &&
                  (patient.address1.includes(patient.city) ||
                    patient.address1.includes(patient.state) ||
                    patient.address1.includes(patient.zip));

                // Build the complete address
                let fullAddress = patient.address1;
                if (!hasFullAddress && patient.city && patient.state && patient.zip) {
                  fullAddress = `${patient.address1}, ${patient.city}, ${patient.state} ${patient.zip}`;
                }

                // Generate Google Maps URL
                const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress || '')}`;

                return (
                  <div className="mt-1">
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-start gap-1 text-sm text-[#4fa77e] hover:underline"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span>
                        {fullAddress}
                        {patient.address2 && (
                          <>
                            <br />
                            {patient.address2}
                          </>
                        )}
                      </span>
                    </a>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Notes and Tags */}
        {(patient.notes || (patient.tags && patient.tags.length > 0)) && (
          <div className="mt-6 space-y-4 border-t pt-6">
            {patient.notes && (
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Notes
                </label>
                <p className="mt-1 whitespace-pre-line text-sm text-gray-900">{patient.notes}</p>
              </div>
            )}
            {patient.tags && patient.tags.length > 0 && (
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Tags
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {patient.tags.map((tag: any) => {
                    const color = getTagColor(tag);
                    return (
                      <span
                        key={tag}
                        className={`px-2 py-1 ${color.bg} ${color.border} ${color.text} rounded-full border text-xs font-medium`}
                      >
                        #{tag}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
