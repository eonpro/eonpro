'use client';

import { NotificationProvider, NotificationToastContainer } from '@/components/notifications';
import { ClinicBrandingProvider } from '@/lib/contexts/ClinicBrandingContext';

export default function TelehealthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicBrandingProvider>
      <NotificationProvider>
        {children}
        <NotificationToastContainer />
      </NotificationProvider>
    </ClinicBrandingProvider>
  );
}
