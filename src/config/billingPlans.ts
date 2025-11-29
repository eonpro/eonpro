// Billing Plans Configuration
export interface BillingPlan {
  id: string;
  name: string;
  category: 'semaglutide_monthly' | 'semaglutide_single' | 'semaglutide_3month' | 
            'tirzepatide_monthly' | 'tirzepatide_single' | 'tirzepatide_3month' |
            'bloodwork' | 'additional_treatments';
  price: number; // in cents
  description: string;
  subcategory?: string;
}

export const BILLING_PLANS: BillingPlan[] = [
  // Semaglutide Monthly Plans
  {
    id: 'sema_monthly_0_1.25',
    name: 'Semaglutide 0-1.25mg',
    category: 'semaglutide_monthly',
    price: 22900,
    description: 'Monthly subscription - Semaglutide 0-1.25mg',
    subcategory: 'Monthly Plan'
  },
  {
    id: 'sema_monthly_1.25_1.75',
    name: 'Semaglutide 1.25mg-1.75mg',
    category: 'semaglutide_monthly',
    price: 29900,
    description: 'Monthly subscription - Semaglutide 1.25mg-1.75mg',
    subcategory: 'Monthly Plan'
  },
  {
    id: 'sema_monthly_1.75_2.5',
    name: 'Semaglutide 1.75mg-2.5mg',
    category: 'semaglutide_monthly',
    price: 34900,
    description: 'Monthly subscription - Semaglutide 1.75mg-2.5mg',
    subcategory: 'Monthly Plan'
  },
  
  // Semaglutide Single Month Purchase
  {
    id: 'sema_single_0_1.25',
    name: 'Semaglutide 0-1.25mg',
    category: 'semaglutide_single',
    price: 29900,
    description: 'Single month purchase - Semaglutide 0-1.25mg',
    subcategory: 'Single Month'
  },
  {
    id: 'sema_single_1.25_1.75',
    name: 'Semaglutide 1.25mg-1.75mg',
    category: 'semaglutide_single',
    price: 34900,
    description: 'Single month purchase - Semaglutide 1.25mg-1.75mg',
    subcategory: 'Single Month'
  },
  {
    id: 'sema_single_1.75_2.5',
    name: 'Semaglutide 1.75mg-2.5mg',
    category: 'semaglutide_single',
    price: 39900,
    description: 'Single month purchase - Semaglutide 1.75mg-2.5mg',
    subcategory: 'Single Month'
  },
  
  // Semaglutide 3 Month Promo
  {
    id: 'sema_3month_0_1.25',
    name: 'Semaglutide 0-1.25mg',
    category: 'semaglutide_3month',
    price: 54900,
    description: '3 month promo - Semaglutide 0-1.25mg',
    subcategory: '3 Month Promo'
  },
  {
    id: 'sema_3month_1.25_1.75',
    name: 'Semaglutide 1.25mg-1.75mg',
    category: 'semaglutide_3month',
    price: 74900,
    description: '3 month promo - Semaglutide 1.25mg-1.75mg',
    subcategory: '3 Month Promo'
  },
  {
    id: 'sema_3month_1.75_2.5',
    name: 'Semaglutide 1.75mg-2.5mg',
    category: 'semaglutide_3month',
    price: 89900,
    description: '3 month promo - Semaglutide 1.75mg-2.5mg',
    subcategory: '3 Month Promo'
  },
  
  // Tirzepatide Monthly Plans
  {
    id: 'tirz_monthly_0_5',
    name: 'Tirzepatide 0-5mg',
    category: 'tirzepatide_monthly',
    price: 32900,
    description: 'Monthly subscription - Tirzepatide 0-5mg',
    subcategory: 'Monthly Plan'
  },
  {
    id: 'tirz_monthly_5_7.5',
    name: 'Tirzepatide 5mg-7.5mg',
    category: 'tirzepatide_monthly',
    price: 39900,
    description: 'Monthly subscription - Tirzepatide 5mg-7.5mg',
    subcategory: 'Monthly Plan'
  },
  {
    id: 'tirz_monthly_7.5_10',
    name: 'Tirzepatide 7.5mg-10mg',
    category: 'tirzepatide_monthly',
    price: 44900,
    description: 'Monthly subscription - Tirzepatide 7.5mg-10mg',
    subcategory: 'Monthly Plan'
  },
  {
    id: 'tirz_monthly_high',
    name: 'Tirzepatide High Dose',
    category: 'tirzepatide_monthly',
    price: 59900,
    description: 'Monthly subscription - Tirzepatide High Dose',
    subcategory: 'Monthly Plan'
  },
  
  // Tirzepatide Single Month Purchase
  {
    id: 'tirz_single_0_5',
    name: 'Tirzepatide 0-5mg',
    category: 'tirzepatide_single',
    price: 39900,
    description: 'Single month purchase - Tirzepatide 0-5mg',
    subcategory: 'Single Month'
  },
  {
    id: 'tirz_single_5_7.5',
    name: 'Tirzepatide 5mg-7.5mg',
    category: 'tirzepatide_single',
    price: 44900,
    description: 'Single month purchase - Tirzepatide 5mg-7.5mg',
    subcategory: 'Single Month'
  },
  {
    id: 'tirz_single_7.5_10',
    name: 'Tirzepatide 7.5mg-10mg',
    category: 'tirzepatide_single',
    price: 49900,
    description: 'Single month purchase - Tirzepatide 7.5mg-10mg',
    subcategory: 'Single Month'
  },
  {
    id: 'tirz_single_high',
    name: 'Tirzepatide High Dose',
    category: 'tirzepatide_single',
    price: 64900,
    description: 'Single month purchase - Tirzepatide High Dose',
    subcategory: 'Single Month'
  },
  
  // Tirzepatide 3 Month (First section)
  {
    id: 'tirz_3month_0_5',
    name: 'Tirzepatide 0-5mg',
    category: 'tirzepatide_3month',
    price: 89900,
    description: '3 month package - Tirzepatide 0-5mg',
    subcategory: '3 Month Package'
  },
  {
    id: 'tirz_3month_5_7.5',
    name: 'Tirzepatide 5mg-7.5mg',
    category: 'tirzepatide_3month',
    price: 109900,
    description: '3 month package - Tirzepatide 5mg-7.5mg',
    subcategory: '3 Month Package'
  },
  {
    id: 'tirz_3month_7.5_10',
    name: 'Tirzepatide 7.5mg-10mg',
    category: 'tirzepatide_3month',
    price: 119900,
    description: '3 month package - Tirzepatide 7.5mg-10mg',
    subcategory: '3 Month Package'
  },
  {
    id: 'tirz_3month_high',
    name: 'Tirzepatide High Dose',
    category: 'tirzepatide_3month',
    price: 149900,
    description: '3 month package - Tirzepatide High Dose',
    subcategory: '3 Month Package'
  },
  
  // Tirzepatide 3 Month (Second section - higher prices)
  {
    id: 'tirz_3month_premium_0_5',
    name: 'Tirzepatide 0-5mg (Premium)',
    category: 'tirzepatide_3month',
    price: 159900,
    description: '3 month premium package - Tirzepatide 0-5mg',
    subcategory: '3 Month Premium'
  },
  {
    id: 'tirz_3month_premium_5_7.5',
    name: 'Tirzepatide 5mg-7.5mg (Premium)',
    category: 'tirzepatide_3month',
    price: 199900,
    description: '3 month premium package - Tirzepatide 5mg-7.5mg',
    subcategory: '3 Month Premium'
  },
  {
    id: 'tirz_3month_premium_7.5_10',
    name: 'Tirzepatide 7.5mg-10mg (Premium)',
    category: 'tirzepatide_3month',
    price: 219900,
    description: '3 month premium package - Tirzepatide 7.5mg-10mg',
    subcategory: '3 Month Premium'
  },
  {
    id: 'tirz_3month_premium_high',
    name: 'Tirzepatide High Dose (Premium)',
    category: 'tirzepatide_3month',
    price: 249900,
    description: '3 month premium package - Tirzepatide High Dose',
    subcategory: '3 Month Premium'
  },
  
  // Bloodwork
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
  
  // Additional Monthly Treatments
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
  {
    id: 'treatment_trt',
    name: 'TRT',
    category: 'additional_treatments',
    price: 22900,
    description: 'Monthly TRT treatment'
  },
  {
    id: 'treatment_enclomiphene',
    name: 'Enclomiphene',
    category: 'additional_treatments',
    price: 17900,
    description: 'Monthly Enclomiphene treatment'
  }
];

// Helper functions
export function getPlanById(id: string): BillingPlan | undefined {
  return BILLING_PLANS.find((plan: any) => plan.id === id);
}

export function getPlansByCategory(category: BillingPlan['category']): BillingPlan[] {
  return BILLING_PLANS.filter((plan: any) => plan.category === category);
}

export function formatPlanPrice(priceInCents: number): string {
  return `$${(priceInCents / 100).toFixed(2)}`;
}

// Group plans by category for display
export function getGroupedPlans() {
  const groups: Record<string, { label: string; plans: BillingPlan[] }> = {
    'Semaglutide Monthly Plans': {
      label: 'Semaglutide Monthly Plans',
      plans: getPlansByCategory('semaglutide_monthly')
    },
    'Semaglutide Single Month': {
      label: 'Semaglutide Single Month Purchase',
      plans: getPlansByCategory('semaglutide_single')
    },
    'Semaglutide 3 Month Promo': {
      label: 'Semaglutide 3 Month Promo',
      plans: getPlansByCategory('semaglutide_3month')
    },
    'Tirzepatide Monthly Plans': {
      label: 'Tirzepatide Monthly Plans',
      plans: getPlansByCategory('tirzepatide_monthly')
    },
    'Tirzepatide Single Month': {
      label: 'Tirzepatide Single Month Purchase',
      plans: getPlansByCategory('tirzepatide_single')
    },
    'Tirzepatide 3 Month': {
      label: 'Tirzepatide 3 Month Packages',
      plans: getPlansByCategory('tirzepatide_3month')
    },
    'Bloodwork': {
      label: 'Bloodwork',
      plans: getPlansByCategory('bloodwork')
    },
    'Additional Treatments': {
      label: 'Additional Monthly Treatments',
      plans: getPlansByCategory('additional_treatments')
    }
  };
  return groups;
}
