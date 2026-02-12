/**
 * Provider-specific patient detail route.
 * Keeps providers under /provider/* so ProviderLayout wraps the page,
 * ensuring provider context (tokens, session) is consistent for prescription form.
 *
 * Re-uses the shared patient detail page component.
 */
import PatientDetailPage from '@/app/patients/[id]/page';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string; submitted?: string; admin?: string }>;
};

export default async function ProviderPatientDetailPage(props: PageProps) {
  return <PatientDetailPage {...props} patientsListPath="/provider/patients" />;
}
