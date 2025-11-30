'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function EditClinicRedirect() {
  const params = useParams();
  const router = useRouter();
  
  useEffect(() => {
    // Redirect to the main clinic detail page which has editing capabilities
    router.replace(`/super-admin/clinics/${params.id}`);
  }, [params.id, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
    </div>
  );
}

