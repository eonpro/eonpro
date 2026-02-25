'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';
import {
  Plus,
  Eye,
  Edit,
  MoreVertical,
  UserPlus,
  GitMerge,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from 'lucide-react';
import MergePatientModal from '@/components/MergePatientModal';
import DeletePatientModal from '@/components/DeletePatientModal';
import { apiFetch } from '@/lib/api/fetch';

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
  clinicName?: string | null;
}

interface PaginationMeta {
  count: number;
  total: number;
  hasMore: boolean;
}

const PAGE_SIZE = 25;

// Helper to detect if data looks like encrypted PHI
const isEncryptedData = (value: string | null | undefined): boolean => {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  return parts.every((part) => /^[A-Za-z0-9+/]+=*$/.test(part) && part.length > 10);
};

// Safely display contact info
const displayContact = (value: string | null | undefined): string => {
  if (!value) return '-';
  if (isEncryptedData(value)) return '(encrypted)';
  return value;
};

export default function AdminIntakesPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mergePatient, setMergePatient] = useState<Patient | null>(null);
  const [deletePatient, setDeletePatient] = useState<Patient | null>(null);
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
      setCurrentPage(1);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Fetch intakes with server-side search and pagination
  const fetchIntakes = useCallback(async (page: number, searchQuery: string) => {
    try {
      const isSearch = searchQuery.trim().length > 0;
      setIsSearching(isSearch);
      setLoading(true);

      const params = new URLSearchParams({
        includeContact: 'true',
      });

      if (isSearch) {
        params.set('limit', '500');
        params.set('search', searchQuery.trim());
      } else {
        const offset = (page - 1) * PAGE_SIZE;
        params.set('limit', PAGE_SIZE.toString());
        params.set('offset', offset.toString());
      }

      const response = await apiFetch(`/api/admin/intakes?${params.toString()}`);

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
      console.error('Failed to fetch intakes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntakes(currentPage, debouncedSearch);
  }, [currentPage, debouncedSearch, fetchIntakes]);

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

  // No client-side status filter — API returns constant 'intake' status for all records
  const filteredPatients = patients;

  // Pagination calculations
  const totalPages = isSearching
    ? Math.ceil(filteredPatients.length / PAGE_SIZE)
    : Math.ceil(meta.total / PAGE_SIZE);

  const displayedPatients = isSearching
    ? filteredPatients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : filteredPatients;

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 7;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

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
    fetchIntakes(currentPage, debouncedSearch);
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Intakes</h1>
          <p className="mt-1 text-gray-600">All patient profiles in the system</p>
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
          Add Intake
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
          <UserPlus className="mt-0.5 h-5 w-5" style={{ color: 'var(--brand-primary, #4fa77e)' }} />
          <div>
            <p className="text-sm font-medium text-gray-800">
              This tab shows every patient profile, including those with invoices and prescriptions
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--brand-primary, #4fa77e)' }}>
              The Patients tab filters to only those with an invoice or prescription
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name, patient ID, email, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-4 pr-4 focus:border-transparent focus:outline-none focus:ring-2"
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
            fetchIntakes(currentPage, debouncedSearch);
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

      {/* Results summary */}
      {!loading && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {isSearching ? (
              <>
                Found <span className="font-medium">{filteredPatients.length}</span> intake
                {filteredPatients.length !== 1 ? 's' : ''} matching &quot;{debouncedSearch}&quot;
              </>
            ) : (
              <>
                Showing <span className="font-medium">{displayedPatients.length}</span> of{' '}
                <span className="font-medium">{meta.total}</span> intakes
              </>
            )}
          </p>
        </div>
      )}

      {/* Intakes Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2
              className="mx-auto mb-4 h-12 w-12 animate-spin"
              style={{ color: 'var(--brand-primary, #4fa77e)' }}
            />
            <p className="text-gray-600">
              {searchTerm ? 'Searching intakes...' : 'Loading intakes...'}
            </p>
          </div>
        ) : displayedPatients.length === 0 ? (
          <div className="p-12 text-center">
            <UserPlus className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <h3 className="mb-2 text-lg font-medium text-gray-900">No intakes found</h3>
            <p className="mb-4 text-gray-600">
              {searchTerm
                ? 'Try adjusting your search criteria'
                : 'No patient profiles have been created yet'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Intake
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    DOB
                  </th>
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
                    className="cursor-pointer transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500"
                    tabIndex={0}
                    role="link"
                    onClick={() => (window.location.href = `/patients/${patient.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') window.location.href = `/patients/${patient.id}`; }}
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full"
                          style={{
                            backgroundColor:
                              'var(--brand-secondary-light, rgba(59, 130, 246, 0.15))',
                          }}
                        >
                          <span
                            className="font-medium"
                            style={{ color: 'var(--brand-secondary, #3B82F6)' }}
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
                      <div className="text-sm text-gray-900">{displayContact(patient.email)}</div>
                      <div className="text-sm text-gray-500">{displayContact(patient.phone)}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                      {patient.dateOfBirth && !isEncryptedData(patient.dateOfBirth)
                        ? new Date(patient.dateOfBirth).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className="rounded-full px-2 py-1 text-xs font-medium"
                        style={{
                          backgroundColor: 'var(--brand-secondary-light, rgba(59, 130, 246, 0.15))',
                          color: 'var(--brand-secondary, #3B82F6)',
                        }}
                      >
                        Intake
                      </span>
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
                                Delete intake
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
