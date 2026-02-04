'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, User, Loader2 } from 'lucide-react';

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
}

export default function PatientQuickSearch({
  currentPatientId,
  placeholder = 'Search patients...',
  className = '',
}: PatientQuickSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search function
  const searchPatients = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/patients?search=${encodeURIComponent(searchQuery)}&limit=10&includeContact=true`
      );
      
      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      
      // Filter out current patient and format results
      const filtered = (data.patients || [])
        .filter((p: PatientResult) => p.id !== currentPatientId)
        .slice(0, 8); // Limit to 8 results for UX
      
      setResults(filtered);
      setIsOpen(filtered.length > 0);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Patient search failed:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentPatientId]);

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

  // Navigate to selected patient
  const navigateToPatient = (patientId: number) => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    router.push(`/patients/${patientId}`);
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
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
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
          className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 bg-white
                     focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-all
                     placeholder:text-gray-400"
          style={{
            '--tw-ring-color': 'var(--brand-primary, #4fa77e)',
          } as React.CSSProperties}
        />
        {/* Loading or Clear button */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
          ) : query ? (
            <button
              onClick={handleClear}
              className="p-0.5 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
          <ul className="max-h-80 overflow-y-auto py-1">
            {results.map((patient, index) => (
              <li key={patient.id}>
                <button
                  onClick={() => navigateToPatient(patient.id)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                    selectedIndex === index
                      ? 'bg-gray-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))' }}
                  >
                    <User className="w-4 h-4" style={{ color: 'var(--brand-primary, #4fa77e)' }} />
                  </div>
                  {/* Patient Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {patient.firstName} {patient.lastName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {patient.patientId ? `#${patient.patientId}` : `ID ${patient.id}`}
                      {patient.email && ` · ${patient.email}`}
                    </p>
                  </div>
                  {/* Clinic badge for multi-clinic users */}
                  {patient.clinicName && (
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {patient.clinicName}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {/* Footer hint */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Press <kbd className="px-1.5 py-0.5 bg-white rounded border text-gray-500">↵</kbd> to select
              · <kbd className="px-1.5 py-0.5 bg-white rounded border text-gray-500">↑↓</kbd> to navigate
            </p>
          </div>
        </div>
      )}

      {/* No results message */}
      {isOpen && query.length >= 2 && !isLoading && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl border border-gray-200 shadow-lg z-50 p-4">
          <p className="text-sm text-gray-500 text-center">
            No patients found for "{query}"
          </p>
        </div>
      )}
    </div>
  );
}
