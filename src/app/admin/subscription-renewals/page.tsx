'use client';

import SubscriptionRenewalsView from '@/components/SubscriptionRenewalsView';

export default function AdminSubscriptionRenewalsPage() {
  return (
    <SubscriptionRenewalsView
      userRole="admin"
      patientLinkPrefix="/patients"
    />
  );
}
