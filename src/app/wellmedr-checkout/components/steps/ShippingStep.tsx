'use client';

import { useFormContext } from 'react-hook-form';
import ShippingSection from '../ShippingSection';
import BillingSection from '../BillingSection';
import CheckboxField from '@/app/wellmedr-checkout/components/ui/CheckboxField';
import Button from '@/app/wellmedr-checkout/components/ui/button/Button';
import { CheckoutFormData } from '@/app/wellmedr-checkout/types/checkout';
import { useCheckoutStep } from '@/app/wellmedr-checkout/providers/CheckoutStepProvider';

interface ShippingStepProps {
  uid: string;
}

export default function ShippingStep({ uid: _uid }: ShippingStepProps) {
  const { trigger, watch, getValues } = useFormContext<CheckoutFormData>();
  const { goToNextStep } = useCheckoutStep();

  const isBillingSameAsShipping = watch(
    'shippingAddress.billingAddressSameAsShipment',
  );

  const handleContinue = async () => {
    // Fields to validate
    const shippingFields = [
      'shippingAddress.firstName',
      'shippingAddress.lastName',
      'shippingAddress.address',
      'shippingAddress.city',
      'shippingAddress.state',
      'shippingAddress.zipCode',
    ] as const;

    const billingFields = [
      'billingAddress.firstName',
      'billingAddress.lastName',
      'billingAddress.address',
      'billingAddress.city',
      'billingAddress.state',
      'billingAddress.zipCode',
    ] as const;

    // Validate shipping fields first
    const isShippingValid = await trigger([...shippingFields]);

    // If billing is different from shipping, validate billing fields too
    let isBillingValid = true;
    if (!isBillingSameAsShipping) {
      isBillingValid = await trigger([...billingFields]);
    }

    if (isShippingValid && isBillingValid) {
      // GTM add_shipping_info event (GA4 standard ecommerce)
      const formData = getValues();
      if (formData.planDetails && formData.selectedProduct) {
        if (typeof window !== 'undefined' && (window as any).dataLayer) {
          (window as any).dataLayer.push({
            event: 'add_shipping_info',
            ecommerce: {
              currency: 'USD',
              value: formData.planDetails.totalPayToday,
              shipping_tier: 'standard',
              items: [
                {
                  item_id: formData.planDetails.id,
                  item_name: `${formData.selectedProduct.name} - ${formData.selectedProduct.medicationType}`,
                  price: formData.planDetails.totalPayToday,
                  quantity: 1,
                },
              ],
            },
          });
        }
      }
      goToNextStep();
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleContinue();
      }}
      className="w-full flex flex-col gap-8 max-w-3xl mx-auto pt-2 sm:pt-8 pb-6"
    >
      <ShippingSection />
      <div className="w-full">
        <CheckboxField
          name="shippingAddress.billingAddressSameAsShipment"
          label="Shipping and billing address are the same"
        />
      </div>
      <BillingSection />
      <Button onClick={handleContinue} text="Continue to Payment" />
    </form>
  );
}
