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
          <InputField
            name="shippingAddress.firstName"
            placeholder="First name"
            type="text"
          />
          <InputField
            name="shippingAddress.lastName"
            placeholder="Last name"
            type="text"
          />
        </div>

        <InputField
          name="shippingAddress.address"
          placeholder="Address"
          type="text"
        />

        <InputField
          name="shippingAddress.apt"
          placeholder="Apt / Floor / Suite (optional)"
          type="text"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <InputField
            name="shippingAddress.city"
            placeholder="City"
            type="text"
          />
          <SelectField
            name="shippingAddress.state"
            options={US_STATES.map((state) => ({
              value: state.value,
              label: state.label,
            }))}
            placeholder="State"
          />
          <InputField
            name="shippingAddress.zipCode"
            placeholder="Zip Code"
            type="text"
          />
        </div>
      </div>
    </div>
  );
}
