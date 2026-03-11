/**
 * Admin-specific patient detail route.
 * Keeps admin/staff/pharmacy_rep users under /admin/* so AdminLayout wraps the page,
 * preserving sidebar, branding, notifications, and pharmacy context.
 *
 * Re-uses the shared patient detail page component.
 */
import PatientDetailPage from '@/app/patients/[id]/page';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string; submitted?: string; admin?: string }>;
};

export default async function AdminPatientDetailPage(props: PageProps) {
  return <PatientDetailPage {...props} patientsListPath="/admin/patients" />;
}
