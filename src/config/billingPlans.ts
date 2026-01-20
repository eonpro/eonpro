// Billing Plans Configuration for EONMEDS Clinic
// This file contains clinic-specific pricing data

export interface BillingPlan {
  id: string;
  name: string;
  category: 'semaglutide_monthly' | 'semaglutide_single' | 'semaglutide_3month' | 'semaglutide_6month' |
            'tirzepatide_monthly' | 'tirzepatide_single' | 'tirzepatide_3month' | 'tirzepatide_6month' |
            'bloodwork' | 'additional_treatments' | 'upsales' | 'shipping';
  price: number; // in cents
  description: string;
  subcategory?: string;
  dose?: string;
  months?: number;
  isRecurring?: boolean;
}

export const BILLING_PLANS: BillingPlan[] = [
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
    isRecurring: true
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
    isRecurring: false
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
    isRecurring: true
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
    isRecurring: true
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
    isRecurring: true
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
    isRecurring: false
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
    isRecurring: true
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
    isRecurring: true
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
    isRecurring: true
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
    isRecurring: false
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
    isRecurring: true
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
    isRecurring: true
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
    isRecurring: true
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
    isRecurring: false
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
    isRecurring: true
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
    isRecurring: true
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
    isRecurring: true
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
    isRecurring: false
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
    isRecurring: true
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
    isRecurring: true
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
    isRecurring: true
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
    isRecurring: false
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
    isRecurring: true
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
    isRecurring: true
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
    isRecurring: true
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
    isRecurring: false
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
    isRecurring: true
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
    isRecurring: true
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
    subcategory: 'Nausea Medication'
  },
  {
    id: 'upsale_fat_burner',
    name: 'L-Carnitine + B-Complex (Fat Burner)',
    category: 'upsales',
    price: 9999,
    description: 'Fat burning supplement injection',
    subcategory: 'Fat Burner'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BLOODWORK
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    id: 'bloodwork_partial',
    name: 'Partial Panel',
    category: 'bloodwork',
    price: 9900,
    description: 'Partial blood panel testing'
  },
  {
    id: 'bloodwork_full',
    name: 'Full Panel',
    category: 'bloodwork',
    price: 19900,
    description: 'Comprehensive blood panel testing'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL MONTHLY TREATMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    id: 'treatment_nad',
    name: 'NAD+',
    category: 'additional_treatments',
    price: 24900,
    description: 'Monthly NAD+ treatment'
  },
  {
    id: 'treatment_sermorelin',
    name: 'Sermorelin',
    category: 'additional_treatments',
    price: 24900,
    description: 'Monthly Sermorelin treatment'
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SHIPPING
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    id: 'shipping_expedited',
    name: 'Next Day Shipping (FedEx/UPS)',
    category: 'shipping',
    price: 1500,
    description: 'Expedited next-day delivery via FedEx or UPS'
  }
];

// Helper functions
export function getPlanById(id: string): BillingPlan | undefined {
  return BILLING_PLANS.find((plan: BillingPlan) => plan.id === id);
}

export function getPlansByCategory(category: BillingPlan['category']): BillingPlan[] {
  return BILLING_PLANS.filter((plan: BillingPlan) => plan.category === category);
}

export function formatPlanPrice(priceInCents: number): string {
  return `$${(priceInCents / 100).toFixed(2)}`;
}

// Group plans by category for display
export function getGroupedPlans() {
  const groups: Record<string, { label: string; plans: BillingPlan[] }> = {
    'Semaglutide Monthly': {
      label: 'Semaglutide Monthly Plans',
      plans: getPlansByCategory('semaglutide_monthly')
    },
    'Semaglutide Single': {
      label: 'Semaglutide Single Month Purchase',
      plans: getPlansByCategory('semaglutide_single')
    },
    'Semaglutide 3 Month': {
      label: 'Semaglutide 3 Month Packages',
      plans: getPlansByCategory('semaglutide_3month')
    },
    'Semaglutide 6 Month': {
      label: 'Semaglutide 6 Month Packages',
      plans: getPlansByCategory('semaglutide_6month')
    },
    'Tirzepatide Monthly': {
      label: 'Tirzepatide Monthly Plans',
      plans: getPlansByCategory('tirzepatide_monthly')
    },
    'Tirzepatide Single': {
      label: 'Tirzepatide Single Month Purchase',
      plans: getPlansByCategory('tirzepatide_single')
    },
    'Tirzepatide 3 Month': {
      label: 'Tirzepatide 3 Month Packages',
      plans: getPlansByCategory('tirzepatide_3month')
    },
    'Tirzepatide 6 Month': {
      label: 'Tirzepatide 6 Month Packages',
      plans: getPlansByCategory('tirzepatide_6month')
    },
    'Upsales': {
      label: 'Upsales',
      plans: getPlansByCategory('upsales')
    },
    'Bloodwork': {
      label: 'Bloodwork',
      plans: getPlansByCategory('bloodwork')
    },
    'Additional Treatments': {
      label: 'Additional Monthly Treatments',
      plans: getPlansByCategory('additional_treatments')
    },
    'Shipping': {
      label: 'Shipping',
      plans: getPlansByCategory('shipping')
    }
  };
  return groups;
}

// Get all medication plans (excluding bloodwork, treatments, shipping)
export function getMedicationPlans(): BillingPlan[] {
  return BILLING_PLANS.filter((plan: BillingPlan) => 
    plan.category.startsWith('semaglutide') || plan.category.startsWith('tirzepatide')
  );
}

// Get plans by medication type and months
export function getPlansByMedicationAndMonths(
  medication: 'semaglutide' | 'tirzepatide',
  months: number,
  isRecurring: boolean
): BillingPlan[] {
  const categoryMap: Record<string, string> = {
    'semaglutide_1_true': 'semaglutide_monthly',
    'semaglutide_1_false': 'semaglutide_single',
    'semaglutide_3_true': 'semaglutide_3month',
    'semaglutide_6_true': 'semaglutide_6month',
    'tirzepatide_1_true': 'tirzepatide_monthly',
    'tirzepatide_1_false': 'tirzepatide_single',
    'tirzepatide_3_true': 'tirzepatide_3month',
    'tirzepatide_6_true': 'tirzepatide_6month',
  };
  
  const category = categoryMap[`${medication}_${months}_${isRecurring}`];
  if (!category) return [];
  
  return getPlansByCategory(category as BillingPlan['category']);
}
