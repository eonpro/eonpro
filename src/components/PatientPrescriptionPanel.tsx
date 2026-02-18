'use client';

import { useMemo } from 'react';
import PrescriptionForm from '@/components/PrescriptionForm';

function normalizeGender(raw: string | null | undefined): string {
  const g = (raw || '').toLowerCase().trim();
  if (['m', 'male', 'man'].includes(g)) return 'm';
  if (['f', 'female', 'woman'].includes(g)) return 'f';
  return '';
}

type PatientPrescriptionPanelProps = {
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    dob: string | null;
    gender: string | null;
    phone: string | null;
    email: string | null;
    address1: string | null;
    address2?: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  onSuccess?: () => void;
};

export default function PatientPrescriptionPanel({
  patient,
  onSuccess,
}: PatientPrescriptionPanelProps) {
  const patientContext = useMemo(
    () => ({
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      dob: patient.dob ?? '',
      gender: normalizeGender(patient.gender),
      phone: patient.phone ?? '',
      email: patient.email ?? '',
      address1: patient.address1 ?? '',
      address2: patient.address2 ?? '',
      city: patient.city ?? '',
      state: patient.state ?? '',
      zip: patient.zip ?? '',
    }),
    [patient]
  );

  return (
    <PrescriptionForm
      patientContext={patientContext}
      redirectPath={onSuccess ? undefined : `/patients/${patient.id}?tab=prescriptions&submitted=1`}
      onSuccess={onSuccess}
    />
  );
}
