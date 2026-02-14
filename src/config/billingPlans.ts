// Billing Plans Configuration
// This file contains clinic-specific pricing data for all clinics

export interface BillingPlan {
  id: string;
  name: string;
  category:
    | 'semaglutide_monthly'
    | 'semaglutide_single'
    | 'semaglutide_3month'
    | 'semaglutide_6month'
    | 'semaglutide_12month'
    | 'tirzepatide_monthly'
    | 'tirzepatide_single'
    | 'tirzepatide_3month'
    | 'tirzepatide_6month'
    | 'tirzepatide_12month'
    | 'bloodwork'
    | 'additional_treatments'
    | 'upsales'
    | 'shipping';
  price: number; // in cents
  description: string;
  subcategory?: string;
  dose?: string;
  months?: number;
  isRecurring?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// EONMEDS Clinic Billing Plans (eonmeds.eonpro.io)
// ═══════════════════════════════════════════════════════════════════════════
export const EONMEDS_BILLING_PLANS: BillingPlan[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // SEMAGLUTIDE - Default Dose (2.5mg/1mL or 2.5mg/2mL)
  // ═══════════════════════════════════════════════════════════════════════════

  // Semaglutide Monthly (Recurring)
  {
    id: 'sema_monthly_default',
    name: 'Semaglutide 2.5mg/2mL',
    category: 'semaglutide_monthly',
    price: 22900,
    description: 'Monthly subscription - Semaglutide 2.5mg/1mL or 2.5mg/2mL',
    subcategory: 'Monthly Subscription',
    dose: '2.5mg/1mL or 2.5mg/2mL',
    months: 1,
    isRecurring: true,
  },

  // Semaglutide Single Month
  {
    id: 'sema_single_default',
    name: 'Semaglutide 2.5mg/2mL',
    category: 'semaglutide_single',
    price: 29900,
    description: 'Single month - Semaglutide 2.5mg/1mL or 2.5mg/2mL',
    subcategory: 'Single Purchase',
    dose: '2.5mg/1mL or 2.5mg/2mL',
    months: 1,
    isRecurring: false,
  },

  // Semaglutide 3 Month (Recurring)
  {
    id: 'sema_3month_default',
    name: 'Semaglutide 2.5mg/2mL',
    category: 'semaglutide_3month',
    price: 54900,
    description: '3 month subscription - Semaglutide 2.5mg/1mL or 2.5mg/2mL',
    subcategory: '3 Month Package',
    dose: '2.5mg/1mL or 2.5mg/2mL',
    months: 3,
    isRecurring: true,
  },

  // Semaglutide 6 Month (Recurring)
  {
    id: 'sema_6month_default',
    name: 'Semaglutide 2.5mg/2mL',
    category: 'semaglutide_6month',
    price: 99900,
    description: '6 month subscription - Semaglutide 2.5mg/1mL or 2.5mg/2mL',
    subcategory: '6 Month Package',
    dose: '2.5mg/1mL or 2.5mg/2mL',
    months: 6,
    isRecurring: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SEMAGLUTIDE - Higher Dose 1 (2.5mg/3mL) - if dose higher than 1mg/week
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'sema_monthly_3ml',
    name: 'Semaglutide 2.5mg/3mL',
    category: 'semaglutide_monthly',
    price: 32900,
    description: 'Monthly subscription - Semaglutide 2.5mg/3mL (dose >1mg/week)',
    subcategory: 'Monthly Subscription',
    dose: '2.5mg/3mL',
    months: 1,
    isRecurring: true,
  },
  {
    id: 'sema_single_3ml',
    name: 'Semaglutide 2.5mg/3mL',
    category: 'semaglutide_single',
    price: 37900,
    description: 'Single month - Semaglutide 2.5mg/3mL (dose >1mg/week)',
    subcategory: 'Single Purchase',
    dose: '2.5mg/3mL',
    months: 1,
    isRecurring: false,
  },
  {
    id: 'sema_3month_3ml',
    name: 'Semaglutide 2.5mg/3mL',
    category: 'semaglutide_3month',
    price: 77500,
    description: '3 month subscription - Semaglutide 2.5mg/3mL (dose >1mg/week)',
    subcategory: '3 Month Package',
    dose: '2.5mg/3mL',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'sema_6month_3ml',
    name: 'Semaglutide 2.5mg/3mL',
    category: 'semaglutide_6month',
    price: 134900,
    description: '6 month subscription - Semaglutide 2.5mg/3mL (dose >1mg/week)',
    subcategory: '6 Month Package',
    dose: '2.5mg/3mL',
    months: 6,
    isRecurring: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SEMAGLUTIDE - Higher Dose 2 (2.5mg/4mL) - if dose higher than 1.75mg/week
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'sema_monthly_4ml',
    name: 'Semaglutide 2.5mg/4mL',
    category: 'semaglutide_monthly',
    price: 39900,
    description: 'Monthly subscription - Semaglutide 2.5mg/4mL (dose >1.75mg/week)',
    subcategory: 'Monthly Subscription',
    dose: '2.5mg/4mL',
    months: 1,
    isRecurring: true,
  },
  {
    id: 'sema_single_4ml',
    name: 'Semaglutide 2.5mg/4mL',
    category: 'semaglutide_single',
    price: 44900,
    description: 'Single month - Semaglutide 2.5mg/4mL (dose >1.75mg/week)',
    subcategory: 'Single Purchase',
    dose: '2.5mg/4mL',
    months: 1,
    isRecurring: false,
  },
  {
    id: 'sema_3month_4ml',
    name: 'Semaglutide 2.5mg/4mL',
    category: 'semaglutide_3month',
    price: 89900,
    description: '3 month subscription - Semaglutide 2.5mg/4mL (dose >1.75mg/week)',
    subcategory: '3 Month Package',
    dose: '2.5mg/4mL',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'sema_6month_4ml',
    name: 'Semaglutide 2.5mg/4mL',
    category: 'semaglutide_6month',
    price: 149900,
    description: '6 month subscription - Semaglutide 2.5mg/4mL (dose >1.75mg/week)',
    subcategory: '6 Month Package',
    dose: '2.5mg/4mL',
    months: 6,
    isRecurring: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIRZEPATIDE - Default Dose (10mg/1mL or 10mg/2mL)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'tirz_monthly_default',
    name: 'Tirzepatide 10mg/2mL',
    category: 'tirzepatide_monthly',
    price: 32900,
    description: 'Monthly subscription - Tirzepatide 10mg/1mL or 10mg/2mL',
    subcategory: 'Monthly Subscription',
    dose: '10mg/1mL or 10mg/2mL',
    months: 1,
    isRecurring: true,
  },
  {
    id: 'tirz_single_default',
    name: 'Tirzepatide 10mg/2mL',
    category: 'tirzepatide_single',
    price: 39900,
    description: 'Single month - Tirzepatide 10mg/1mL or 10mg/2mL',
    subcategory: 'Single Purchase',
    dose: '10mg/1mL or 10mg/2mL',
    months: 1,
    isRecurring: false,
  },
  {
    id: 'tirz_3month_default',
    name: 'Tirzepatide 10mg/2mL',
    category: 'tirzepatide_3month',
    price: 89900,
    description: '3 month subscription - Tirzepatide 10mg/1mL or 10mg/2mL',
    subcategory: '3 Month Package',
    dose: '10mg/1mL or 10mg/2mL',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'tirz_6month_default',
    name: 'Tirzepatide 10mg/2mL',
    category: 'tirzepatide_6month',
    price: 159900,
    description: '6 month subscription - Tirzepatide 10mg/1mL or 10mg/2mL',
    subcategory: '6 Month Package',
    dose: '10mg/1mL or 10mg/2mL',
    months: 6,
    isRecurring: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIRZEPATIDE - Higher Dose 1 (10mg/3mL) - if dose higher than 5mg/week
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'tirz_monthly_3ml',
    name: 'Tirzepatide 10mg/3mL',
    category: 'tirzepatide_monthly',
    price: 42900,
    description: 'Monthly subscription - Tirzepatide 10mg/3mL (dose >5mg/week)',
    subcategory: 'Monthly Subscription',
    dose: '10mg/3mL',
    months: 1,
    isRecurring: true,
  },
  {
    id: 'tirz_single_3ml',
    name: 'Tirzepatide 10mg/3mL',
    category: 'tirzepatide_single',
    price: 49900,
    description: 'Single month - Tirzepatide 10mg/3mL (dose >5mg/week)',
    subcategory: 'Single Purchase',
    dose: '10mg/3mL',
    months: 1,
    isRecurring: false,
  },
  {
    id: 'tirz_3month_3ml',
    name: 'Tirzepatide 10mg/3mL',
    category: 'tirzepatide_3month',
    price: 112500,
    description: '3 month subscription - Tirzepatide 10mg/3mL (dose >5mg/week)',
    subcategory: '3 Month Package',
    dose: '10mg/3mL',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'tirz_6month_3ml',
    name: 'Tirzepatide 10mg/3mL',
    category: 'tirzepatide_6month',
    price: 209900,
    description: '6 month subscription - Tirzepatide 10mg/3mL (dose >5mg/week)',
    subcategory: '6 Month Package',
    dose: '10mg/3mL',
    months: 6,
    isRecurring: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIRZEPATIDE - Higher Dose 2 (10mg/4mL) - if dose higher than 7.5mg/week
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'tirz_monthly_4ml',
    name: 'Tirzepatide 10mg/4mL',
    category: 'tirzepatide_monthly',
    price: 49900,
    description: 'Monthly subscription - Tirzepatide 10mg/4mL (dose >7.5mg/week)',
    subcategory: 'Monthly Subscription',
    dose: '10mg/4mL',
    months: 1,
    isRecurring: true,
  },
  {
    id: 'tirz_single_4ml',
    name: 'Tirzepatide 10mg/4mL',
    category: 'tirzepatide_single',
    price: 59900,
    description: 'Single month - Tirzepatide 10mg/4mL (dose >7.5mg/week)',
    subcategory: 'Single Purchase',
    dose: '10mg/4mL',
    months: 1,
    isRecurring: false,
  },
  {
    id: 'tirz_3month_4ml',
    name: 'Tirzepatide 10mg/4mL',
    category: 'tirzepatide_3month',
    price: 120000,
    description: '3 month subscription - Tirzepatide 10mg/4mL (dose >7.5mg/week)',
    subcategory: '3 Month Package',
    dose: '10mg/4mL',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'tirz_6month_4ml',
    name: 'Tirzepatide 10mg/4mL',
    category: 'tirzepatide_6month',
    price: 219900,
    description: '6 month subscription - Tirzepatide 10mg/4mL (dose >7.5mg/week)',
    subcategory: '6 Month Package',
    dose: '10mg/4mL',
    months: 6,
    isRecurring: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TIRZEPATIDE - High Dose (30mg/2mL) - if dose higher than 10mg/week
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'tirz_monthly_high',
    name: 'Tirzepatide 30mg/2mL',
    category: 'tirzepatide_monthly',
    price: 59900,
    description: 'Monthly subscription - Tirzepatide 30mg/2mL (dose >10mg/week)',
    subcategory: 'Monthly Subscription',
    dose: '30mg/2mL',
    months: 1,
    isRecurring: true,
  },
  {
    id: 'tirz_single_high',
    name: 'Tirzepatide 30mg/2mL',
    category: 'tirzepatide_single',
    price: 69900,
    description: 'Single month - Tirzepatide 30mg/2mL (dose >10mg/week)',
    subcategory: 'Single Purchase',
    dose: '30mg/2mL',
    months: 1,
    isRecurring: false,
  },
  {
    id: 'tirz_3month_high',
    name: 'Tirzepatide 30mg/2mL',
    category: 'tirzepatide_3month',
    price: 149900,
    description: '3 month subscription - Tirzepatide 30mg/2mL (dose >10mg/week)',
    subcategory: '3 Month Package',
    dose: '30mg/2mL',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'tirz_6month_high',
    name: 'Tirzepatide 30mg/2mL',
    category: 'tirzepatide_6month',
    price: 249900,
    description: '6 month subscription - Tirzepatide 30mg/2mL (dose >10mg/week)',
    subcategory: '6 Month Package',
    dose: '30mg/2mL',
    months: 6,
    isRecurring: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // UPSALES - Add-on Medications
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'upsale_ondansetron',
    name: 'Ondansetron (Nausea Medication)',
    category: 'upsales',
    price: 3999,
    description: 'Anti-nausea medication',
    subcategory: 'Nausea Medication',
  },
  {
    id: 'upsale_fat_burner',
    name: 'L-Carnitine + B-Complex (Fat Burner)',
    category: 'upsales',
    price: 9999,
    description: 'Fat burning supplement injection',
    subcategory: 'Fat Burner',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOODWORK
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'bloodwork_partial',
    name: 'Partial Panel',
    category: 'bloodwork',
    price: 9900,
    description: 'Partial blood panel testing',
  },
  {
    id: 'bloodwork_full',
    name: 'Full Panel',
    category: 'bloodwork',
    price: 19900,
    description: 'Comprehensive blood panel testing',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL MONTHLY TREATMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'treatment_nad',
    name: 'NAD+',
    category: 'additional_treatments',
    price: 24900,
    description: 'Monthly NAD+ treatment',
  },
  {
    id: 'treatment_sermorelin',
    name: 'Sermorelin',
    category: 'additional_treatments',
    price: 24900,
    description: 'Monthly Sermorelin treatment',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SHIPPING
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'shipping_expedited',
    name: 'Next Day Shipping (FedEx/UPS)',
    category: 'shipping',
    price: 1500,
    description: 'Expedited next-day delivery via FedEx or UPS',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// WELLMEDR Clinic Billing Plans (wellmedr.eonpro.io)
// Simpler pricing: one Tirzepatide and one Semaglutide product at
// 1-month, 3-month (quarterly), 6-month (semester), and 12-month (yearly)
// ═══════════════════════════════════════════════════════════════════════════
export const WELLMEDR_BILLING_PLANS: BillingPlan[] = [
  // Tirzepatide
  {
    id: 'wm_tirz_1month',
    name: 'Tirzepatide 1 Month',
    category: 'tirzepatide_monthly',
    price: 26900,
    description: 'Tirzepatide - 1 Month Supply',
    months: 1,
    isRecurring: false,
  },
  {
    id: 'wm_tirz_3month',
    name: 'Tirzepatide 3 Months (Quarterly)',
    category: 'tirzepatide_3month',
    price: 62700,
    description: 'Tirzepatide - 3 Month (Quarterly) Package',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'wm_tirz_6month',
    name: 'Tirzepatide 6 Months (Semester)',
    category: 'tirzepatide_6month',
    price: 113400,
    description: 'Tirzepatide - 6 Month (Semester) Package',
    months: 6,
    isRecurring: true,
  },
  {
    id: 'wm_tirz_12month',
    name: 'Tirzepatide 12 Months (Yearly)',
    category: 'tirzepatide_12month',
    price: 198000,
    description: 'Tirzepatide - 12 Month (Yearly) Package',
    months: 12,
    isRecurring: true,
  },

  // Semaglutide
  {
    id: 'wm_sema_1month',
    name: 'Semaglutide 1 Month',
    category: 'semaglutide_monthly',
    price: 19900,
    description: 'Semaglutide - 1 Month Supply',
    months: 1,
    isRecurring: false,
  },
  {
    id: 'wm_sema_3month',
    name: 'Semaglutide 3 Months (Quarterly)',
    category: 'semaglutide_3month',
    price: 43500,
    description: 'Semaglutide - 3 Month (Quarterly) Package',
    months: 3,
    isRecurring: true,
  },
  {
    id: 'wm_sema_6month',
    name: 'Semaglutide 6 Months (Semester)',
    category: 'semaglutide_6month',
    price: 72000,
    description: 'Semaglutide - 6 Month (Semester) Package',
    months: 6,
    isRecurring: true,
  },
  {
    id: 'wm_sema_12month',
    name: 'Semaglutide 12 Months (Yearly)',
    category: 'semaglutide_12month',
    price: 114000,
    description: 'Semaglutide - 12 Month (Yearly) Package',
    months: 12,
    isRecurring: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Default / backwards-compatible export (EONMEDS plans)
// ═══════════════════════════════════════════════════════════════════════════
export const BILLING_PLANS = EONMEDS_BILLING_PLANS;

// ═══════════════════════════════════════════════════════════════════════════
// Plan look-up by clinic subdomain
// ═══════════════════════════════════════════════════════════════════════════
const CLINIC_PLANS_MAP: Record<string, BillingPlan[]> = {
  wellmedr: WELLMEDR_BILLING_PLANS,
  // Add other clinic-specific plans here as needed
  // eonmeds uses the default EONMEDS_BILLING_PLANS
};

/**
 * Get the billing plans for a specific clinic (by subdomain).
 * Falls back to EONMEDS plans when the clinic has no custom pricing.
 */
export function getPlansForClinic(clinicSubdomain?: string | null): BillingPlan[] {
  if (clinicSubdomain && CLINIC_PLANS_MAP[clinicSubdomain.toLowerCase()]) {
    return CLINIC_PLANS_MAP[clinicSubdomain.toLowerCase()];
  }
  return EONMEDS_BILLING_PLANS;
}

// Helper functions
export function getPlanById(id: string, clinicSubdomain?: string | null): BillingPlan | undefined {
  const plans = getPlansForClinic(clinicSubdomain);
  return plans.find((plan: BillingPlan) => plan.id === id);
}

export function getPlansByCategory(
  category: BillingPlan['category'],
  clinicSubdomain?: string | null
): BillingPlan[] {
  const plans = getPlansForClinic(clinicSubdomain);
  return plans.filter((plan: BillingPlan) => plan.category === category);
}

export function formatPlanPrice(priceInCents: number): string {
  return `$${(priceInCents / 100).toFixed(2)}`;
}

// Group plans by category for display
export function getGroupedPlans(clinicSubdomain?: string | null) {
  const groups: Record<string, { label: string; plans: BillingPlan[] }> = {};

  const semaMonthly = getPlansByCategory('semaglutide_monthly', clinicSubdomain);
  const semaSingle = getPlansByCategory('semaglutide_single', clinicSubdomain);
  const sema3Month = getPlansByCategory('semaglutide_3month', clinicSubdomain);
  const sema6Month = getPlansByCategory('semaglutide_6month', clinicSubdomain);
  const sema12Month = getPlansByCategory('semaglutide_12month', clinicSubdomain);
  const tirzMonthly = getPlansByCategory('tirzepatide_monthly', clinicSubdomain);
  const tirzSingle = getPlansByCategory('tirzepatide_single', clinicSubdomain);
  const tirz3Month = getPlansByCategory('tirzepatide_3month', clinicSubdomain);
  const tirz6Month = getPlansByCategory('tirzepatide_6month', clinicSubdomain);
  const tirz12Month = getPlansByCategory('tirzepatide_12month', clinicSubdomain);
  const upsales = getPlansByCategory('upsales', clinicSubdomain);
  const bloodwork = getPlansByCategory('bloodwork', clinicSubdomain);
  const additionalTreatments = getPlansByCategory('additional_treatments', clinicSubdomain);
  const shipping = getPlansByCategory('shipping', clinicSubdomain);

  // Only add groups that have plans (clinic-specific filtering)
  if (semaMonthly.length > 0) {
    groups['Semaglutide Monthly'] = { label: 'Semaglutide Monthly Plans', plans: semaMonthly };
  }
  if (semaSingle.length > 0) {
    groups['Semaglutide Single'] = {
      label: 'Semaglutide Single Month Purchase',
      plans: semaSingle,
    };
  }
  if (sema3Month.length > 0) {
    groups['Semaglutide 3 Month'] = {
      label: 'Semaglutide 3 Month Packages',
      plans: sema3Month,
    };
  }
  if (sema6Month.length > 0) {
    groups['Semaglutide 6 Month'] = {
      label: 'Semaglutide 6 Month Packages',
      plans: sema6Month,
    };
  }
  if (sema12Month.length > 0) {
    groups['Semaglutide 12 Month'] = {
      label: 'Semaglutide 12 Month Packages',
      plans: sema12Month,
    };
  }
  if (tirzMonthly.length > 0) {
    groups['Tirzepatide Monthly'] = { label: 'Tirzepatide Monthly Plans', plans: tirzMonthly };
  }
  if (tirzSingle.length > 0) {
    groups['Tirzepatide Single'] = {
      label: 'Tirzepatide Single Month Purchase',
      plans: tirzSingle,
    };
  }
  if (tirz3Month.length > 0) {
    groups['Tirzepatide 3 Month'] = {
      label: 'Tirzepatide 3 Month Packages',
      plans: tirz3Month,
    };
  }
  if (tirz6Month.length > 0) {
    groups['Tirzepatide 6 Month'] = {
      label: 'Tirzepatide 6 Month Packages',
      plans: tirz6Month,
    };
  }
  if (tirz12Month.length > 0) {
    groups['Tirzepatide 12 Month'] = {
      label: 'Tirzepatide 12 Month Packages',
      plans: tirz12Month,
    };
  }
  if (upsales.length > 0) {
    groups['Upsales'] = { label: 'Upsales', plans: upsales };
  }
  if (bloodwork.length > 0) {
    groups['Bloodwork'] = { label: 'Bloodwork', plans: bloodwork };
  }
  if (additionalTreatments.length > 0) {
    groups['Additional Treatments'] = {
      label: 'Additional Monthly Treatments',
      plans: additionalTreatments,
    };
  }
  if (shipping.length > 0) {
    groups['Shipping'] = { label: 'Shipping', plans: shipping };
  }

  return groups;
}

// Get all medication plans (excluding bloodwork, treatments, shipping)
export function getMedicationPlans(clinicSubdomain?: string | null): BillingPlan[] {
  const plans = getPlansForClinic(clinicSubdomain);
  return plans.filter(
    (plan: BillingPlan) =>
      plan.category.startsWith('semaglutide') || plan.category.startsWith('tirzepatide')
  );
}

// Get plans by medication type and months
export function getPlansByMedicationAndMonths(
  medication: 'semaglutide' | 'tirzepatide',
  months: number,
  isRecurring: boolean,
  clinicSubdomain?: string | null
): BillingPlan[] {
  const categoryMap: Record<string, string> = {
    semaglutide_1_true: 'semaglutide_monthly',
    semaglutide_1_false: 'semaglutide_single',
    semaglutide_3_true: 'semaglutide_3month',
    semaglutide_6_true: 'semaglutide_6month',
    semaglutide_12_true: 'semaglutide_12month',
    tirzepatide_1_true: 'tirzepatide_monthly',
    tirzepatide_1_false: 'tirzepatide_single',
    tirzepatide_3_true: 'tirzepatide_3month',
    tirzepatide_6_true: 'tirzepatide_6month',
    tirzepatide_12_true: 'tirzepatide_12month',
  };

  const category = categoryMap[`${medication}_${months}_${isRecurring}`];
  if (!category) return [];

  return getPlansByCategory(category as BillingPlan['category'], clinicSubdomain);
}
