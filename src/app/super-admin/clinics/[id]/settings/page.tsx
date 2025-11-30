'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ClinicSettingsRedirect() {
  const params = useParams();
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to the main clinic detail page with settings tab active
    // The settings functionality is in the main clinic page under the "Settings" tab
    router.replace(`/super-admin/clinics/${params.id}?tab=settings`);
  }, [params.id, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
    </div>
  );
}

