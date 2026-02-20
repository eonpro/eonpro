'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function EditClinicRedirect() {
  const params = useParams();

  useEffect(() => {
    window.location.replace(`/super-admin/clinics/${params.id}`);
  }, [params.id]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
      <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-teal-600"></div>
    </div>
  );
}
