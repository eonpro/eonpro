'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface PatientTabContextValue {
  currentTab: string;
  setTab: (tab: string) => void;
}

const PatientTabContext = createContext<PatientTabContextValue | null>(null);

export function usePatientTab(): PatientTabContextValue {
  const ctx = useContext(PatientTabContext);
  if (!ctx) throw new Error('usePatientTab must be used within PatientTabProvider');
  return ctx;
}

/** Safe version that returns null when not wrapped in a provider. */
export function usePatientTabSafe(): PatientTabContextValue | null {
  return useContext(PatientTabContext);
}

export function PatientTabProvider({
  initialTab,
  patientId,
  basePath,
  children,
}: {
  initialTab: string;
  patientId: number;
  basePath: string;
  children: ReactNode;
}) {
  const [currentTab, setCurrentTab] = useState(initialTab);
  const router = useRouter();
  const pathname = usePathname();

  const setTab = useCallback(
    (tab: string) => {
      setCurrentTab(tab);
      const url = `${pathname}?tab=${tab}`;
      router.replace(url, { scroll: false });
    },
    [pathname, router]
  );

  return (
    <PatientTabContext.Provider value={{ currentTab, setTab }}>
      {children}
    </PatientTabContext.Provider>
  );
}
