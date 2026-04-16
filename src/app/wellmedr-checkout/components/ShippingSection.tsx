'use client';

import InputField from '@/app/wellmedr-checkout/components/ui/InputField';
import SelectField from '@/app/wellmedr-checkout/components/ui/SelectField';
import { US_STATES } from '@/app/wellmedr-checkout/data/us-states';

export default function ShippingSection() {
  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-center">Shipping Address</h3>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <InputField name="shippingAddress.firstName" label="First name" placeholder="First name" type="text" />
          <InputField name="shippingAddress.lastName" label="Last name" placeholder="Last name" type="text" />
        </div>

        <InputField name="shippingAddress.address" label="Address" placeholder="Address" type="text" />

        <InputField
          name="shippingAddress.apt"
          label="Apt / Floor / Suite"
          placeholder="Apt / Floor / Suite (optional)"
          type="text"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InputField name="shippingAddress.city" label="City" placeholder="City" type="text" />
          <SelectField
            name="shippingAddress.state"
            label="State"
            options={US_STATES.map((state) => ({
              value: state.value,
              label: state.label,
            }))}
            placeholder="State"
          />
          <InputField name="shippingAddress.zipCode" label="Zip Code" placeholder="Zip Code" type="text" />
        </div>
      </div>
    </div>
  );
}
