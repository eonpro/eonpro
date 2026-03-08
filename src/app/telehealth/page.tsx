'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function TelehealthRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/provider/telehealth');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  );
}
