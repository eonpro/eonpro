'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, Filter, Eye, Edit, MoreVertical, UserPlus, GitMerge, Trash2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';
import MergePatientModal from '@/components/MergePatientModal';
import DeletePatientModal from '@/components/DeletePatientModal';

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
  return parts.every(part => /^[A-Za-z0-9+/]+=*$/.test(part) && part.length > 10);
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
  const [statusFilter, setStatusFilter] = useState('all');
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

      const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

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

      const response = await fetch(`/api/admin/intakes?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

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

  // Apply client-side status filter
  const filteredPatients = patients.filter(patient => {
    const matchesStatus = statusFilter === 'all' || patient.status?.toLowerCase() === statusFilter;
    return matchesStatus;
  });

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

    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
    const response = await fetch(`/api/patients/${deletePatient.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete patient');
    }

    setDeletePatient(null);
    fetchIntakes(currentPage, debouncedSearch);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Intakes</h1>
          <p className="text-gray-600 mt-1">New patient intakes awaiting payment or prescription</p>
        </div>
        <button
          onClick={() => window.location.href = '/admin/patients/new'}
          className="px-4 py-2 text-white rounded-lg transition-colors flex items-center gap-2"
          style={{
            backgroundColor: 'var(--brand-primary, #4fa77e)',
            color: 'var(--brand-primary-text, #ffffff)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          <Plus className="h-5 w-5" />
          Add Intake
        </button>
      </div>

      {/* Info Banner */}
      <div
        className="rounded-xl p-4 mb-6 border"
        style={{
          backgroundColor: 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))',
          borderColor: 'var(--brand-primary, #4fa77e)'
        }}
      >
        <div className="flex items-start gap-3">
          <UserPlus className="h-5 w-5 mt-0.5" style={{ color: 'var(--brand-primary, #4fa77e)' }} />
          <div>
            <p className="text-sm font-medium text-gray-800">
              Intakes become Patients when they make a payment or receive a prescription
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--brand-primary, #4fa77e)' }}>
              Converted patients will appear in the Patients tab
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, patient ID, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': 'var(--brand-primary, #4fa77e)' } as React.CSSProperties}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <span className="sr-only">Clear search</span>
                ×
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': 'var(--brand-primary, #4fa77e)' } as React.CSSProperties}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
          </div>
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
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-600">
            {isSearching ? (
              <>
                Found <span className="font-medium">{filteredPatients.length}</span> intake{filteredPatients.length !== 1 ? 's' : ''} matching &quot;{debouncedSearch}&quot;
                {statusFilter !== 'all' && ` (${statusFilter})`}
              </>
            ) : (
              <>
                Showing <span className="font-medium">{displayedPatients.length}</span> of <span className="font-medium">{meta.total}</span> intakes
                {statusFilter !== 'all' && ` (filtered by ${statusFilter})`}
              </>
            )}
          </p>
        </div>
      )}

      {/* Intakes Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" style={{ color: 'var(--brand-primary, #4fa77e)' }} />
            <p className="text-gray-600">
              {searchTerm ? 'Searching intakes...' : 'Loading intakes...'}
            </p>
          </div>
        ) : displayedPatients.length === 0 ? (
          <div className="p-12 text-center">
            <UserPlus className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No intakes found</h3>
            <p className="text-gray-600 mb-4">
              {searchTerm ? 'Try adjusting your search criteria' : 'All intakes have been converted to patients'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Intake</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DOB</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {displayedPatients.map((patient) => (
                  <tr
                    key={patient.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => window.location.href = `/patients/${patient.id}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div
                          className="h-10 w-10 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: 'var(--brand-secondary-light, rgba(59, 130, 246, 0.15))' }}
                        >
                          <span className="font-medium" style={{ color: 'var(--brand-secondary, #3B82F6)' }}>
                            {patient.firstName?.[0]}{patient.lastName?.[0]}
                          </span>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {patient.firstName} {patient.lastName}
                          </div>
                          <div className="text-sm text-gray-500">ID: {patient.patientId || patient.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{displayContact(patient.email)}</div>
                      <div className="text-sm text-gray-500">{displayContact(patient.phone)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {patient.dateOfBirth && !isEncryptedData(patient.dateOfBirth)
                        ? new Date(patient.dateOfBirth).toLocaleDateString()
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className="px-2 py-1 text-xs font-medium rounded-full"
                        style={{
                          backgroundColor: 'var(--brand-secondary-light, rgba(59, 130, 246, 0.15))',
                          color: 'var(--brand-secondary, #3B82F6)'
                        }}
                      >
                        Intake
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {patient.createdAt ? new Date(patient.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => window.location.href = `/patients/${patient.id}`}
                          className="p-2 text-gray-600 rounded-lg transition-colors"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                            e.currentTarget.style.backgroundColor = 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
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
                          onClick={() => window.location.href = `/patients/${patient.id}/edit`}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      <div className="relative" ref={openDropdownId === patient.id ? dropdownRef : null}>
                        <button
                          onClick={() => setOpenDropdownId(openDropdownId === patient.id ? null : patient.id)}
                          className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {openDropdownId === patient.id && (
                          <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50">
                            <button
                              onClick={() => {
                                setOpenDropdownId(null);
                                setMergePatient(patient);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                            >
                              <GitMerge className="h-4 w-4 text-gray-500" />
                              Merge with another patient
                            </button>
                            <div className="border-t border-gray-100 my-1" />
                            <button
                              onClick={() => {
                                setOpenDropdownId(null);
                                setDeletePatient(patient);
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3"
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
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                  className="p-2 text-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onMouseEnter={(e) => {
                    if (currentPage !== 1) {
                      e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                      e.currentTarget.style.backgroundColor = 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
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
                  className="p-2 text-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onMouseEnter={(e) => {
                    if (currentPage !== 1) {
                      e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                      e.currentTarget.style.backgroundColor = 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
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

                <div className="flex items-center gap-1 mx-2">
                  {getPageNumbers().map((page, index) => (
                    typeof page === 'number' ? (
                      <button
                        key={index}
                        onClick={() => goToPage(page)}
                        className="min-w-[36px] h-9 px-3 rounded-lg text-sm font-medium transition-colors"
                        style={currentPage === page ? {
                          backgroundColor: 'var(--brand-primary, #4fa77e)',
                          color: 'var(--brand-primary-text, #ffffff)'
                        } : {
                          color: '#4b5563'
                        }}
                        onMouseEnter={(e) => {
                          if (currentPage !== page) {
                            e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                            e.currentTarget.style.backgroundColor = 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
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
                  ))}
                </div>

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 text-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onMouseEnter={(e) => {
                    if (currentPage !== totalPages) {
                      e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                      e.currentTarget.style.backgroundColor = 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
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
                  className="p-2 text-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onMouseEnter={(e) => {
                    if (currentPage !== totalPages) {
                      e.currentTarget.style.color = 'var(--brand-primary, #4fa77e)';
                      e.currentTarget.style.backgroundColor = 'var(--brand-primary-light, rgba(79, 167, 126, 0.1))';
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
