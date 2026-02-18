'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, User, Loader2, UserPlus } from 'lucide-react';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';

interface PatientResult {
  id: number;
  patientId: string | null;
  firstName: string;
  lastName: string;
  email?: string;
  clinicName?: string | null;
}

interface PatientQuickSearchProps {
  /** Current patient ID to exclude from results */
  currentPatientId?: number;
  /** Placeholder text */
  placeholder?: string;
  /** Additional class names */
  className?: string;
  /** Base path for patient links. Use /provider/patients when on provider route. */
  patientDetailBasePath?: string;
  /** Path for create-patient flow when no results. Default: /admin/patients/new or /provider/patients?create=1 */
  createPatientPath?: string;
}

export default function PatientQuickSearch({
  currentPatientId,
  placeholder = 'Search patients...',
  className = '',
  patientDetailBasePath = '/patients',
  createPatientPath,
}: PatientQuickSearchProps) {
  const effectiveCreatePath =
    createPatientPath ?? (patientDetailBasePath.includes('provider') ? '/provider/patients?create=1' : '/admin/patients/new');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search function
  const searchPatients = useCallback(
    async (searchQuery: string) => {
      const trimmed = searchQuery.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setIsOpen(false);
        setSearchError(null);
        return;
      }

      setIsLoading(true);
      setSearchError(null);
      try {
        const response = await fetch(
          `/api/patients?search=${encodeURIComponent(trimmed)}&limit=10&includeContact=true`
        );

        if (!response.ok) {
          const status = response.status;
          if (status === 401 || status === 403) {
            setSearchError('Session expired — please refresh the page');
          } else {
            setSearchError('Search unavailable — try again');
          }
          setResults([]);
          setIsOpen(true);
          return;
        }

        const data = await response.json();

        // Filter out current patient and format results
        const filtered = (data.patients || [])
          .filter((p: PatientResult) => p.id !== currentPatientId)
          .slice(0, 8);

        setResults(filtered);
        setIsOpen(true);
        setSelectedIndex(-1);
      } catch (error) {
        console.error('Patient search failed:', error);
        setSearchError('Network error — check your connection');
        setResults([]);
        setIsOpen(true);
      } finally {
        setIsLoading(false);
      }
    },
    [currentPatientId]
  );

  // Handle input change with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce search by 300ms
    debounceRef.current = setTimeout(() => {
      searchPatients(value);
    }, 300);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) {
      if (e.key === 'Escape') {
        setQuery('');
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          navigateToPatient(results[selectedIndex].id);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Navigate to selected patient - use window.location for reliability (router.push had issues)
  const navigateToPatient = (patientId: number) => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    window.location.href = `${patientDetailBasePath}/${patientId}`;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Clear button handler
  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setSearchError(null);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-4 pr-10 text-sm transition-all placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-opacity-50"
          style={
            {
              '--tw-ring-color': 'var(--brand-primary, #4fa77e)',
            } as React.CSSProperties
          }
        />
        {/* Loading or Clear button */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : query ? (
            <button
              onClick={handleClear}
              className="rounded-full p-0.5 transition-colors hover:bg-gray-100"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <ul className="max-h-80 overflow-y-auto py-1">
            {results.map((patient, index) => (
              <li key={patient.id}>
                <button
                  onClick={() => navigateToPatient(patient.id)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                    selectedIndex === index ? 'bg-gray-50' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))',
                    }}
                  >
                    <User className="h-4 w-4" style={{ color: 'var(--brand-primary, #4fa77e)' }} />
                  </div>
                  {/* Patient Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {patient.firstName} {patient.lastName}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      #{formatPatientDisplayId(patient.patientId, patient.id)}
                      {patient.email && ` · ${patient.email}`}
                    </p>
                  </div>
                  {/* Clinic badge for multi-clinic users */}
                  {patient.clinicName && (
                    <span className="flex-shrink-0 text-xs text-gray-400">
                      {patient.clinicName}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {/* Footer hint */}
          <div className="border-t border-gray-100 bg-gray-50 px-4 py-2">
            <p className="text-xs text-gray-400">
              Press <kbd className="rounded border bg-white px-1.5 py-0.5 text-gray-500">↵</kbd> to
              select · <kbd className="rounded border bg-white px-1.5 py-0.5 text-gray-500">↑↓</kbd>{' '}
              to navigate
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {isOpen && query.length >= 2 && !isLoading && searchError && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-red-200 bg-red-50 p-4 shadow-lg">
          <p className="text-center text-sm text-red-600">{searchError}</p>
        </div>
      )}

      {/* No results - offer create patient */}
      {isOpen && query.length >= 2 && !isLoading && !searchError && results.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
          <p className="mb-3 text-center text-sm text-gray-500">No patients found for &ldquo;{query}&rdquo;</p>
          <a
            href={effectiveCreatePath}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors hover:opacity-90"
            style={{
              backgroundColor: 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))',
              color: 'var(--brand-primary, #4fa77e)',
            }}
          >
            <UserPlus className="h-4 w-4" />
            Create new patient
          </a>
        </div>
      )}
    </div>
  );
}
