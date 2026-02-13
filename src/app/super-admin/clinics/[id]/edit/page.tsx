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
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-teal-600"></div>
    </div>
  );
}
