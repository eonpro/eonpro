'use client';

import { ReactNode } from 'react';
import { ClinicProvider } from '@/lib/clinic/context';

interface ClientProvidersProps {
  children: ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  const multiClinicEnabled = process.env.NEXT_PUBLIC_ENABLE_MULTI_CLINIC === 'true';

  if (multiClinicEnabled) {
    return <ClinicProvider>{children}</ClinicProvider>;
  }

  return <>{children}</>;
}
