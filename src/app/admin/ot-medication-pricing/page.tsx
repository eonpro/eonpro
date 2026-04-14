'use client';

/**
 * OT.EONPRO.IO — medication pricing reference for admins and sales reps.
 * Visible when clinic context is OT (providers, staff, admins, reps) or user is super_admin.
 */

import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { useAuthStore } from '@/lib/stores/authStore';
import { OtMedicationPricingCatalog } from '@/components/invoices/OtMedicationPricingCatalog';
import { AlertCircle } from 'lucide-react';

export default function OtMedicationPricingPage() {
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
              OT medication pricing is only available for the Overtime clinic.
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
    <div className="min-h-screen p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">OT medication pricing</h1>
        <p className="mt-1 text-gray-500">
          Official OT.EONPRO.IO 1-month and quarterly options — search, select rows, copy quotes, or
          export CSV.
        </p>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm lg:p-6">
        <OtMedicationPricingCatalog />
      </div>
    </div>
  );
}
