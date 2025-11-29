"use client";

import { useEffect, useRef, useState } from "react";
import { logger } from '@/lib/logger';

type AddressAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect?: (address: {
    address1: string;
    city: string;
    state: string;
    zip: string;
  }) => void;
  placeholder?: string;
  className?: string; // wrapper classes (grid spans, margins)
  inputClassName?: string;
};

export default function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder,
  className,
  inputClassName,
}: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<
    Array<{ description: string; place_id: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [suppressFetch, setSuppressFetch] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [hasSelectedAddress, setHasSelectedAddress] = useState(false);

  useEffect(() => {
    setQuery(value);
    // If value is cleared externally (e.g., form reset), reset selection state
    if (!value || value.length === 0) {
      setHasSelectedAddress(false);
      setHasUserInteracted(false);
    }
  }, [value]);

  useEffect(() => {
    // Don't fetch suggestions until user has interacted with the field
    if (!hasUserInteracted) {
      return;
    }

    if (!query || query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (suppressFetch) {
      setSuppressFetch(false);
      return;
    }

    setLoading(true);
    setError(null);
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/maps/autocomplete?input=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        if (!controller.signal.aborted) {
          if (data.ok === false) {
            setError(data.error?.message ?? "Address lookup failed.");
            setSuggestions([]);
            setShowSuggestions(false);
          } else {
            setSuggestions(data.predictions ?? []);
            setShowSuggestions(true);
          }
        }
      } catch (err: any) {
    // @ts-ignore
   
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          logger.error("Autocomplete request failed", err);
          setError("Unable to reach Google Maps. Please type the address manually.");
        }
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, suppressFetch, hasUserInteracted]);

  const handleSelect = async (prediction: { description: string; place_id: string }) => {
    setSuppressFetch(true);
    setQuery(prediction.description);
    onChange(prediction.description);
    setShowSuggestions(false);
    setSuggestions([]);
    setHasSelectedAddress(true); // Mark that an address has been selected
    inputRef.current?.blur();

    try {
      const res = await fetch(
        `/api/maps/details?placeId=${encodeURIComponent(prediction.place_id)}`
      );
      const data = await res.json();
      if (data.ok === false) {
        setError(data.error?.message ?? "Failed to fetch address details.");
        return;
      }
      const components: Array<{
        long_name: string;
        short_name: string;
        types: string[];
      }> = data.result?.address_components ?? [];

      const streetNumber =
        components.find((component: any) => component.types.includes("street_number"))
          ?.long_name ?? "";
      const route =
        components.find((component: any) => component.types.includes("route"))?.long_name ?? "";
      const street = [streetNumber, route].filter(Boolean).join(" ");

      const address = {
        address1:
          street || data.result?.formatted_address || prediction.description || "",
        city:
          components.find((component: any) => component.types.includes("locality"))
            ?.long_name ?? "",
        state:
          components.find((component: any) =>
            component.types.includes("administrative_area_level_1")
          )?.short_name ?? "",
        zip:
          components.find((component: any) => component.types.includes("postal_code"))
            ?.long_name ?? "",
      };

      setError(null);
      onAddressSelect?.(address);
    } catch (err: any) {
    // @ts-ignore
   
      logger.error("Failed to fetch place details", err);
      setError("Unable to fetch address details. Please verify manually.");
    }
  };

  useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, []);

  return (
    <div className={`relative w-full ${className ?? ""}`} ref={containerRef}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e: any) => {
          setHasUserInteracted(true);
          setHasSelectedAddress(false); // Reset when user types again
          setQuery(e.target.value);
          onChange(e.target.value);
          if (e.target.value.length >= 3) {
            setShowSuggestions(true);
          }
        }}
        placeholder={placeholder}
        className={inputClassName ?? "border p-2 w-full"}
        onFocus={() => {
          // Only show existing suggestions if user has interacted but hasn't selected an address yet
          if (hasUserInteracted && suggestions.length > 0 && !hasSelectedAddress) {
            setShowSuggestions(true);
          }
        }}
      />
      {error && (
        <p className="mt-1 text-xs text-red-600">
          {error} {loading ? "" : "You can continue typing manually."}
        </p>
      )}
      {showSuggestions && (suggestions.length > 0 || loading) && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow-lg max-h-56 overflow-auto">
          {loading && (
            <p className="px-3 py-2 text-sm text-gray-500">Searching addresses…</p>
          )}
          {!loading && suggestions.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-500">No matches found.</p>
          )}
          {!loading &&
            suggestions.map((prediction: any) => (
              <button
                type="button"
                key={prediction.place_id}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                onClick={() => handleSelect(prediction)}
              >
                {prediction.description}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
