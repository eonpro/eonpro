'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Search, X } from 'lucide-react';

// US States for dropdown
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
// Shared helpers for the new Places API (AutocompleteSuggestion)
// Google Maps types are accessed dynamically; we use `any` to avoid a
// hard dependency on @types/google.maps.
// ────────────────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PlaceSuggestion {
  placePrediction?: {
    text?: { text?: string };
    toPlace: () => any;
  };
}

function getPlacesLib(): any {
  if (typeof window !== 'undefined' && (window as any).google?.maps?.places) {
    return (window as any).google.maps.places;
  }
  return null;
}

function useGooglePlaces() {
  const [loaded, setLoaded] = useState(() => !!getPlacesLib());

  useEffect(() => {
    if (loaded) return;
    const interval = setInterval(() => {
      if (getPlacesLib()) {
        setLoaded(true);
        clearInterval(interval);
      }
    }, 500);
    const timeout = setTimeout(() => clearInterval(interval), 10_000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [loaded]);

  return loaded;
}

/**
 * Parse addressComponents from the new Place class into our AddressData format.
 * New API uses `longText` / `shortText` instead of legacy `long_name` / `short_name`.
 */
function parseNewAddressComponents(
  components: any[],
  preserveAddress2?: string,
): AddressData {
  let streetNumber = '';
  let streetName = '';
  let city = '';
  let state = '';
  let zip = '';
  let country = '';

  for (const c of components) {
    const types: string[] = c.types ?? [];
    const longText: string = c.longText ?? c.long_name ?? '';
    const shortText: string = c.shortText ?? c.short_name ?? '';

    if (types.includes('street_number')) streetNumber = longText;
    if (types.includes('route')) streetName = longText;
    if (types.includes('locality')) city = longText;
    if (types.includes('sublocality_level_1') && !city) city = longText;
    if (types.includes('administrative_area_level_1')) state = shortText;
    if (types.includes('postal_code')) zip = longText;
    if (types.includes('country')) country = shortText;
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

/** Suggestions dropdown used by both components. */
function SuggestionsDropdown({
  suggestions,
  onSelect,
  highlightIndex,
}: {
  suggestions: PlaceSuggestion[];
  onSelect: (s: PlaceSuggestion) => void;
  highlightIndex: number;
}) {
  if (suggestions.length === 0) return null;

  return (
    <ul
      role="listbox"
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
    >
      {suggestions.map((s, i) => {
        const text = s.placePrediction?.text?.text ?? '';
        return (
          <li
            key={text + i}
            role="option"
            aria-selected={i === highlightIndex}
            onMouseDown={(e) => { e.preventDefault(); onSelect(s); }}
            className={`cursor-pointer px-4 py-2 text-sm ${
              i === highlightIndex ? 'bg-teal-50 text-teal-700' : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
              <span>{text}</span>
            </div>
          </li>
        );
      })}
      <li className="px-4 py-1.5 text-right text-[10px] text-gray-400">
        Powered by Google
      </li>
    </ul>
  );
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
  const isGoogleLoaded = useGooglePlaces();
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getSessionToken = useCallback(() => {
    const lib = getPlacesLib();
    if (!lib) return undefined;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new lib.AutocompleteSessionToken();
    }
    return sessionTokenRef.current;
  }, []);

  const resetSessionToken = useCallback(() => { sessionTokenRef.current = null; }, []);

  const fetchSuggestions = useCallback(async (input: string) => {
    const lib = getPlacesLib();
    if (!lib || !input || input.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const { suggestions: results } =
        await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          includedRegionCodes: ['us'],
          includedPrimaryTypes: ['address'],
          sessionToken: getSessionToken(),
        });
      setSuggestions(results ?? []);
      setShowDropdown(true);
      setHighlightIndex(-1);
    } catch {
      setSuggestions([]);
    }
  }, [getSessionToken]);

  const handleAddressInputChange = useCallback((newValue: string) => {
    onChange({ ...value, address1: newValue });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(newValue), 300);
  }, [value, onChange, fetchSuggestions]);

  const handleSelect = useCallback(async (suggestion: PlaceSuggestion) => {
    setShowDropdown(false);
    setSuggestions([]);
    const prediction = suggestion.placePrediction;
    if (!prediction) return;

    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['addressComponents', 'formattedAddress'] });

      const components = place.addressComponents;
      if (components) {
        const parsed = parseNewAddressComponents(components, value.address2);
        parsed.formattedAddress = place.formattedAddress ?? '';
        onChange(parsed);
      }
    } catch {
      // Fallback: use the prediction text as address1
      const text = prediction.text?.text ?? '';
      onChange({ ...value, address1: text });
    }
    resetSessionToken();
  }, [value, onChange, resetSessionToken]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }, [showDropdown, suggestions, highlightIndex, handleSelect]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const handleFieldChange = (field: keyof AddressData, newValue: string) => {
    onChange({ ...value, [field]: newValue });
  };

  const clearAddress = () => {
    onChange({ address1: '', address2: '', city: '', state: '', zip: '' });
  };

  if (compact) {
    return (
      <div className={className} ref={containerRef}>
        {label && (
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        <div className="relative">
          <MapPin data-input-icon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-opacity duration-200" />
          <input
            type="text"
            required={required}
            disabled={disabled}
            value={
              value.formattedAddress ||
              `${value.address1}${value.city ? `, ${value.city}` : ''}${value.state ? `, ${value.state}` : ''} ${value.zip}`.trim()
            }
            onChange={(e) => handleAddressInputChange(e.target.value)}
            onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
            onKeyDown={handleKeyDown}
            placeholder="Start typing an address..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-12 pr-10 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            role="combobox"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
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
          {showDropdown && (
            <SuggestionsDropdown
              suggestions={suggestions}
              onSelect={handleSelect}
              highlightIndex={highlightIndex}
            />
          )}
        </div>
        {!isGoogleLoaded && (
          <p className="mt-1 text-xs text-amber-600">Loading address autocomplete...</p>
        )}
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

      <div ref={containerRef}>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Street Address {required && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
          <MapPin data-input-icon className={`absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-opacity duration-200 ${value.address1 ? 'opacity-0' : 'opacity-100'}`} />
          <input
            type="text"
            required={required}
            disabled={disabled}
            value={value.address1}
            onChange={(e) => handleAddressInputChange(e.target.value)}
            onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
            onKeyDown={handleKeyDown}
            placeholder="Start typing an address..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-12 pr-4 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            role="combobox"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
            autoComplete="off"
          />
          {showDropdown && (
            <SuggestionsDropdown
              suggestions={suggestions}
              onSelect={handleSelect}
              highlightIndex={highlightIndex}
            />
          )}
        </div>
        {!isGoogleLoaded && (
          <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
            <Search className="h-3 w-3 animate-pulse" />
            Loading address autocomplete...
          </p>
        )}
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
            {US_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.code}
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
// Simpler inline AddressInput
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
  // Kick off polling so getPlacesLib() returns a value on future keystrokes
  useGooglePlaces();

  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const sessionTokenRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getSessionToken = useCallback(() => {
    const lib = getPlacesLib();
    if (!lib) return undefined;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new lib.AutocompleteSessionToken();
    }
    return sessionTokenRef.current;
  }, []);

  const resetSessionToken = useCallback(() => { sessionTokenRef.current = null; }, []);

  const fetchSuggestions = useCallback(async (input: string) => {
    const lib = getPlacesLib();
    if (!lib || !input || input.length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const { suggestions: results } =
        await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          includedRegionCodes: ['us'],
          includedPrimaryTypes: ['address'],
          sessionToken: getSessionToken(),
        });
      setSuggestions(results ?? []);
      setShowDropdown(true);
      setHighlightIndex(-1);
    } catch {
      setSuggestions([]);
    }
  }, [getSessionToken]);

  const handleInputChange = useCallback((newValue: string) => {
    onChange(newValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(newValue), 300);
  }, [onChange, fetchSuggestions]);

  const handleSelect = useCallback(async (suggestion: PlaceSuggestion) => {
    setShowDropdown(false);
    setSuggestions([]);
    const prediction = suggestion.placePrediction;
    if (!prediction) return;

    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['addressComponents', 'formattedAddress'] });

      const components = place.addressComponents;
      if (components) {
        const parsed = parseNewAddressComponents(components);
        parsed.formattedAddress = place.formattedAddress ?? '';
        onChange(place.formattedAddress ?? '', parsed);
      } else {
        onChange(prediction.text?.text ?? '');
      }
    } catch {
      onChange(prediction.text?.text ?? '');
    }
    resetSessionToken();
  }, [onChange, resetSessionToken]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightIndex]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }, [showDropdown, suggestions, highlightIndex, handleSelect]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <MapPin className={`absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-opacity duration-200 ${value ? 'opacity-0' : 'opacity-100'}`} />
      <input
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-300 py-2 pl-12 pr-4 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {showDropdown && (
        <SuggestionsDropdown
          suggestions={suggestions}
          onSelect={handleSelect}
          highlightIndex={highlightIndex}
        />
      )}
    </div>
  );
}
