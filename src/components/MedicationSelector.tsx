'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { MEDS, MedicationConfig } from '@/lib/medications';
import { getMedicationCategory } from '@/lib/medications-enhanced';
import { ChevronDown, X, Check, AlertTriangle, Pill } from 'lucide-react';
import { normalizedIncludes } from '@/lib/utils/search';

// Category configuration with colors and icons
const CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; borderColor: string; emoji: string }
> = {
  'GLP-1': {
    label: 'GLP-1 Weight Loss',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    emoji: '💉',
  },
  TRT: {
    label: 'Testosterone (TRT)',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    emoji: '💪',
  },
  'Hormone Support': {
    label: 'Hormone Support',
    color: 'text-[var(--brand-primary)]',
    bgColor: 'bg-[var(--brand-primary-light)]',
    borderColor: 'border-[var(--brand-primary-medium)]',
    emoji: '⚖️',
  },
  Peptide: {
    label: 'Peptides',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    emoji: '🧬',
  },
  ED: {
    label: 'Sexual Health',
    color: 'text-pink-700',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-200',
    emoji: '❤️',
  },
  Other: {
    label: 'Other Medications',
    color: 'text-gray-700',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    emoji: '💊',
  },
};

// Sub-category for GLP-1 to distinguish Semaglutide vs Tirzepatide
function getGLP1SubCategory(name: string): 'Semaglutide' | 'Tirzepatide' | null {
  const nameLower = name.toLowerCase();
  if (nameLower.includes('semaglutide')) return 'Semaglutide';
  if (nameLower.includes('tirzepatide')) return 'Tirzepatide';
  return null;
}

// Get a friendly display name from the full pharmacy name
function getFriendlyName(name: string): { displayName: string; details: string } {
  // Extract vial size from the name (e.g., "2ML VIAL", "1ML", "5ML")
  const vialMatch = name.match(/\((\d+(?:\.\d+)?)\s*ML(?:\s*VIAL)?\)/i);
  const vialSizeMl = vialMatch ? parseFloat(vialMatch[1]) : 0;
  const vialSizeLabel = vialMatch ? vialMatch[1] + 'ML' : '';

  // Extract concentration (e.g., "2.5/20MG/ML" -> 2.5, "10/20MG/ML" -> 10, "30/20" -> 30)
  const concMatch = name.match(/(\d+(?:\.\d+)?)(?:\/(\d+))?MG\/ML/i);
  const concentrationMgPerMl = concMatch ? parseFloat(concMatch[1]) : 0;
  const conc2 = concMatch && concMatch[2] ? concMatch[2] : '20';

  // Determine medication type
  const nameLower = name.toLowerCase();
  let medType = '';
  const isGLP1 = nameLower.includes('semaglutide') || nameLower.includes('tirzepatide');

  if (nameLower.includes('semaglutide')) medType = 'Semaglutide';
  else if (nameLower.includes('tirzepatide')) medType = 'Tirzepatide';
  else if (nameLower.includes('testosterone')) medType = 'Testosterone';
  else if (nameLower.includes('sermorelin')) medType = 'Sermorelin';
  else if (nameLower.includes('sildenafil')) medType = 'Sildenafil';
  else if (nameLower.includes('tadalafil')) medType = 'Tadalafil';
  else if (nameLower.includes('anastrozole')) medType = 'Anastrozole';
  else if (nameLower.includes('enclomiphene')) medType = 'Enclomiphene';
  else if (nameLower.includes('nad')) medType = 'NAD+';
  else medType = name.split('/')[0].split(' ')[0];

  // Tirzepatide: exact format "TIRZEPATIDE/GLYCINE" with "10mg/20mg/1mL (10mg)" etc.
  if (nameLower.includes('tirzepatide') && vialSizeMl > 0 && concentrationMgPerMl > 0) {
    const totalMg = Math.round(vialSizeMl * concentrationMgPerMl);
    const displayName = 'TIRZEPATIDE/GLYCINE';
    const details = `${concentrationMgPerMl % 1 === 0 ? concentrationMgPerMl : concentrationMgPerMl.toFixed(1)}mg/${conc2}mg/${vialSizeMl % 1 === 0 ? vialSizeMl : vialSizeMl.toFixed(1)}mL (${totalMg}mg)`;
    return { displayName, details };
  }

  // Semaglutide: exact format "SEMAGLUTIDE/GLYCINE" with "2.5mg/20mg/1mL (2.5mg)" etc.
  if (nameLower.includes('semaglutide') && vialSizeMl > 0 && concentrationMgPerMl > 0) {
    const totalMg = vialSizeMl * concentrationMgPerMl;
    const totalMgFormatted = totalMg % 1 === 0 ? totalMg.toFixed(0) : totalMg.toFixed(1);
    const concFormatted = concentrationMgPerMl % 1 === 0 ? concentrationMgPerMl : concentrationMgPerMl.toFixed(1);
    const vialFormatted = vialSizeMl % 1 === 0 ? vialSizeMl : vialSizeMl.toFixed(1);
    const displayName = 'SEMAGLUTIDE/GLYCINE';
    const details = `${concFormatted}mg/${conc2}mg/${vialFormatted}mL (${totalMgFormatted}mg)`;
    return { displayName, details };
  }

  // Build friendly display name for non-GLP-1 meds
  const displayName = vialSizeLabel ? `${medType} ${vialSizeLabel}` : medType;
  const details = concMatch ? `${concMatch[0]}` : '';

  return { displayName, details };
}

interface MedicationOption {
  key: string;
  name: string;
  displayName: string;
  details: string;
  strength: string;
  form: string;
  formLabel?: string;
  category: string;
  subCategory?: string | null;
}

interface MedicationSelectorProps {
  value: string;
  onChange: (key: string) => void;
  expectedMedicationType?: string; // e.g., "Tirzepatide" or "Semaglutide"
  disabled?: boolean;
  className?: string;
  showCategoryBadge?: boolean;
}

export default function MedicationSelector({
  value,
  onChange,
  expectedMedicationType,
  disabled = false,
  className = '',
  showCategoryBadge = true,
}: MedicationSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'semaglutide' | 'tirzepatide' | 'other'>(
    'all'
  );
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Set active tab based on expected medication type
  useEffect(() => {
    if (expectedMedicationType) {
      if (expectedMedicationType.toLowerCase() === 'tirzepatide') {
        setActiveTab('tirzepatide');
      } else if (expectedMedicationType.toLowerCase() === 'semaglutide') {
        setActiveTab('semaglutide');
      }
    }
  }, [expectedMedicationType]);

  // Build medication options with friendly names
  const allMedications = useMemo(() => {
    const meds: MedicationOption[] = [];
    (Object.entries(MEDS) as [string, MedicationConfig][]).forEach(([key, med]) => {
      const category = getMedicationCategory(key);
      const subCategory = category === 'GLP-1' ? getGLP1SubCategory(med.name) : null;
      const { displayName, details } = getFriendlyName(med.name);

      meds.push({
        key,
        name: med.name,
        displayName,
        details,
        strength: med.strength,
        form: med.form,
        formLabel: med.formLabel,
        category,
        subCategory,
      });
    });

    // GLP-1: only the standard options in display order
    const SEMAGLUTIDE_KEYS = ['203448971', '203448947', '203449363', '202851329', '203448974']; // 1mL, 2mL, 3mL, 5/20 2mL, 5mL
    const TIRZEPATIDE_KEYS = ['203448972', '203448973', '203449364', '203449500', '203418602'];
    const SERMORELIN_KEY = '203666651'; // Only show the 5ML vial
    const filtered = meds.filter((m) => {
      if (m.subCategory === 'Semaglutide') return SEMAGLUTIDE_KEYS.includes(m.key);
      if (m.subCategory === 'Tirzepatide') return TIRZEPATIDE_KEYS.includes(m.key);
      if (m.name.toLowerCase().includes('sermorelin')) return m.key === SERMORELIN_KEY;
      return true;
    });

    // Sort: GLP-1 first (Semaglutide, then Tirzepatide), each in reference order
    return filtered.sort((a, b) => {
      if (a.category === 'GLP-1' && b.category !== 'GLP-1') return -1;
      if (a.category !== 'GLP-1' && b.category === 'GLP-1') return 1;
      if (a.subCategory && b.subCategory && a.subCategory !== b.subCategory) {
        return a.subCategory === 'Semaglutide' ? -1 : 1;
      }
      if (a.subCategory === 'Semaglutide' && b.subCategory === 'Semaglutide') {
        return SEMAGLUTIDE_KEYS.indexOf(a.key) - SEMAGLUTIDE_KEYS.indexOf(b.key);
      }
      if (a.subCategory === 'Tirzepatide' && b.subCategory === 'Tirzepatide') {
        return TIRZEPATIDE_KEYS.indexOf(a.key) - TIRZEPATIDE_KEYS.indexOf(b.key);
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }, []);

  // Filter medications based on search and active tab
  const filteredMedications = useMemo(() => {
    let filtered = allMedications;

    // Filter by tab
    if (activeTab === 'semaglutide') {
      filtered = filtered.filter((m) => m.subCategory === 'Semaglutide');
    } else if (activeTab === 'tirzepatide') {
      filtered = filtered.filter((m) => m.subCategory === 'Tirzepatide');
    } else if (activeTab === 'other') {
      filtered = filtered.filter((m) => m.category !== 'GLP-1');
    }

    // Filter by search
    if (searchTerm) {
      filtered = filtered.filter(
        (m) =>
          normalizedIncludes(m.name, searchTerm) ||
          normalizedIncludes(m.displayName, searchTerm) ||
          normalizedIncludes(m.strength, searchTerm)
      );
    }

    return filtered;
  }, [allMedications, activeTab, searchTerm]);

  // Group medications by sub-category for display
  const groupedMedications = useMemo(() => {
    const semaglutide = filteredMedications.filter((m) => m.subCategory === 'Semaglutide');
    const tirzepatide = filteredMedications.filter((m) => m.subCategory === 'Tirzepatide');
    const other = filteredMedications.filter((m) => m.category !== 'GLP-1');

    return { semaglutide, tirzepatide, other };
  }, [filteredMedications]);

  // Get selected medication info
  const selectedMed = value ? allMedications.find((m) => m.key === value) : null;

  // Check if selection matches expected type
  const isMismatch =
    expectedMedicationType &&
    selectedMed?.subCategory &&
    expectedMedicationType.toLowerCase() !== selectedMed.subCategory.toLowerCase();

  const handleSelect = (key: string) => {
    onChange(key);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Main Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex w-full items-center justify-between rounded-xl border bg-white px-4 py-3 text-left focus:border-transparent focus:ring-2 focus:ring-rose-400 ${
          isMismatch
            ? 'border-amber-400 bg-amber-50'
            : isOpen
              ? 'border-rose-400 ring-2 ring-rose-100'
              : 'border-gray-300 hover:border-gray-400'
        } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          {selectedMed ? (
            <>
              {/* Medication Type Icon */}
              <div
                className={`flex-shrink-0 rounded-lg p-2 ${
                  selectedMed.subCategory === 'Semaglutide'
                    ? 'bg-teal-100'
                    : selectedMed.subCategory === 'Tirzepatide'
                      ? 'bg-[var(--brand-primary-light)]'
                      : 'bg-gray-100'
                }`}
              >
                <Pill
                  className={`h-4 w-4 ${
                    selectedMed.subCategory === 'Semaglutide'
                      ? 'text-teal-600'
                      : selectedMed.subCategory === 'Tirzepatide'
                        ? 'text-[var(--brand-primary)]'
                        : 'text-gray-600'
                  }`}
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{selectedMed.displayName}</span>
                  {selectedMed.subCategory && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        selectedMed.subCategory === 'Semaglutide'
                          ? 'bg-teal-100 text-teal-700'
                          : 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]'
                      }`}
                    >
                      {selectedMed.subCategory === 'Semaglutide' ? '🟢' : '🟣'}{' '}
                      {selectedMed.subCategory}
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-gray-500">
                  {(selectedMed.subCategory === 'Tirzepatide' || selectedMed.subCategory === 'Semaglutide')
                    ? selectedMed.details
                    : selectedMed.strength}
                </p>
              </div>
            </>
          ) : (
            <span className="text-gray-400">Select a medication...</span>
          )}
        </div>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Mismatch Warning */}
      {isMismatch && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-medium text-amber-800">Medication Type Mismatch</p>
            <p className="mt-0.5 text-amber-700">
              Patient treatment is <strong>{expectedMedicationType}</strong>, but you selected{' '}
              <strong>{selectedMed?.subCategory}</strong>. Please verify this is correct before
              proceeding.
            </p>
          </div>
        </div>
      )}

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 mt-2 max-h-[500px] w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          {/* Search */}
          <div className="border-b border-gray-100 p-3">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search medications..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 pl-4 pr-10 text-sm focus:border-transparent focus:ring-2 focus:ring-rose-400"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex border-b border-gray-100 bg-gray-50">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'all'
                  ? 'border-b-2 border-rose-500 bg-white text-rose-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('semaglutide')}
              className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'semaglutide'
                  ? 'border-b-2 border-teal-500 bg-white text-teal-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="text-base">🟢</span> Semaglutide
            </button>
            <button
              onClick={() => setActiveTab('tirzepatide')}
              className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'tirzepatide'
                  ? 'border-b-2 border-[var(--brand-primary)] bg-white text-[var(--brand-primary)]'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="text-base">🟣</span> Tirzepatide
            </button>
            <button
              onClick={() => setActiveTab('other')}
              className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'other'
                  ? 'border-b-2 border-gray-500 bg-white text-gray-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Other
            </button>
          </div>

          {/* Medication List */}
          <div className="max-h-[350px] overflow-y-auto">
            {filteredMedications.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <Pill className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                <p>No medications found</p>
                <p className="mt-1 text-xs">Try adjusting your search or category</p>
              </div>
            ) : activeTab === 'all' ? (
              <>
                {/* Semaglutide Group */}
                {groupedMedications.semaglutide.length > 0 && (
                  <div>
                    <div className="sticky top-0 border-b border-teal-100 bg-teal-50 px-4 py-2">
                      <span className="flex items-center gap-2 text-sm font-semibold text-teal-700">
                        🟢 Semaglutide
                        <span className="text-xs font-normal text-teal-600">
                          ({groupedMedications.semaglutide.length} options)
                        </span>
                      </span>
                    </div>
                    {groupedMedications.semaglutide.map((med) => (
                      <MedicationOption
                        key={med.key}
                        med={med}
                        isSelected={value === med.key}
                        onSelect={handleSelect}
                        colorClass="teal"
                      />
                    ))}
                  </div>
                )}

                {/* Tirzepatide Group */}
                {groupedMedications.tirzepatide.length > 0 && (
                  <div>
                    <div className="sticky top-0 border-b border-[var(--brand-primary-medium)] bg-[var(--brand-primary-light)] px-4 py-2">
                      <span className="flex items-center gap-2 text-sm font-semibold text-[var(--brand-primary)]">
                        🟣 Tirzepatide
                        <span className="text-xs font-normal text-[var(--brand-primary)]">
                          ({groupedMedications.tirzepatide.length} options)
                        </span>
                      </span>
                    </div>
                    {groupedMedications.tirzepatide.map((med) => (
                      <MedicationOption
                        key={med.key}
                        med={med}
                        isSelected={value === med.key}
                        onSelect={handleSelect}
                        colorClass="brand"
                      />
                    ))}
                  </div>
                )}

                {/* Other Medications Group */}
                {groupedMedications.other.length > 0 && (
                  <div>
                    <div className="sticky top-0 border-b border-gray-100 bg-gray-50 px-4 py-2">
                      <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                        💊 Other Medications
                        <span className="text-xs font-normal text-gray-500">
                          ({groupedMedications.other.length} options)
                        </span>
                      </span>
                    </div>
                    {groupedMedications.other.map((med) => (
                      <MedicationOption
                        key={med.key}
                        med={med}
                        isSelected={value === med.key}
                        onSelect={handleSelect}
                        colorClass="gray"
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              // Single category view
              filteredMedications.map((med) => (
                <MedicationOption
                  key={med.key}
                  med={med}
                  isSelected={value === med.key}
                  onSelect={handleSelect}
                  colorClass={
                    med.subCategory === 'Semaglutide'
                      ? 'teal'
                      : med.subCategory === 'Tirzepatide'
                        ? 'brand'
                        : 'gray'
                  }
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Individual medication option component
function MedicationOption({
  med,
  isSelected,
  onSelect,
  colorClass,
}: {
  med: MedicationOption;
  isSelected: boolean;
  onSelect: (key: string) => void;
  colorClass: 'teal' | 'brand' | 'gray';
}) {
  const colorClasses = {
    teal: {
      bg: 'hover:bg-teal-50',
      selected: 'bg-teal-100 border-l-4 border-teal-500',
      icon: 'bg-teal-100 text-teal-600',
      badge: 'bg-teal-100 text-teal-700',
    },
    brand: {
      bg: 'hover:bg-[var(--brand-primary-light)]',
      selected: 'bg-[var(--brand-primary-light)] border-l-4 border-[var(--brand-primary)]',
      icon: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
      badge: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
    },
    gray: {
      bg: 'hover:bg-gray-50',
      selected: 'bg-gray-100 border-l-4 border-gray-500',
      icon: 'bg-gray-100 text-gray-600',
      badge: 'bg-gray-100 text-gray-700',
    },
  };

  const colors = colorClasses[colorClass];

  const isGLP1TableFormat = med.subCategory === 'Tirzepatide' || med.subCategory === 'Semaglutide';

  return (
    <button
      onClick={() => onSelect(med.key)}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
        isSelected ? colors.selected : `${colors.bg} border-l-4 border-transparent`
      }`}
    >
      <div className={`flex-shrink-0 rounded-lg p-2 ${colors.icon}`}>
        <Pill className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{med.displayName}</span>
          {med.details && !isGLP1TableFormat && (
            <span className={`rounded-full px-2 py-0.5 text-xs ${colors.badge}`}>
              {med.details}
            </span>
          )}
        </div>
        {isGLP1TableFormat ? (
          <p className="mt-0.5 text-sm text-gray-700" title={med.name}>
            {med.details}
          </p>
        ) : (
          <p className="mt-0.5 truncate text-xs text-gray-500" title={med.name}>
            {med.strength} • {med.formLabel || med.form}
          </p>
        )}
      </div>
      {isSelected && <Check className="h-5 w-5 flex-shrink-0 text-green-600" />}
    </button>
  );
}

// Export helper for getting category info
export { CATEGORY_CONFIG, getGLP1SubCategory, getMedicationCategory };
