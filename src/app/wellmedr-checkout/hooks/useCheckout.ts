'use client';

import { useMemo, useCallback, useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  CheckoutFormData,
  Plan,
  MedicationType,
  PlanOptions,
  ProductNameType,
  ProductType,
  SelectedProductType,
  AddonId,
} from '@/app/wellmedr-checkout/types/checkout';
import { useProducts } from '@/app/wellmedr-checkout/providers/ProductsProvider';
import { getAddonTotal } from '@/app/wellmedr-checkout/data/addons';

export interface UseCheckoutReturn {
  selectedProduct: SelectedProductType | null;
  selectedPlan: PlanOptions;
  selectedAddons: AddonId[];
  plans: Plan[];
  products: Record<ProductNameType, ProductType>;
  addonTotal: number;
  handleProductSelect: (
    productName: ProductNameType,
    medicationType: MedicationType,
  ) => void;
  handlePlanSelect: (planId: PlanOptions) => void;
  handleAddonToggle: (addonId: AddonId) => void;
}

export function useCheckout(): UseCheckoutReturn {
  const { setValue, control } = useFormContext<CheckoutFormData>();
  const { products, getStripePriceId } = useProducts();

  // Selected product and plan states watched from the form context
  const selectedProduct = useWatch({
    control,
    name: 'selectedProduct',
  }) as SelectedProductType | null;
  const selectedPlan = useWatch({
    control,
    name: 'selectedPlan',
  }) as PlanOptions;
  const selectedAddons = useWatch({
    control,
    name: 'selectedAddons',
  }) as AddonId[];

  // Generate plans based on selected product
  const plans = useMemo(() => {
    if (!selectedProduct || !products) return [];
    const product = products[selectedProduct.name];
    if (!product) return [];

    const medicationType = selectedProduct.medicationType;
    const medicationName = selectedProduct.name;

    const monthlyPrice = product.pricing[medicationType].monthlyPrice;
    const quarterlyPrice = product.pricing[medicationType].quarterlyPrice;

    const sixMonthPrice = product.pricing[medicationType].sixMonthPrice || 0;
    const annualPrice = product.pricing[medicationType].annualPrice || 0;

    const basePrice = monthlyPrice + 100;
    const savingsQuarterly = basePrice * 3 - quarterlyPrice;
    const savingsSixMonth = basePrice * 6 - sixMonthPrice;
    const savingsAnnual = basePrice * 12 - annualPrice;

    const stripeMonthlyId = getStripePriceId(medicationName, medicationType, 'monthly');
    const stripeQuarterlyId = getStripePriceId(medicationName, medicationType, 'quarterly');
    const stripeSixMonthId = getStripePriceId(medicationName, medicationType, 'sixMonth');
    const stripeAnnualId = getStripePriceId(medicationName, medicationType, 'annual');

    const generatedPlans: Plan[] = [];

    generatedPlans.push({
      id: stripeMonthlyId,
      plan_type: 'monthly',
      title: 'MONTHLY PLAN',
      totalPayToday: monthlyPrice,
      monthlyPrice,
    });

    generatedPlans.push({
      id: stripeQuarterlyId,
      plan_type: 'quarterly',
      title: '3-MONTH PLAN',
      totalPayToday: quarterlyPrice,
      monthlyPrice: Math.floor(quarterlyPrice / 3),
      originalPrice: basePrice,
      savings: savingsQuarterly,
    });

    if (sixMonthPrice) {
      generatedPlans.push({
        id: stripeSixMonthId,
        plan_type: 'sixMonth',
        title: '6-MONTH PLAN',
        totalPayToday: sixMonthPrice,
        monthlyPrice: Math.floor(sixMonthPrice / 6),
        originalPrice: basePrice,
        savings: savingsSixMonth,
      });
    }

    if (annualPrice) {
      generatedPlans.push({
        id: stripeAnnualId,
        plan_type: 'annual',
        title: '12-MONTH PLAN',
        totalPayToday: annualPrice,
        monthlyPrice: Math.floor(annualPrice / 12),
        originalPrice: basePrice,
        savings: savingsAnnual,
        isBestValue: true,
      });
    }

    return generatedPlans;
  }, [selectedProduct, products, getStripePriceId]);

  // Update form when plans change and ensure selectedPlan is set
  useEffect(() => {
    if (plans.length > 0) {
      if (!selectedPlan || !plans.find((p) => p.id === selectedPlan)) {
        const defaultPlan = plans[0];
        setValue('planDetails', defaultPlan);
        setValue('selectedPlan', defaultPlan.id);
      } else {
        const currentPlanDetails = plans.find(
          (plan) => plan.id === selectedPlan,
        );
        if (currentPlanDetails) {
          setValue('planDetails', currentPlanDetails);
        }
      }
    }
  }, [plans, selectedPlan, setValue]);

  const handleProductSelect = useCallback(
    (productName: ProductNameType, medicationType: MedicationType) => {
      const newSelectedProduct = {
        name: productName,
        medicationType,
      };
      setValue('selectedProduct', newSelectedProduct);
      // Reset plan selection when product changes
      setValue('selectedPlan', '');
      setValue('planDetails', null);
    },
    [setValue],
  );

  const handlePlanSelect = useCallback(
    (planId: PlanOptions) => {
      setValue('selectedPlan', planId);

      const selectedPlanDetails = plans.find((plan) => plan.id === planId);
      if (selectedPlanDetails) {
        setValue('planDetails', selectedPlanDetails);
      }
    },
    [setValue, plans],
  );

  const handleAddonToggle = useCallback(
    (addonId: AddonId) => {
      const current = selectedAddons || [];

      if (addonId === 'elite_bundle') {
        if (current.includes('elite_bundle')) {
          setValue('selectedAddons', []);
        } else {
          setValue('selectedAddons', ['elite_bundle']);
        }
        return;
      }

      // Toggling an individual addon
      if (current.includes('elite_bundle')) {
        // Switching from bundle to individual: remove bundle, add all except toggled
        const individuals: AddonId[] = ['nad_plus', 'sermorelin', 'b12'];
        setValue(
          'selectedAddons',
          individuals.filter((id) => id !== addonId),
        );
        return;
      }

      let next: AddonId[];
      if (current.includes(addonId)) {
        next = current.filter((id) => id !== addonId);
      } else {
        next = [...current, addonId];
      }
      setValue('selectedAddons', next);
    },
    [selectedAddons, setValue],
  );

  const addonTotal = useMemo(
    () => getAddonTotal(selectedAddons || []),
    [selectedAddons],
  );

  return {
    selectedProduct,
    selectedPlan,
    selectedAddons: selectedAddons || [],
    plans,
    products,
    addonTotal,
    handleProductSelect,
    handlePlanSelect,
    handleAddonToggle,
  };
}
