import { StateAbbreviation } from '@/app/wellmedr-checkout/lib/states';
import { StaticImageData } from 'next/image';

// Product Types
export type ProductNameType = 'semaglutide' | 'tirzepatide';
export type MedicationType = 'injections' | 'tablets';

// Add-on Types
export type AddonId = 'nad_plus' | 'sermorelin' | 'b12' | 'elite_bundle';

export interface AddonProduct {
  id: AddonId;
  name: string;
  description: string;
  monthlyPrice: number;
  isBundle: boolean;
  bundledAddonIds?: AddonId[];
}

type PricingTier = {
  monthlyPrice: number;
  quarterlyPrice: number;
  sixMonthPrice?: number;
  annualPrice?: number;
  image: string | StaticImageData;
  noBgImage: string | StaticImageData;
  rotatedImage: string | StaticImageData;
};

export type PlanType = 'monthly' | 'quarterly' | 'sixMonth' | 'annual';

export type Pricing = {
  injections: PricingTier;
  tablets: PricingTier;
};

export type ProductType = {
  pricing: Pricing;
  badgeText: string;
  additionalFeatures?: string[];
};

export type SelectedProductType = {
  name: ProductNameType;
  medicationType: MedicationType;
};

export type PlanOptions = string;

export type Plan = {
  id: PlanOptions;
  plan_type: PlanType;
  title: string;
  totalPayToday: number;
  monthlyPrice: number;
  originalPrice?: number;
  savings?: number;
  isBestValue?: boolean;
};

// Address Types
export type ShippingAddress = {
  firstName: string;
  lastName: string;
  address: string;
  apt?: string;
  city: string;
  state: StateAbbreviation | '';
  zipCode: string;
  billingAddressSameAsShipment: boolean;
};

export type BillingAddress = {
  firstName: string;
  lastName: string;
  address: string;
  apt?: string;
  city: string;
  state: StateAbbreviation | '';
  zipCode: string;
};

// Checkout Form Data
export type CheckoutFormData = {
  // Product & Plan
  selectedProduct: SelectedProductType | null;
  selectedPlan: PlanOptions;
  planDetails: Plan | null;

  // Add-ons
  selectedAddons: AddonId[];

  // Addresses
  shippingAddress: ShippingAddress;
  billingAddress: BillingAddress;

  // Payment
  cardholderName: string;

  // Promo Code
  promoCode?: string;
  promotionCodeId?: string;
  discountPercentage?: number;
  discountAmount?: number;

  // Patient Data (optional, from Fillout)
  weight?: number;
  goalWeight?: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  state?: string;
  bmi?: number;
  dateOfBirth?: string;
  sex?: string;
  formTarget?: string;
};
