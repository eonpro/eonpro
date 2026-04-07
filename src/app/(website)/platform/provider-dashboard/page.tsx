import type { Metadata } from 'next';
import ProviderDashboardContent from './ProviderDashboardContent';

export const metadata: Metadata = {
  title: 'Provider Dashboard — EonPro',
  description:
    'A patient-centric clinical workspace combining EMR, AI SOAP notes, e-prescribing, telehealth tools, and clinical calculators.',
  openGraph: {
    title: 'Provider Dashboard — EonPro',
    description:
      'AI-assisted clinical workspace with EMR, SOAP notes, e-prescribing, and telehealth.',
    url: 'https://www.eonpro.io/platform/provider-dashboard',
  },
};

export default function ProviderDashboardPage() {
  return <ProviderDashboardContent />;
}
