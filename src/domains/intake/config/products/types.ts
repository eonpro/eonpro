export interface DoseOption {
  id: string;
  name: string;
  strength: string;
  description: string;
  priceModifier?: number;
  isStarterDose?: boolean;
  isMaintenanceDose?: boolean;
  isAdvanced?: boolean;
  requiresPriorExperience?: boolean;
}

export interface PlanOption {
  id: string;
  type: 'monthly' | '3month' | '6month' | 'onetime';
  nameEn: string;
  nameEs: string;
  price: number;
  billing: 'monthly' | 'total' | 'once';
  savings?: number;
  badge?: string;
  badgeEs?: string;
  stripePriceId: string;
  stripePriceIdTest?: string;
}

export interface AddonConfig {
  id: string;
  nameEn: string;
  nameEs: string;
  descriptionEn: string;
  descriptionEs: string;
  basePrice: number;
  icon: 'pill' | 'flame' | 'heart' | 'shield' | 'star';
  hasDuration?: boolean;
  stripePriceId: string;
  stripePriceIdTest?: string;
}

export interface BrandingConfig {
  primaryColor: string;
  secondaryColor?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  faviconUrl?: string;
}

export interface IntegrationConfig {
  intakeqTags: string[];
  intakeqFolderType?: string;
  ghlTags: string[];
  ghlPipelineId?: string;
  ghlStageId?: string;
  airtableBaseId?: string;
  airtableTableId?: string;
}

export interface TranslationOverrides {
  en?: Record<string, string>;
  es?: Record<string, string>;
}

export interface DosePlanOption {
  id: string;
  type: 'monthly' | '3month' | '6month' | 'onetime';
  nameEn: string;
  nameEs: string;
  price: number;
  billing: 'monthly' | 'total' | 'once';
  savings?: number;
  badge?: string;
  badgeEs?: string;
  stripePriceId: string;
  stripePriceIdTest?: string;
}

export interface DoseWithPlans extends DoseOption {
  plans: DosePlanOption[];
}

export interface ProductConfig {
  id: string;
  name: string;
  category: 'glp1' | 'hormone' | 'hairloss' | 'skincare' | 'wellness' | 'other';

  taglineEn: string;
  taglineEs: string;
  descriptionEn: string;
  descriptionEs: string;
  efficacy?: string;
  efficacyEs?: string;

  doses?: DoseOption[];
  plans?: PlanOption[];
  dosesWithPlans?: DoseWithPlans[];

  addons: AddonConfig[];

  showDoseSelection: boolean;
  showMedicationComparison: boolean;
  defaultDoseId?: string;
  defaultPlanId?: string;

  branding: BrandingConfig;
  integrations: IntegrationConfig;
  translations?: TranslationOverrides;

  features?: {
    enablePromoCode?: boolean;
    enableExpeditedShipping?: boolean;
    enableAddons?: boolean;
    requiresQualification?: boolean;
  };
}

export type ProductId = 'semaglutide' | 'tirzepatide' | 'testosterone' | 'hairloss' | 'skincare';

export type ProductRegistry = {
  [K in ProductId]?: () => Promise<{ default: ProductConfig }>;
};
