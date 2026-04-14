'use client';

/**
 * OT.EONPRO.IO — interactive retail pricing calculator for staff, providers, reps, and admins.
 * Same rules as the legacy HTML calculator; data from `OT_RETAIL_PACKAGES`.
 */

import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { useAuthStore } from '@/lib/stores/authStore';
import { OtRetailPricingCalculator } from '@/components/resources/OtRetailPricingCalculator';
import { AlertCircle } from 'lucide-react';

export default function OtRetailPricingResourcesPage() {
  const { branding, isLoading: brandingLoading } = useClinicBranding();
  const role = useAuthStore((s) => s.role);
  const subdomain = branding?.subdomain?.toLowerCase() ?? '';
  const allowed = role === 'super_admin' || subdomain === 'ot';

  if (brandingLoading) {
    return (
      <div className="flex items-center justify-center p-6 lg:p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-600" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-6 lg:p-8">
        <div className="flex max-w-lg items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-medium">
              This resource is only available for the Overtime (OT) clinic.
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Switch to clinic <strong>ot</strong> (or use a super admin account), then open this
              page again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mb-4 lg:mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Resources</h1>
        <p className="mt-1 text-gray-600">
          Quick retail pricing for OT Men&apos;s Health — share with sales reps and staff. List
          prices match the catalog used for quotes and invoicing.
        </p>
      </div>
      <OtRetailPricingCalculator />
    </div>
  );
}
