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
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-teal-600"></div>
    </div>
  );
}
