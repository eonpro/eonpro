'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PatientLayout from '@/components/layouts/PatientLayout';

export default function PatientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check authentication
    const user = localStorage.getItem('user');
    if (!user) {
      // For demo, create a default patient user
      const defaultPatient = {
        id: 1,
        email: 'patient@example.com',
        role: 'patient',
        firstName: 'Rebecca',
        lastName: 'Pignano',
        patientId: 'P12345',
        clinicId: 1,
        clinicName: 'Main Clinic'
      };
      setUserData(defaultPatient);
      setLoading(false);
      return;
    }
    
    const data = JSON.parse(user);
    setUserData(data);
    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <PatientLayout userData={userData}>
      {children}
    </PatientLayout>
  );
}
