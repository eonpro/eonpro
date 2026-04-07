import type { Metadata } from 'next';
import PatientPortalContent from './PatientPortalContent';

export const metadata: Metadata = {
  title: 'Patient Portal — EonPro',
  description:
    'A mobile-first PWA for patients to message providers, track progress, manage medications, schedule visits, log vitals, and access medical records.',
  openGraph: {
    title: 'Patient Portal — EonPro',
    description:
      'A single stop for patients to track progress, manage medications, schedule visits, and more.',
    url: 'https://www.eonpro.io/platform/patient-portal',
  },
};

export default function PatientPortalPage() {
  return <PatientPortalContent />;
}
