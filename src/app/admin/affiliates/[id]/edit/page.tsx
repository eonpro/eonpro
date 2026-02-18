'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';

export default function AffiliateEditRedirect() {
  const params = useParams();
  const id = params.id as string;

  useEffect(() => {
    window.location.href = `/admin/affiliates/${id}`;
  }, [id]);

  return (
    <div className="flex h-96 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
    </div>
  );
}
