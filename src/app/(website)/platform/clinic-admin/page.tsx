import type { Metadata } from 'next';
import ClinicAdminContent from './ClinicAdminContent';

export const metadata: Metadata = {
  title: 'Clinic Admin — EonPro',
  description:
    'Comprehensive operations hub for clinic owners to manage patients, orders, billing, intake forms, affiliates, analytics, and multi-clinic configurations.',
  openGraph: {
    title: 'Clinic Admin — EonPro',
    description:
      'Manage patients, billing, intake forms, analytics, and multi-clinic configurations.',
    url: 'https://www.eonpro.io/platform/clinic-admin',
  },
};

export default function ClinicAdminPage() {
  return <ClinicAdminContent />;
}
