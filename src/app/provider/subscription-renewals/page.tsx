'use client';

import SubscriptionRenewalsView from '@/components/SubscriptionRenewalsView';

export default function ProviderSubscriptionRenewalsPage() {
  return (
    <SubscriptionRenewalsView
      userRole="provider"
      patientLinkPrefix="/provider/patients"
    />
  );
}
