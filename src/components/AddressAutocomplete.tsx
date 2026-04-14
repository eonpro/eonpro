'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, X } from 'lucide-react';

export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
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

// ────────────────────────────────────────────────────────────────────────────
// Legacy Places Autocomplete helpers
// Uses google.maps.places.Autocomplete widget which works with the standard
// "Places API" (not "Places API New").
// ────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

const AUTOCOMPLETE_OPTIONS = {
  componentRestrictions: { country: 'us' },
  fields: ['address_components', 'formatted_address'],
  types: ['address'],
};

function isGoogleReady(): boolean {
  return typeof window !== 'undefined' && !!(window as any).google?.maps?.places?.Autocomplete;
}

export function useGooglePlacesReady() {
  const [ready, setReady] = useState(isGoogleReady);
  const importAttempted = useRef(false);

  useEffect(() => {
    if (ready) return;
    const interval = setInterval(() => {
      if (isGoogleReady()) {
        setReady(true);
        clearInterval(interval);
        return;
      }
      // If google.maps exists but places doesn't, try importLibrary (loading=async compat)
      const g = (window as any).google;
      if (g?.maps?.importLibrary && !g.maps.places?.Autocomplete && !importAttempted.current) {
        importAttempted.current = true;
        g.maps
          .importLibrary('places')
          .then(() => {
            if (isGoogleReady()) {
              setReady(true);
              clearInterval(interval);
            }
          })
          .catch(() => {});
      }
    }, 500);
    const timeout = setTimeout(() => clearInterval(interval), 15_000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [ready]);

  return ready;
}

function extractZipFromFormatted(formatted: string): string {
  const match = formatted.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : '';
}

function parseAddressComponents(
  components: any[],
  preserveAddress2?: string,
  formattedAddress?: string
): AddressData {
  let streetNumber = '';
  let streetName = '';
  let city = '';
  let state = '';
  let zip = '';
  let country = '';

  for (const c of components) {
    const types: string[] = c.types ?? [];
    if (types.includes('street_number')) streetNumber = c.long_name ?? '';
    if (types.includes('route')) streetName = c.long_name ?? '';
    if (types.includes('locality')) city = c.long_name ?? '';
    if (types.includes('sublocality_level_1') && !city) city = c.long_name ?? '';
    if (types.includes('administrative_area_level_1')) state = c.short_name ?? '';
    if (types.includes('postal_code')) zip = c.long_name ?? '';
    if (types.includes('country')) country = c.short_name ?? '';
  }

  if (!zip && formattedAddress) {
    zip = extractZipFromFormatted(formattedAddress);
  }

  return {
    address1: `${streetNumber} ${streetName}`.trim(),
    address2: preserveAddress2 || '',
    city,
    state,
    zip,
    country,
  };
}

/**
 * Attach the legacy google.maps.places.Autocomplete widget to an input element.
 * Returns a cleanup function that removes the listener and widget.
 */
export function attachAutocomplete(
  input: HTMLInputElement,
  onPlaceChanged: (parsed: AddressData, formatted: string) => void
): () => void {
  if (!isGoogleReady()) return () => {};

  const autocomplete = new (window as any).google.maps.places.Autocomplete(
    input,
    AUTOCOMPLETE_OPTIONS
  );

  const listener = autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place?.address_components) return;

    const formatted = place.formatted_address ?? '';
    const parsed = parseAddressComponents(place.address_components, undefined, formatted);
    parsed.formattedAddress = formatted;
    onPlaceChanged(parsed, formatted);
  });

  return () => {
    if ((window as any).google?.maps?.event?.removeListener) {
      (window as any).google.maps.event.removeListener(listener);
    }
    // Remove the pac-container the widget injected
    const pacContainers = document.querySelectorAll('.pac-container');
    pacContainers.forEach((el) => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main AddressAutocomplete (full form)
// ────────────────────────────────────────────────────────────────────────────

interface AddressAutocompleteProps {
  value: AddressData;
  onChange: (address: AddressData) => void;
  required?: boolean;
  disabled?: boolean;
  showAddress2?: boolean;
  label?: string;
  className?: string;
  compact?: boolean;
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
  const googleReady = useGooglePlacesReady();
  const inputRef = useRef<HTMLInputElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!googleReady || !inputRef.current) return;
    cleanupRef.current?.();
    cleanupRef.current = attachAutocomplete(inputRef.current, (parsed) => {
      parsed.address2 = valueRef.current.address2;
      onChangeRef.current(parsed);
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [googleReady]);

  const handleFieldChange = (field: keyof AddressData, newValue: string) => {
    onChange({ ...value, [field]: newValue });
  };

  const clearAddress = () => {
    onChange({ address1: '', address2: '', city: '', state: '', zip: '' });
  };

  if (compact) {
    return (
      <div className={className}>
        {label && (
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        <div className="relative">
          <MapPin
            data-input-icon
            className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-opacity duration-200"
          />
          <input
            ref={inputRef}
            type="text"
            required={required}
            disabled={disabled}
            defaultValue={
              value.formattedAddress ||
              `${value.address1}${value.city ? `, ${value.city}` : ''}${value.state ? `, ${value.state}` : ''} ${value.zip}`.trim()
            }
            onChange={(e) => handleFieldChange('address1', e.target.value)}
            placeholder="Start typing an address..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-12 pr-10 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            autoComplete="off"
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
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Street Address {required && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
          <MapPin
            data-input-icon
            className={`absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-opacity duration-200 ${value.address1 ? 'opacity-0' : 'opacity-100'}`}
          />
          <input
            ref={inputRef}
            type="text"
            required={required}
            disabled={disabled}
            defaultValue={value.address1}
            onChange={(e) => handleFieldChange('address1', e.target.value)}
            placeholder="Start typing an address..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-12 pr-4 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            autoComplete="off"
          />
        </div>
      </div>

      {showAddress2 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Apt, Suite, Unit (Optional)
          </label>
          <input
            type="text"
            disabled={disabled}
            value={value.address2 || ''}
            onChange={(e) => handleFieldChange('address2', e.target.value)}
            placeholder="Apartment, suite, unit, etc."
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-gray-100"
          />
        </div>
      )}

      <div className="grid grid-cols-6 gap-4">
        <div className="col-span-3">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            City {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            required={required}
            disabled={disabled}
            value={value.city}
            onChange={(e) => handleFieldChange('city', e.target.value)}
            placeholder="City"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-gray-100"
          />
        </div>

        <div className="col-span-1">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            State {required && <span className="text-red-500">*</span>}
          </label>
          <select
            required={required}
            disabled={disabled}
            value={value.state}
            onChange={(e) => handleFieldChange('state', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-gray-100"
          >
            <option value="">--</option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            ZIP Code {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            required={required}
            disabled={disabled}
            value={value.zip}
            onChange={(e) =>
              handleFieldChange('zip', e.target.value.replace(/\D/g, '').slice(0, 5))
            }
            placeholder="12345"
            maxLength={5}
            pattern="[0-9]{5}"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-gray-100"
          />
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Simpler inline AddressInput — uses legacy Autocomplete widget
// ────────────────────────────────────────────────────────────────────────────

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
  const googleReady = useGooglePlacesReady();
  const inputRef = useRef<HTMLInputElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!googleReady || !inputRef.current) return;
    cleanupRef.current?.();
    cleanupRef.current = attachAutocomplete(inputRef.current, (parsed, formatted) => {
      onChangeRef.current(formatted || parsed.address1, parsed);
    });
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [googleReady]);

  const handleInputChange = useCallback(
    (newValue: string) => {
      onChange(newValue);
    },
    [onChange]
  );

  return (
    <div className={`relative ${className}`}>
      <MapPin
        className={`absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-opacity duration-200 ${value ? 'opacity-0' : 'opacity-100'}`}
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-300 py-2 pl-12 pr-4 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100"
        autoComplete="off"
      />
    </div>
  );
}
