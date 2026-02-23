'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';
import {
  Search,
  Plus,
  Filter,
  Eye,
  Edit,
  MoreVertical,
  Users,
  GitMerge,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  DollarSign,
  ShoppingCart,
  UserCheck,
} from 'lucide-react';
import MergePatientModal from '@/components/MergePatientModal';
import DeletePatientModal from '@/components/DeletePatientModal';
import SalesRepAssignmentModal from '@/components/SalesRepAssignmentModal';
import { apiFetch } from '@/lib/api/fetch';

interface SalesRep {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  assignedAt?: string;
}

interface Patient {
  id: number;
  patientId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob?: string;
  dateOfBirth: string;
  status: string;
  createdAt: string;
  convertedAt?: string;
  hasInvoice?: boolean;
  hasOrder?: boolean;
  hasPayment?: boolean;
  lastInvoiceAmount?: string | null;
  lastOrderStatus?: string | null;
  clinicName?: string | null;
  tags?: string[];
  medicationNames?: string[];
  source?: string | null;
  salesRep?: SalesRep | null;
  salesRepId?: number | null;
}

interface SalesRepOption {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  patientCount: number;
}

const safeTags = (tags: unknown): string[] =>
  Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];

// Treatment type options for Overtime Men's Clinic filtering
const TREATMENT_FILTERS = [
  { value: 'all', label: 'All Treatments' },
  { value: 'peptides', label: 'Peptides' },
  { value: 'nad-plus', label: 'NAD+' },
  { value: 'sexual-health', label: 'Better Sex' },
  { value: 'trt', label: 'TRT' },
  { value: 'labs', label: 'Baseline/Labs' },
  { value: 'weight-loss', label: 'Weight Loss' },
];

interface PaginationMeta {
  count: number;
  total: number;
  hasMore: boolean;
}

const PAGE_SIZE = 25; // Items per page

// Helper to detect if data looks like encrypted PHI (base64:base64:base64 format)
const isEncryptedData = (value: string | null | undefined): boolean => {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  // Check if all parts look like base64 (contain base64 chars and end with = padding or alphanumeric)
  return parts.every((part) => /^[A-Za-z0-9+/]+=*$/.test(part) && part.length > 10);
};

// Placeholder phone stored when intake had no phone - show as missing
const isPlaceholderPhone = (value: string | null | undefined): boolean =>
  !value || value === '0000000000' || value.replace(/\D/g, '') === '0000000000';

// Safely display contact info - hide encrypted data and placeholder phone
const displayContact = (
  value: string | null | undefined,
  options?: { type?: 'email' | 'phone' }
): string => {
  if (!value) return '—';
  if (options?.type === 'phone' && isPlaceholderPhone(value)) return '—';
  if (isEncryptedData(value)) return '(encrypted)';
  return value;
};

export default function AdminPatientsPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [treatmentFilter, setTreatmentFilter] = useState('all');
  const [mergePatient, setMergePatient] = useState<Patient | null>(null);
  const [deletePatient, setDeletePatient] = useState<Patient | null>(null);
  const [assignSalesRepPatient, setAssignSalesRepPatient] = useState<Patient | null>(null);
  const [salesReps, setSalesReps] = useState<SalesRepOption[]>([]);
  const [salesRepFilter, setSalesRepFilter] = useState<string>('all');
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta>({ count: 0, total: 0, hasMore: false });
  const [isSearching, setIsSearching] = useState(false);

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to first page on new search
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Fetch sales reps list
  const fetchSalesReps = useCallback(async () => {
    try {
      const response = await apiFetch('/api/admin/sales-reps');
      if (response.ok) {
        const data = await response.json();
        setSalesReps(data.salesReps || []);
      }
    } catch (error) {
      console.error('Failed to fetch sales reps:', error);
    }
  }, []);

  // Fetch patients with invoices and/or prescriptions from /api/admin/patients only
  const fetchPatients = useCallback(
    async (page: number, searchQuery: string, salesRepIdFilter?: string) => {
      try {
        const isSearch = searchQuery.trim().length > 0;
        setIsSearching(isSearch);
        setLoading(true);

        const params = new URLSearchParams({ includeContact: 'true' });

        if (isSearch) {
          params.set('limit', '500');
          params.set('search', searchQuery.trim());
        } else {
          params.set('limit', PAGE_SIZE.toString());
          params.set('offset', ((page - 1) * PAGE_SIZE).toString());
        }

        if (salesRepIdFilter && salesRepIdFilter !== 'all') {
          params.set('salesRepId', salesRepIdFilter);
        }

        const response = await apiFetch(`/api/admin/patients?${params.toString()}`);

        if (response.ok) {
          const data = await response.json();
          setPatients(data.patients || []);
          setMeta({
            count: data.meta?.count || 0,
            total: data.meta?.total || 0,
            hasMore: data.meta?.hasMore || false,
          });
        }
      } catch (error) {
        console.error('Failed to fetch patients:', error);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Fetch sales reps on mount
  useEffect(() => {
    fetchSalesReps();
  }, [fetchSalesReps]);

  // Fetch when page, search, or sales rep filter changes
  useEffect(() => {
    fetchPatients(currentPage, debouncedSearch, salesRepFilter);
  }, [currentPage, debouncedSearch, salesRepFilter, fetchPatients]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Apply client-side treatment filter (status filter removed — API returns constant 'patient' status)
  const filteredPatients = patients.filter((patient) => {
    const matchesTreatment =
      treatmentFilter === 'all' ||
      safeTags(patient.tags).some((tag) => tag === treatmentFilter);
    return matchesTreatment;
  });

  // Pagination calculations
  const totalPages = isSearching
    ? Math.ceil(filteredPatients.length / PAGE_SIZE)
    : Math.ceil(meta.total / PAGE_SIZE);

  // For search results, paginate client-side
  const displayedPatients = isSearching
    ? filteredPatients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : filteredPatients;

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 7;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      // Show pages around current
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) {
          pages.push(i);
        }
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Always show last page
      if (!pages.includes(totalPages)) {
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const handleDeletePatient = async () => {
    if (!deletePatient) return;

    const response = await apiFetch(`/api/patients/${deletePatient.id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete patient');
    }

    setDeletePatient(null);
    fetchPatients(currentPage, debouncedSearch);
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
          <p className="mt-1 text-gray-600">
            Patients who have an invoice or a prescription placed
          </p>
        </div>
        <button
          onClick={() => (window.location.href = '/admin/patients/new')}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-white transition-colors"
          style={{
            backgroundColor: 'var(--brand-primary, #4fa77e)',
            color: 'var(--brand-primary-text, #ffffff)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <Plus className="h-5 w-5" />
          Add Patient
        </button>
      </div>

      {/* Info Banner */}
      <div
        className="mb-6 rounded-xl border p-4"
        style={{
          backgroundColor: 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))',
          borderColor: 'var(--brand-primary, #4fa77e)',
        }}
      >
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5" style={{ color: 'var(--brand-primary, #4fa77e)' }} />
          <div>
            <p className="text-sm font-medium text-gray-800">
              This list shows patients with an invoice or prescription history
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--brand-primary, #4fa77e)' }}>
              The Intakes tab shows every patient profile in the system
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search patients by name, ID, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-4 pr-4 focus:border-transparent focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--brand-primary, #4fa77e)' } as React.CSSProperties}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 transform text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Clear search</span>×
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={treatmentFilter}
              onChange={(e) => setTreatmentFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--brand-primary, #4fa77e)' } as React.CSSProperties}
            >
              {TREATMENT_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {salesReps.length > 0 && (
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-gray-400" />
              <select
                value={salesRepFilter}
                onChange={(e) => {
                  setSalesRepFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:outline-none focus:ring-2"
                style={
                  { '--tw-ring-color': 'var(--brand-primary, #4fa77e)' } as React.CSSProperties
                }
              >
                <option value="all">All Sales Reps</option>
                <option value="unassigned">Unassigned</option>
                {salesReps.map((rep) => (
                  <option key={rep.id} value={rep.id.toString()}>
                    {rep.firstName} {rep.lastName} ({rep.patientCount})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Merge Patient Modal */}
      {mergePatient && (
        <MergePatientModal
          sourcePatient={{
            id: mergePatient.id,
            patientId: mergePatient.patientId || null,
            firstName: mergePatient.firstName,
            lastName: mergePatient.lastName,
            email: mergePatient.email,
            phone: mergePatient.phone,
            dob: mergePatient.dob || mergePatient.dateOfBirth,
            createdAt: mergePatient.createdAt,
          }}
          onClose={() => setMergePatient(null)}
          onMergeComplete={(mergedPatientId) => {
            setMergePatient(null);
            fetchPatients(currentPage, debouncedSearch);
            window.location.href = `/patients/${mergedPatientId}`;
          }}
        />
      )}

      {/* Delete Patient Modal */}
      {deletePatient && (
        <DeletePatientModal
          patient={deletePatient}
          onClose={() => setDeletePatient(null)}
          onDelete={handleDeletePatient}
        />
      )}

      {/* Sales Rep Assignment Modal */}
      {assignSalesRepPatient && (
        <SalesRepAssignmentModal
          patient={assignSalesRepPatient}
          salesReps={salesReps}
          currentSalesRepId={assignSalesRepPatient.salesRepId || undefined}
          onClose={() => setAssignSalesRepPatient(null)}
          onAssigned={() => {
            setAssignSalesRepPatient(null);
            fetchPatients(currentPage, debouncedSearch, salesRepFilter);
            fetchSalesReps();
          }}
        />
      )}

      {/* Results summary */}
      {!loading && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {isSearching ? (
              <>
                Found <span className="font-medium">{filteredPatients.length}</span> patient
                {filteredPatients.length !== 1 ? 's' : ''} matching &quot;{debouncedSearch}&quot;
              </>
            ) : (
              <>
                Showing <span className="font-medium">{displayedPatients.length}</span> of{' '}
                <span className="font-medium">{meta.total}</span> patients
              </>
            )}
          </p>
        </div>
      )}

      {/* Patients Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2
              className="mx-auto mb-4 h-12 w-12 animate-spin"
              style={{ color: 'var(--brand-primary, #4fa77e)' }}
            />
            <p className="text-gray-600">
              {searchTerm ? 'Searching patients...' : 'Loading patients...'}
            </p>
          </div>
        ) : displayedPatients.length === 0 ? (
          <div className="p-12 text-center">
            <Search className="mx-auto mb-4 h-12 w-12 text-gray-300" />
            <h3 className="mb-2 text-lg font-medium text-gray-900">
              {searchTerm ? 'No results found' : 'No patients yet'}
            </h3>
            {searchTerm ? (
              <div className="space-y-2">
                <p className="text-gray-600">
                  No patients match &quot;{searchTerm}&quot;
                </p>
                <p className="text-sm text-gray-500">
                  Try searching by first name, last name, email, phone, or patient ID
                </p>
                <button
                  onClick={() => setSearchTerm('')}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-600">No patients with invoices or prescriptions yet</p>
                <p className="text-sm text-gray-500">
                  Patients appear here when they receive an invoice or prescription
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Patient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    DOB
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Treatment
                  </th>
                  {salesReps.length > 0 && (
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Sales Rep
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {displayedPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    className="cursor-pointer transition-colors hover:bg-gray-50"
                    onClick={() => (window.location.href = `/patients/${patient.id}`)}
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full"
                          style={{
                            backgroundColor:
                              'var(--brand-primary-light, rgba(79, 167, 126, 0.15))',
                          }}
                        >
                          <span
                            className="font-medium"
                            style={{ color: 'var(--brand-primary, #4fa77e)' }}
                          >
                            {patient.firstName?.[0]}
                            {patient.lastName?.[0]}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {patient.firstName} {patient.lastName}
                          </div>
                          <div className="text-sm text-gray-500">
                            ID: {formatPatientDisplayId(patient.patientId, patient.id)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="text-sm text-gray-900">{displayContact(patient.email, { type: 'email' })}</div>
                      <div className="text-sm text-gray-500">{displayContact(patient.phone, { type: 'phone' })}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                      {(() => {
                        if (!patient.dateOfBirth || isEncryptedData(patient.dateOfBirth))
                          return '-';
                        // Check for placeholder dates (1900-01-01, 1899-12-31, etc.)
                        const dob = patient.dateOfBirth;
                        if (
                          dob.startsWith('1900') ||
                          dob.startsWith('1899') ||
                          dob === '01/01/1900'
                        )
                          return '-';
                        const dobDate = new Date(dob);
                        const year = dobDate.getFullYear();
                        // Hide any DOB before 1920 (unrealistic) or invalid
                        if (isNaN(year) || year < 1920) return '-';
                        return dobDate.toLocaleDateString();
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex max-w-[200px] flex-wrap gap-1">
                        {patient.medicationNames && patient.medicationNames.length > 0 ? (
                          <>
                            {patient.medicationNames.slice(0, 3).map((med, i) => (
                              <span
                                key={i}
                                className="inline-block max-w-full truncate rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
                                title={med}
                              >
                                {med}
                              </span>
                            ))}
                            {patient.medicationNames.length > 3 && (
                              <span
                                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                                title={patient.medicationNames.slice(3).join(', ')}
                              >
                                +{patient.medicationNames.length - 3}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            {safeTags(patient.tags).includes('peptides') && (
                              <span className="rounded-full bg-[var(--brand-primary-light)] px-2 py-0.5 text-xs font-medium text-[var(--brand-primary)]">
                                Peptides
                              </span>
                            )}
                            {safeTags(patient.tags).includes('nad-plus') && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                NAD+
                              </span>
                            )}
                            {safeTags(patient.tags).includes('sexual-health') && (
                              <span className="rounded-full bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700">
                                Better Sex
                              </span>
                            )}
                            {safeTags(patient.tags).includes('trt') && (
                              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                                TRT
                              </span>
                            )}
                            {safeTags(patient.tags).includes('labs') && (
                              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700">
                                Labs
                              </span>
                            )}
                            {safeTags(patient.tags).includes('weight-loss') && (
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                Weight Loss
                              </span>
                            )}
                          </>
                        )}
                        {(!patient.medicationNames?.length &&
                          !safeTags(patient.tags).some((t) =>
                            [
                              'peptides',
                              'nad-plus',
                              'sexual-health',
                              'trt',
                              'labs',
                              'weight-loss',
                            ].includes(t)
                          )) && <span className="text-gray-400">-</span>}
                      </div>
                    </td>
                    {salesReps.length > 0 && (
                      <td
                        className="whitespace-nowrap px-6 py-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {patient.salesRep ? (
                          <button
                            onClick={() => setAssignSalesRepPatient(patient)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-200"
                          >
                            <UserCheck className="h-3 w-3" />
                            {patient.salesRep.firstName} {patient.salesRep.lastName?.[0]}.
                          </button>
                        ) : (
                          <button
                            onClick={() => setAssignSalesRepPatient(patient)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-200"
                          >
                            <Plus className="h-3 w-3" />
                            Assign
                          </button>
                        )}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-2">
                        {patient.hasInvoice && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium"
                            style={{
                              backgroundColor:
                                'var(--brand-primary-light, rgba(79, 167, 126, 0.15))',
                              color: 'var(--brand-primary, #4fa77e)',
                            }}
                          >
                            <DollarSign className="h-3 w-3" />
                            Invoice
                          </span>
                        )}
                        {patient.hasOrder && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium"
                            style={{
                              backgroundColor:
                                'var(--brand-primary-light, rgba(79, 167, 126, 0.15))',
                              color: 'var(--brand-primary, #4fa77e)',
                            }}
                          >
                            <ShoppingCart className="h-3 w-3" />
                            Rx
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                      {patient.createdAt ? new Date(patient.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td
                      className="whitespace-nowrap px-6 py-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => (window.location.href = `/patients/${patient.id}`)}
                          className="rounded-lg p-2 text-gray-600 transition-colors"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                            e.currentTarget.style.backgroundColor =
                              'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = '#4b5563';
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => (window.location.href = `/patients/${patient.id}`)}
                          className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-blue-50 hover:text-blue-600"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <div
                          className="relative"
                          ref={openDropdownId === patient.id ? dropdownRef : null}
                        >
                          <button
                            onClick={() =>
                              setOpenDropdownId(openDropdownId === patient.id ? null : patient.id)
                            }
                            className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {openDropdownId === patient.id && (
                            <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                              {salesReps.length > 0 && (
                                <>
                                  <button
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      setAssignSalesRepPatient(patient);
                                    }}
                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                                  >
                                    <UserCheck className="h-4 w-4 text-gray-500" />
                                    {patient.salesRep ? 'Change sales rep' : 'Assign sales rep'}
                                  </button>
                                  <div className="my-1 border-t border-gray-100" />
                                </>
                              )}
                              <button
                                onClick={() => {
                                  setOpenDropdownId(null);
                                  setMergePatient(patient);
                                }}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <GitMerge className="h-4 w-4 text-gray-500" />
                                Merge with another patient
                              </button>
                              <div className="my-1 border-t border-gray-100" />
                              <button
                                onClick={() => {
                                  setOpenDropdownId(null);
                                  setDeletePatient(patient);
                                }}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete patient
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-1">
                {/* First page */}
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                  className="rounded-lg p-2 text-gray-600 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  onMouseEnter={(e) => {
                    if (currentPage !== 1) {
                      e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                      e.currentTarget.style.backgroundColor =
                        'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#4b5563';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title="First page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>

                {/* Previous page */}
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="rounded-lg p-2 text-gray-600 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  onMouseEnter={(e) => {
                    if (currentPage !== 1) {
                      e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                      e.currentTarget.style.backgroundColor =
                        'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#4b5563';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* Page numbers */}
                <div className="mx-2 flex items-center gap-1">
                  {getPageNumbers().map((page, index) =>
                    typeof page === 'number' ? (
                      <button
                        key={index}
                        onClick={() => goToPage(page)}
                        className="h-9 min-w-[36px] rounded-lg px-3 text-sm font-medium transition-colors"
                        style={
                          currentPage === page
                            ? {
                                backgroundColor: 'var(--brand-primary, #4fa77e)',
                                color: 'var(--brand-primary-text, #ffffff)',
                              }
                            : {
                                color: '#4b5563',
                              }
                        }
                        onMouseEnter={(e) => {
                          if (currentPage !== page) {
                            e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                            e.currentTarget.style.backgroundColor =
                              'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (currentPage !== page) {
                            e.currentTarget.style.color = '#4b5563';
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        {page}
                      </button>
                    ) : (
                      <span key={index} className="px-2 text-gray-400">
                        {page}
                      </span>
                    )
                  )}
                </div>

                {/* Next page */}
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="rounded-lg p-2 text-gray-600 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  onMouseEnter={(e) => {
                    if (currentPage !== totalPages) {
                      e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                      e.currentTarget.style.backgroundColor =
                        'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#4b5563';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                {/* Last page */}
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="rounded-lg p-2 text-gray-600 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  onMouseEnter={(e) => {
                    if (currentPage !== totalPages) {
                      e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                      e.currentTarget.style.backgroundColor =
                        'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#4b5563';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title="Last page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
