import type { Metadata } from 'next';
import PharmacyIntegrationContent from './PharmacyIntegrationContent';

export const metadata: Metadata = {
  title: 'Pharmacy Integration — EonPro',
  description:
    'End-to-end pharmacy operations with e-prescriptions, automated fulfillment, real-time shipment tracking, and proactive patient communication.',
  openGraph: {
    title: 'Pharmacy Integration — EonPro',
    description:
      'E-prescriptions, automated fulfillment, shipment tracking, and proactive patient communication.',
    url: 'https://www.eonpro.io/platform/pharmacy-integration',
  },
};

export default function PharmacyIntegrationPage() {
  return <PharmacyIntegrationContent />;
}
