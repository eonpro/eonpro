'use client';

import PatientIntakeView from '@/components/PatientIntakeView';
import { PatientBillingView } from '@/components/PatientBillingView';
import PatientPaymentMethods from '@/components/PatientPaymentMethods';
import PatientSOAPNotesView from '@/components/PatientSOAPNotesView';
import PatientChatView from '@/components/PatientChatView';
import PatientAppointmentsView from '@/components/PatientAppointmentsView';
import PatientProgressView from '@/components/PatientProgressView';
import PatientPrescriptionsTab from '@/components/PatientPrescriptionsTab';
import PatientDocumentsView from '@/components/PatientDocumentsView';
import PatientLabView from '@/components/PatientLabView';
import PatientNotesView from '@/components/PatientNotesView';
import PatientPhotosView from '@/components/PatientPhotosView';
import PatientPrescriptionSummary from '@/components/PatientPrescriptionSummary';
import PatientTags from '@/components/PatientTags';
import PatientPortalAccessBlock from '@/components/PatientPortalAccessBlock';
import { usePatientTab } from '@/components/PatientTabContext';
import PatientVitalsCard from '@/components/PatientVitalsCard';
import WeightProgressSummary from '@/components/WeightProgressSummary';
import PatientProgressSummary from '@/components/PatientProgressSummary';

interface PatientProfileClientProps {
  patientId: number;
  patientCore: any;
  /** Initial tab from server searchParams — runtime tab is read from PatientTabContext */
  currentTab: string;
  userRole: string;
  patientsListPath: string;
  showLabsTab: boolean;
  doseSpotEnabled: boolean;
  clinicSubdomain?: string | null;
  providerId?: number;
  hasPortalAccess: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  portalInvite: { sentAt: string; trigger: string; used: boolean; expired: boolean } | null;
  patientTags: string[];
  patientCreatedAt: string;
  submittedFlag: boolean;
  isAdminView: boolean;
  fallbackSubdomain?: string | null;
}

function TabContent(props: PatientProfileClientProps): React.ReactNode {
  const {
    patientId, patientCore, currentTab, userRole, patientsListPath,
    doseSpotEnabled, clinicSubdomain, providerId, hasPortalAccess,
    hasEmail, hasPhone, portalInvite, patientTags, patientCreatedAt,
    isAdminView, fallbackSubdomain,
  } = props;

  const patientName = `${patientCore.firstName} ${patientCore.lastName}`;

  switch (currentTab) {
    case 'profile':
      return (
        <div className="space-y-4 md:space-y-6">
          <h1 className="text-xl font-bold text-gray-900 md:text-2xl">Patient Overview</h1>
          <PatientPortalAccessBlock
            patientId={patientId}
            hasPortalAccess={hasPortalAccess}
            hasEmail={hasEmail}
            hasPhone={hasPhone}
            lastInvite={portalInvite}
          />
          <PatientVitalsCard patientId={patientId} />
          <PatientPrescriptionSummary patientId={patientId} />
          <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
            <PatientTags patientId={patientId} initialTags={patientTags} />
            <div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">Overview</h3>
              <p className="mt-1 text-sm text-gray-500" suppressHydrationWarning>
                Last updated: {new Date(patientCreatedAt).toLocaleString()}
              </p>
            </div>
            <WeightProgressSummary patientId={patientId} basePath={patientsListPath} />
            <PatientProgressSummary patientId={patientId} basePath={patientsListPath} />
          </div>
          {isAdminView && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Patient Audit Log</h2>
                <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-700">Admin Only</span>
              </div>
              <p className="text-sm text-gray-500">Audit log loads on demand via admin view.</p>
            </div>
          )}
        </div>
      );
    case 'notes':
      return <PatientNotesView patientId={patientId} />;
    case 'intake':
      return (
        <PatientIntakeView
          patient={patientCore}
          clinicSubdomain={clinicSubdomain}
          fallbackSubdomainForSections={fallbackSubdomain}
        />
      );
    case 'soap-notes':
      return <PatientSOAPNotesView patientId={patientId} />;
    case 'appointments':
      return <PatientAppointmentsView patient={patientCore} clinicId={patientCore.clinicId ?? undefined} />;
    case 'progress':
      return <PatientProgressView patient={patientCore} />;
    case 'prescriptions':
      return (
        <PatientPrescriptionsTab
          patient={patientCore}
          doseSpotEnabled={doseSpotEnabled}
          providerId={providerId}
          showTrackingManager={userRole === 'pharmacy_rep'}
        />
      );
    case 'billing':
      return (
        <div className="space-y-6">
          <PatientBillingView
            patientId={patientId}
            patientName={patientName}
            clinicSubdomain={clinicSubdomain ?? fallbackSubdomain}
          />
          <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
            <h3 className="mb-4 border-b border-gray-200 pb-3 text-lg font-semibold">Payment Methods</h3>
            <PatientPaymentMethods patientId={patientId} patientName={patientName} />
          </div>
        </div>
      );
    case 'lab':
      return <PatientLabView patientId={patientId} patientName={patientName} />;
    case 'documents':
      return <PatientDocumentsView patientId={patientId} patientName={patientName} patientBasePath={patientsListPath} />;
    case 'chat':
      return <PatientChatView patient={patientCore} />;
    case 'photos':
      return <PatientPhotosView patientId={patientId} patientName={patientName} />;
    default:
      return null;
  }
}

export default function PatientProfileClient(props: PatientProfileClientProps) {
  const { submittedFlag } = props;
  const { currentTab } = usePatientTab();

  const activeProps = { ...props, currentTab };

  return (
    <>
      {submittedFlag && (currentTab === 'profile' || currentTab === 'prescriptions') && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <svg className="h-5 w-5 flex-shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Prescription submitted successfully.
        </div>
      )}
      <TabContent {...activeProps} />
    </>
  );
}
