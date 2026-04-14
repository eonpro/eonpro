import type { ProductConfig } from './types';

const semaglutideConfig: ProductConfig = {
  id: 'semaglutide',
  name: 'Semaglutide',
  category: 'glp1',

  taglineEn: 'Weekly GLP-1 injection for weight management',
  taglineEs: 'Inyección semanal GLP-1 para control de peso',
  descriptionEn:
    'Semaglutide is a proven GLP-1 receptor agonist that helps regulate appetite and blood sugar levels, leading to sustainable weight loss.',
  descriptionEs:
    'Semaglutide es un agonista del receptor GLP-1 probado que ayuda a regular el apetito y los niveles de azúcar en sangre, lo que lleva a una pérdida de peso sostenible.',
  efficacy: '15-20% weight loss',
  efficacyEs: '15-20% pérdida de peso',

  dosesWithPlans: [
    {
      id: 'sema-2.5-5',
      name: 'Starter Dose',
      strength: '2.5mg-5mg',
      description:
        'Recommended for patients new to GLP-1 medications. Allows your body to adjust gradually.',
      isStarterDose: true,
      plans: [
        {
          id: 'sema_2.5-5_monthly',
          type: 'monthly',
          nameEn: 'Monthly Subscription',
          nameEs: 'Suscripción Mensual',
          price: 229,
          billing: 'monthly',
          badge: 'Most Popular',
          badgeEs: 'Más Popular',
          stripePriceId:
            process.env.NEXT_PUBLIC_STRIPE_PRICE_SEMA_LOW_MONTHLY || 'price_sema_low_monthly',
        },
        {
          id: 'sema_2.5-5_single',
          type: 'onetime',
          nameEn: 'Single Month',
          nameEs: 'Mes Único',
          price: 299,
          billing: 'once',
          stripePriceId:
            process.env.NEXT_PUBLIC_STRIPE_PRICE_SEMA_LOW_SINGLE || 'price_sema_low_single',
        },
        {
          id: 'sema_2.5-5_3month',
          type: '3month',
          nameEn: '3 Month Package',
          nameEs: 'Paquete de 3 Meses',
          price: 549,
          billing: 'total',
          savings: 138,
          badge: 'Save $138',
          badgeEs: 'Ahorra $138',
          stripePriceId:
            process.env.NEXT_PUBLIC_STRIPE_PRICE_SEMA_LOW_3MONTH || 'price_sema_low_3month',
        },
      ],
    },
    {
      id: 'sema-5-10',
      name: 'Higher Dose',
      strength: '5mg-10mg',
      description:
        'For patients who have completed the starter dose and need to continue their weight loss journey.',
      isMaintenanceDose: true,
      plans: [
        {
          id: 'sema_5-10_monthly',
          type: 'monthly',
          nameEn: 'Monthly Subscription',
          nameEs: 'Suscripción Mensual',
          price: 349,
          billing: 'monthly',
          badge: 'Most Popular',
          badgeEs: 'Más Popular',
          stripePriceId:
            process.env.NEXT_PUBLIC_STRIPE_PRICE_SEMA_HIGH_MONTHLY || 'price_sema_high_monthly',
        },
        {
          id: 'sema_5-10_single',
          type: 'onetime',
          nameEn: 'Single Month',
          nameEs: 'Mes Único',
          price: 399,
          billing: 'once',
          stripePriceId:
            process.env.NEXT_PUBLIC_STRIPE_PRICE_SEMA_HIGH_SINGLE || 'price_sema_high_single',
        },
        {
          id: 'sema_5-10_3month',
          type: '3month',
          nameEn: '3 Month Package',
          nameEs: 'Paquete de 3 Meses',
          price: 749,
          billing: 'total',
          savings: 298,
          badge: 'Save $298',
          badgeEs: 'Ahorra $298',
          stripePriceId:
            process.env.NEXT_PUBLIC_STRIPE_PRICE_SEMA_HIGH_3MONTH || 'price_sema_high_3month',
        },
      ],
    },
  ],

  addons: [
    {
      id: 'nausea-rx',
      nameEn: 'Nausea Relief Prescription',
      nameEs: 'Prescripción para Alivio de Náuseas',
      descriptionEn: 'Prescription medication to manage GLP-1 side effects',
      descriptionEs: 'Medicamento recetado para manejar los efectos secundarios de GLP-1',
      basePrice: 39,
      icon: 'pill',
      hasDuration: true,
      stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_NAUSEA || 'price_nausea_relief',
      stripePriceIdTest: 'price_test_nausea_relief',
    },
    {
      id: 'fat-burner',
      nameEn: 'Fat Burner (L-Carnitine + B Complex)',
      nameEs: 'Quemador de Grasa (L-Carnitina + Complejo B)',
      descriptionEn: 'Boost metabolism and energy during weight loss',
      descriptionEs: 'Aumenta el metabolismo y la energía durante la pérdida de peso',
      basePrice: 99,
      icon: 'flame',
      hasDuration: true,
      stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_FATBURNER || 'price_fat_burner',
      stripePriceIdTest: 'price_test_fat_burner',
    },
  ],

  showDoseSelection: true,
  showMedicationComparison: false,
  defaultDoseId: 'sema-2.5-5',
  defaultPlanId: 'sema_2.5-5_monthly',

  branding: {
    primaryColor: '#10B981',
    secondaryColor: '#059669',
  },

  integrations: {
    intakeqTags: ['#weightloss', 'semaglutide'],
    intakeqFolderType: 'INTAKE INFORMATION',
    ghlTags: ['semaglutide', 'glp1', 'weight-loss'],
  },

  features: {
    enablePromoCode: true,
    enableExpeditedShipping: true,
    enableAddons: true,
    requiresQualification: true,
  },
};

export default semaglutideConfig;
