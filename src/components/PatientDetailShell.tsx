'use client';

import { type ReactNode } from 'react';

import { PatientTabProvider, usePatientTab } from '@/components/PatientTabContext';

interface ShellProps {
  initialTab: string;
  patientId: number;
  basePath: string;
  children: ReactNode;
}

export default function PatientDetailShell({ initialTab, patientId, basePath, children }: ShellProps) {
  return (
    <PatientTabProvider initialTab={initialTab} patientId={patientId} basePath={basePath}>
      {children}
    </PatientTabProvider>
  );
}

/**
 * Hook for sidebar to get tab change handler.
 * Re-exported so sidebar doesn't need to import the context directly.
 */
export { usePatientTab };
