'use client';

import { useState, useCallback, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import InputField from '@/app/wellmedr-checkout/components/ui/InputField';
import SelectField from '@/app/wellmedr-checkout/components/ui/SelectField';
import AddressAutocompleteField from '@/app/wellmedr-checkout/components/ui/AddressAutocompleteField';
import { US_STATES } from '@/app/wellmedr-checkout/data/us-states';
import { CheckoutFormData } from '@/app/wellmedr-checkout/types/checkout';

export default function BillingSection() {
  const { watch, setValue, getValues } = useFormContext<CheckoutFormData>();
  const [fieldsLocked, setFieldsLocked] = useState(false);

  const billingAddressSameAsShipment = watch('shippingAddress.billingAddressSameAsShipment');

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
      setFieldsLocked(false);
    }
  }, [billingAddressSameAsShipment, setValue, getValues]);

  const handlePlaceSelected = useCallback(() => {
    setFieldsLocked(true);
  }, []);

  const handleUnlock = useCallback(() => {
    setFieldsLocked(false);
  }, []);

  if (billingAddressSameAsShipment) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-center">Billing Address</h3>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <InputField
            name="billingAddress.firstName"
            label="First name"
            placeholder="First name"
            type="text"
            autoComplete="off"
          />
          <InputField
            name="billingAddress.lastName"
            label="Last name"
            placeholder="Last name"
            type="text"
            autoComplete="off"
          />
        </div>

        <AddressAutocompleteField
          fieldPrefix="billingAddress"
          label="Address"
          placeholder="Start typing your address..."
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
          name="billingAddress.apt"
          label="Apt / Unit / Suite"
          placeholder="Apt, Unit, Suite, Floor #"
          type="text"
          autoComplete="off"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InputField
            name="billingAddress.city"
            label="City"
            placeholder="City"
            type="text"
            autoComplete="off"
            readOnly={fieldsLocked}
          />
          <SelectField
            name="billingAddress.state"
            label="State"
            options={US_STATES.map((state) => ({
              value: state.value,
              label: state.label,
            }))}
            placeholder="State"
            disabled={fieldsLocked}
          />
          <InputField
            name="billingAddress.zipCode"
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
