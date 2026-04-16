'use client';

import InputField from '@/app/wellmedr-checkout/components/ui/InputField';
import SelectField from '@/app/wellmedr-checkout/components/ui/SelectField';
import { US_STATES } from '@/app/wellmedr-checkout/data/us-states';
import { CheckoutFormData } from '@/app/wellmedr-checkout/types/checkout';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';

export default function BillingSection() {
  const { watch, setValue, getValues } = useFormContext<CheckoutFormData>();

  const billingAddressSameAsShipment = watch('shippingAddress.billingAddressSameAsShipment');

  // Sync billing address when checkbox is toggled
  useEffect(() => {
    if (billingAddressSameAsShipment) {
      const shipping = getValues('shippingAddress');
      setValue('billingAddress', {
        firstName: shipping.firstName,
        lastName: shipping.lastName,
        address: shipping.address,
        apt: shipping.apt || '',
        city: shipping.city,
        state: shipping.state,
        zipCode: shipping.zipCode,
      });
    } else {
      setValue('billingAddress', {
        firstName: '',
        lastName: '',
        address: '',
        apt: '',
        city: '',
        state: '',
        zipCode: '',
      });
    }
  }, [billingAddressSameAsShipment, setValue, getValues]);

  if (billingAddressSameAsShipment) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-center">Billing Address</h3>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <InputField name="billingAddress.firstName" label="First name" placeholder="First name" type="text" />
          <InputField name="billingAddress.lastName" label="Last name" placeholder="Last name" type="text" />
        </div>

        <InputField name="billingAddress.address" label="Address" placeholder="Address" type="text" />

        <InputField
          name="billingAddress.apt"
          label="Apt / Floor / Suite"
          placeholder="Apt / Floor / Suite (optional)"
          type="text"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InputField name="billingAddress.city" label="City" placeholder="City" type="text" />
          <SelectField
            name="billingAddress.state"
            label="State"
            options={US_STATES.map((state) => ({
              value: state.value,
              label: state.label,
            }))}
            placeholder="State"
          />
          <InputField name="billingAddress.zipCode" label="Zip Code" placeholder="Zip Code" type="text" />
        </div>
      </div>
    </div>
  );
}
