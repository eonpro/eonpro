'use client';

import { useState, useCallback } from 'react';
import InputField from '@/app/wellmedr-checkout/components/ui/InputField';
import SelectField from '@/app/wellmedr-checkout/components/ui/SelectField';
import AddressAutocompleteField from '@/app/wellmedr-checkout/components/ui/AddressAutocompleteField';
import { US_STATES } from '@/app/wellmedr-checkout/data/us-states';

export default function ShippingSection() {
  const [fieldsLocked, setFieldsLocked] = useState(false);

  const handlePlaceSelected = useCallback(() => {
    setFieldsLocked(true);
  }, []);

  const handleUnlock = useCallback(() => {
    setFieldsLocked(false);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-2xl font-bold" style={{ color: '#101010' }}>Shipping Address</h3>
        <p className="mt-1 text-sm" style={{ color: '#666' }}>Where should we send your order?</p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <InputField name="shippingAddress.firstName" label="First name" placeholder="First name" type="text" autoComplete="off" />
          <InputField name="shippingAddress.lastName" label="Last name" placeholder="Last name" type="text" autoComplete="off" />
        </div>

        <AddressAutocompleteField
          fieldPrefix="shippingAddress"
          label="Start typing your address"
          placeholder="Enter your street address"
          onPlaceSelected={handlePlaceSelected}
        />

        {fieldsLocked && (
          <button
            type="button"
            onClick={handleUnlock}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            Edit city, state &amp; zip manually
          </button>
        )}

        <InputField
          name="shippingAddress.apt"
          label="Apt / Unit / Suite"
          placeholder="Apt, Unit, Suite, Floor #"
          type="text"
          autoComplete="off"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InputField
            name="shippingAddress.city"
            label="City"
            placeholder="City"
            type="text"
            autoComplete="off"
            readOnly={fieldsLocked}
          />
          <SelectField
            name="shippingAddress.state"
            label="State"
            options={US_STATES.map((state) => ({
              value: state.value,
              label: state.label,
            }))}
            placeholder="State"
            disabled={fieldsLocked}
          />
          <InputField
            name="shippingAddress.zipCode"
            label="Zip Code"
            placeholder="Zip Code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            readOnly={fieldsLocked}
          />
        </div>
      </div>
    </div>
  );
}
