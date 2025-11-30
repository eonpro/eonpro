'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin, Search, X } from 'lucide-react';

// US States for dropdown
export const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }, { code: 'DC', name: 'District of Columbia' },
];

export interface AddressData {
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  formattedAddress?: string;
}

interface AddressAutocompleteProps {
  value: AddressData;
  onChange: (address: AddressData) => void;
  required?: boolean;
  disabled?: boolean;
  showAddress2?: boolean;
  label?: string;
  className?: string;
  compact?: boolean; // Single line mode for smaller forms
}

export default function AddressAutocomplete({
  value,
  onChange,
  required = false,
  disabled = false,
  showAddress2 = true,
  label = 'Address',
  className = '',
  compact = false,
}: AddressAutocompleteProps) {
  const addressInputRef = useRef<HTMLInputElement>(null);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [autocomplete, setAutocomplete] = useState<any>(null);

  // Check if Google Maps is loaded
  useEffect(() => {
    const checkGoogleMaps = () => {
      if (typeof window !== 'undefined' && (window as any).google?.maps?.places) {
        setIsGoogleLoaded(true);
        return true;
      }
      return false;
    };

    if (checkGoogleMaps()) return;

    // Poll for Google Maps to be loaded
    const interval = setInterval(() => {
      if (checkGoogleMaps()) {
        clearInterval(interval);
      }
    }, 500);

    // Timeout after 10 seconds
    const timeout = setTimeout(() => {
      clearInterval(interval);
    }, 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  // Initialize autocomplete when Google Maps is loaded
  useEffect(() => {
    if (!isGoogleLoaded || !addressInputRef.current || autocomplete) return;

    try {
      const newAutocomplete = new (window as any).google.maps.places.Autocomplete(
        addressInputRef.current,
        {
          componentRestrictions: { country: 'us' },
          fields: ['address_components', 'formatted_address', 'geometry'],
          types: ['address'],
        }
      );

      newAutocomplete.addListener('place_changed', () => {
        const place = newAutocomplete.getPlace();
        if (place.address_components) {
          const addressData = parseAddressComponents(place.address_components);
          addressData.formattedAddress = place.formatted_address;
          onChange(addressData);
        }
      });

      setAutocomplete(newAutocomplete);
    } catch (error) {
      console.error('Error initializing Google Maps Autocomplete:', error);
    }
  }, [isGoogleLoaded, onChange, autocomplete]);

  // Parse Google address components into our format
  const parseAddressComponents = (components: any[]): AddressData => {
    let streetNumber = '';
    let streetName = '';
    let city = '';
    let state = '';
    let zip = '';
    let country = '';

    components.forEach((component: any) => {
      const types = component.types;
      if (types.includes('street_number')) {
        streetNumber = component.long_name;
      }
      if (types.includes('route')) {
        streetName = component.long_name;
      }
      if (types.includes('locality')) {
        city = component.long_name;
      }
      if (types.includes('sublocality_level_1') && !city) {
        city = component.long_name;
      }
      if (types.includes('administrative_area_level_1')) {
        state = component.short_name;
      }
      if (types.includes('postal_code')) {
        zip = component.long_name;
      }
      if (types.includes('country')) {
        country = component.short_name;
      }
    });

    return {
      address1: `${streetNumber} ${streetName}`.trim(),
      address2: value.address2 || '',
      city,
      state,
      zip,
      country,
    };
  };

  const handleFieldChange = (field: keyof AddressData, newValue: string) => {
    onChange({ ...value, [field]: newValue });
  };

  const clearAddress = () => {
    onChange({
      address1: '',
      address2: '',
      city: '',
      state: '',
      zip: '',
    });
    if (addressInputRef.current) {
      addressInputRef.current.value = '';
    }
  };

  // Compact single-line mode
  if (compact) {
    return (
      <div className={className}>
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            ref={addressInputRef}
            type="text"
            required={required}
            disabled={disabled}
            defaultValue={value.formattedAddress || `${value.address1}${value.city ? `, ${value.city}` : ''}${value.state ? `, ${value.state}` : ''} ${value.zip}`.trim()}
            placeholder="Start typing an address..."
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          {(value.address1 || value.city) && (
            <button
              type="button"
              onClick={clearAddress}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {!isGoogleLoaded && (
          <p className="text-xs text-amber-600 mt-1">
            Loading address autocomplete...
          </p>
        )}
      </div>
    );
  }

  // Full address form mode
  return (
    <div className={`space-y-4 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Street Address with Autocomplete */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Street Address {required && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            ref={addressInputRef}
            type="text"
            required={required}
            disabled={disabled}
            value={value.address1}
            onChange={(e) => handleFieldChange('address1', e.target.value)}
            placeholder="Start typing an address..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>
        {!isGoogleLoaded && (
          <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
            <Search className="h-3 w-3 animate-pulse" />
            Loading address autocomplete...
          </p>
        )}
      </div>

      {/* Address Line 2 */}
      {showAddress2 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Apt, Suite, Unit (Optional)
          </label>
          <input
            type="text"
            disabled={disabled}
            value={value.address2 || ''}
            onChange={(e) => handleFieldChange('address2', e.target.value)}
            placeholder="Apartment, suite, unit, etc."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>
      )}

      {/* City, State, ZIP */}
      <div className="grid grid-cols-6 gap-4">
        <div className="col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            City {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            required={required}
            disabled={disabled}
            value={value.city}
            onChange={(e) => handleFieldChange('city', e.target.value)}
            placeholder="City"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>

        <div className="col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            State {required && <span className="text-red-500">*</span>}
          </label>
          <select
            required={required}
            disabled={disabled}
            value={value.state}
            onChange={(e) => handleFieldChange('state', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">--</option>
            {US_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.code}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ZIP Code {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            required={required}
            disabled={disabled}
            value={value.zip}
            onChange={(e) => handleFieldChange('zip', e.target.value.replace(/\D/g, '').slice(0, 5))}
            placeholder="12345"
            maxLength={5}
            pattern="[0-9]{5}"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  );
}

// Export a simpler inline version for quick use
export function AddressInput({
  value,
  onChange,
  placeholder = 'Enter address...',
  required = false,
  disabled = false,
  className = '',
}: {
  value: string;
  onChange: (address: string, parsed?: AddressData) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);

  useEffect(() => {
    const checkGoogleMaps = () => {
      if (typeof window !== 'undefined' && (window as any).google?.maps?.places) {
        setIsGoogleLoaded(true);
        return true;
      }
      return false;
    };

    if (checkGoogleMaps()) return;

    const interval = setInterval(() => {
      if (checkGoogleMaps()) clearInterval(interval);
    }, 500);

    const timeout = setTimeout(() => clearInterval(interval), 10000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!isGoogleLoaded || !inputRef.current) return;

    try {
      const autocomplete = new (window as any).google.maps.places.Autocomplete(
        inputRef.current,
        {
          componentRestrictions: { country: 'us' },
          fields: ['address_components', 'formatted_address'],
          types: ['address'],
        }
      );

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.formatted_address) {
          onChange(place.formatted_address, parseComponents(place.address_components));
        }
      });
    } catch (error) {
      console.error('Error initializing autocomplete:', error);
    }
  }, [isGoogleLoaded, onChange]);

  const parseComponents = (components: any[]): AddressData => {
    let streetNumber = '';
    let streetName = '';
    let city = '';
    let state = '';
    let zip = '';

    components?.forEach((c: any) => {
      if (c.types.includes('street_number')) streetNumber = c.long_name;
      if (c.types.includes('route')) streetName = c.long_name;
      if (c.types.includes('locality')) city = c.long_name;
      if (c.types.includes('administrative_area_level_1')) state = c.short_name;
      if (c.types.includes('postal_code')) zip = c.long_name;
    });

    return { address1: `${streetNumber} ${streetName}`.trim(), city, state, zip };
  };

  return (
    <div className={`relative ${className}`}>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-gray-100"
      />
    </div>
  );
}
