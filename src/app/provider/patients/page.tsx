'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { Users, UserPlus, X, Loader2, ChevronDown } from 'lucide-react';

import { PatientSearchBar, useRecentSearches } from '@/components/PatientSearchBar';
import { AddressInput, type AddressData } from '@/components/AddressAutocomplete';
import { apiFetch } from '@/lib/api/fetch';
import { US_STATE_OPTIONS } from '@/lib/usStates';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';

interface Patient {
  id: number;
  patientId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  status: string;
  createdAt: string;
}

interface PaginationMeta {
  count: number;
  total: number;
  totalInSystem: number;
  hasMore: boolean;
}

const PAGE_SIZE = 50;

/** Show "No phone" for placeholder/missing (0000000000), otherwise the phone value */
function formatContactPhone(phone: string | null | undefined): React.ReactNode {
  if (!phone) return <span className="text-gray-400">No phone</span>;
  const digits = phone.replace(/\D/g, '');
  if (digits === '0000000000' || digits === '0') return <span className="text-gray-400">No phone</span>;
  return phone;
}

export default function ProviderPatientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const { recent, addRecent } = useRecentSearches();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState<PaginationMeta>({ count: 0, total: 0, totalInSystem: 0, hasMore: false });
  const [offset, setOffset] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const isInitialLoadRef = useRef(true);

  // New patient form
  const [newPatient, setNewPatient] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    dob: '',
    gender: 'male',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
  });

  // Open add modal when ?create=1 (e.g. from quick search "Create patient")
  // Initialize search from ?search= URL param (e.g. from dashboard search)
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setShowAddModal(true);
      router.replace('/provider/patients', { scroll: false });
    }
    const urlSearch = searchParams.get('search');
    if (urlSearch) {
      setSearchTerm(urlSearch);
      setSearchQuery(urlSearch);
      router.replace('/provider/patients', { scroll: false });
    }
  }, [searchParams, router]);

  const fetchPatients = useCallback(
    async (currentOffset: number, isNewSearch: boolean, q: string) => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      try {
        if (isNewSearch && isInitialLoadRef.current) setLoading(true);
        else if (isNewSearch) setSearching(true);
        else setLoadingMore(true);

        const params = new URLSearchParams({
          includeContact: 'true',
          limit: PAGE_SIZE.toString(),
          offset: currentOffset.toString(),
        });
        if (q.trim()) params.set('search', q.trim());

        const response = await apiFetch(`/api/patients?${params.toString()}`, {
          signal: abortRef.current.signal,
        });

        if (!response.ok) return;

        const data = await response.json();
        const mapped = (data.patients || []).map((p: Record<string, unknown>) => ({
          id: p.id as number,
          firstName: (p.firstName as string) || '',
          lastName: (p.lastName as string) || '',
          email: (p.email as string) || '',
          phone: (p.phone as string) || '',
          dateOfBirth: (p.dateOfBirth as string) || '',
          gender: (p.gender as string) || '',
          status: (p.status as string) || 'active',
          patientId: p.patientId as string | null,
          createdAt: (p.createdAt as string) || '',
        }));

        if (isNewSearch) {
          setPatients(mapped);
          isInitialLoadRef.current = false;
          if (q.trim()) addRecent(q.trim());
        } else {
          setPatients((prev) => [...prev, ...mapped]);
        }

        setMeta({
          count: data.meta?.count ?? mapped.length,
          total: data.meta?.total ?? mapped.length,
          totalInSystem: data.meta?.totalInSystem ?? data.meta?.total ?? mapped.length,
          hasMore: data.meta?.hasMore ?? false,
        });
        setOffset(currentOffset + mapped.length);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      } finally {
        setLoading(false);
        setSearching(false);
        setLoadingMore(false);
        abortRef.current = null;
      }
    },
    [addRecent]
  );

  useEffect(() => {
    setOffset(0);
    setPatients([]);
    setMeta({ count: 0, total: 0, totalInSystem: 0, hasMore: false });
    fetchPatients(0, true, searchQuery);
  }, [searchQuery, fetchPatients]);

  const loadMore = () => {
    if (!loadingMore && meta.hasMore) {
      fetchPatients(offset, false, searchQuery);
    }
  };

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
  }, []);

  const handleRecentSelect = useCallback((q: string) => {
    setSearchTerm(q);
    setSearchQuery(q);
  }, []);

  const loadAll = async () => {
    let currentOffset = offset;
    setLoadingMore(true);

    try {
      let hasMore = true;
      let allNewPatients: Patient[] = [];

      while (hasMore) {
        const params = new URLSearchParams({
          includeContact: 'true',
          limit: '500',
          offset: currentOffset.toString(),
        });
        if (searchQuery.trim()) params.set('search', searchQuery.trim());

        const response = await apiFetch(`/api/patients?${params.toString()}`);

        if (response.ok) {
          const data = await response.json();
          const mapped = (data.patients || []).map((p: Record<string, unknown>) => ({
            id: p.id as number,
            patientId: p.patientId as string | null,
            firstName: (p.firstName as string) || '',
            lastName: (p.lastName as string) || '',
            email: (p.email as string) || '',
            phone: (p.phone as string) || '',
            dateOfBirth: (p.dateOfBirth as string) || '',
            gender: (p.gender as string) || '',
            status: (p.status as string) || 'active',
            createdAt: (p.createdAt as string) || '',
          }));

          allNewPatients = [...allNewPatients, ...mapped];
          currentOffset += mapped.length;
          hasMore = data.meta?.hasMore || false;

          setMeta((prev) => ({
            count: data.meta?.count || 0,
            total: data.meta?.total || 0,
            totalInSystem: data.meta?.totalInSystem ?? prev.totalInSystem,
            hasMore: false,
          }));
        } else {
          break;
        }
      }

      setPatients((prev) => [...prev, ...allNewPatients]);
      setOffset(currentOffset);
    } catch (err) {
      console.error('Error loading all patients:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      const response = await apiFetch('/api/patients', {
        method: 'POST',
        body: JSON.stringify(newPatient),
      });

      const data = await response.json();

      if (response.ok) {
        setShowAddModal(false);
        setNewPatient({
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          dob: '',
          gender: 'male',
          address1: '',
          address2: '',
          city: '',
          state: '',
          zip: '',
        });
        setSearchTerm('');
        setSearchQuery('');
        setOffset(0);
        setPatients([]);
        fetchPatients(0, true, '');
      } else {
        // Parse validation errors if present
        if (data.issues) {
          const messages = data.issues
            .map((i: any) => `${i.path.join('.')}: ${i.message}`)
            .join(', ');
          setError(messages);
        } else {
          setError(data.error || 'Failed to create patient');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create patient');
    } finally {
      setCreating(false);
    }
  };

  const calculateAge = (dob: string) => {
    if (!dob) {
      return '-';
    }
    // Check if the value looks like encrypted data (contains colons and base64-like characters)
    if (dob.includes(':') && dob.length > 50) {
      return '-'; // Encrypted data, can't calculate age
    }
    const birthDate = new Date(dob);
    // Check if date is valid
    if (isNaN(birthDate.getTime())) {
      return '-';
    }
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  // Client-side filtering only for status (search is now server-side)
  const filteredPatients = patients.filter((patient) => {
    return filterStatus === 'all' || patient.status?.toLowerCase() === filterStatus;
  });

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6" />
            My Patients
          </h1>
          <button
            onClick={() => {
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            <UserPlus className="h-4 w-4" />
            Add Patient
          </button>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex-1">
            <PatientSearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              onSearch={handleSearch}
              isSearching={searching}
              totalFound={searchQuery ? meta.total : undefined}
              totalInSystem={meta.totalInSystem}
              recentSearches={recent}
              onRecentSelect={handleRecentSelect}
              onClear={() => setSearchQuery('')}
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
            }}
            className="rounded-lg border px-4 py-2 focus:ring-2 focus:ring-green-500"
          >
            <option value="all">All Patients</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-gray-900">{meta.totalInSystem}</div>
          <div className="text-sm text-gray-600">Total Patients</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-green-600">
            {searchQuery ? meta.total : patients.length}
          </div>
          <div className="text-sm text-gray-600">
            {searchQuery ? (
              'Matches'
            ) : (
              <>
                Loaded{' '}
                {meta.hasMore && <span className="text-xs text-gray-400">(of {meta.totalInSystem})</span>}
              </>
            )}
          </div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-gray-600">
            {patients.filter((p) => p.status?.toLowerCase() === 'inactive').length}
          </div>
          <div className="text-sm text-gray-600">Inactive</div>
        </div>
        <div className="rounded-lg bg-white p-4 shadow">
          <div className="text-2xl font-bold text-blue-600">
            {
              patients.filter((p) => {
                const created = new Date(p.createdAt);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return created > weekAgo;
              }).length
            }
          </div>
          <div className="text-sm text-gray-600">New This Week</div>
        </div>
      </div>

      {/* Patients List */}
      <div className="rounded-lg bg-white shadow">
        <div className="p-6">
          {filteredPatients.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="mx-auto mb-4 h-14 w-14 text-gray-300" />
              <p className="text-lg font-medium text-gray-700">
                {searchQuery
                  ? `No patients match "${searchQuery}"`
                  : 'No patients yet'}
              </p>
              <p className="mt-2 max-w-sm mx-auto text-sm text-gray-500">
                {searchQuery
                  ? 'Try searching by email, phone number, or patient ID. You can also clear the search to see all patients.'
                  : 'Add your first patient to get started.'}
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setSearchQuery('');
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-gray-700 hover:bg-gray-50"
                  >
                    Clear Search
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowAddModal(true);
                  }}
                  className="rounded-lg bg-green-600 px-5 py-2.5 text-white hover:bg-green-700"
                >
                  {searchQuery ? 'Add New Patient' : 'Add Your First Patient'}
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left">Patient</th>
                    <th className="px-4 py-3 text-left">Contact</th>
                    <th className="px-4 py-3 text-left">Age/Gender</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Added</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="cursor-pointer border-b transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500"
                      tabIndex={0}
                      role="link"
                      onClick={() => {
                        window.location.href = `/provider/patients/${patient.id}`;
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') window.location.href = `/provider/patients/${patient.id}`; }}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {patient.firstName} {patient.lastName}
                        </div>
                        <div className="text-sm text-gray-500">
                          ID: {formatPatientDisplayId(patient.patientId, patient.id)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">
                          {patient.email || <span className="text-gray-400">No email</span>}
                        </div>
                        <div className="text-sm text-gray-500">
                          {formatContactPhone(patient.phone)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          {calculateAge(patient.dateOfBirth) !== '-'
                            ? `${calculateAge(patient.dateOfBirth)} years`
                            : 'N/A'}
                        </div>
                        <div className="text-sm capitalize text-gray-500">
                          {patient.gender ? patient.gender.charAt(0).toUpperCase() : '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${getStatusColor(patient.status)}`}
                        >
                          {patient.status || 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(patient.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              window.location.href = `/provider/patients/${patient.id}`;
                            }}
                            className="rounded bg-green-100 px-3 py-1 text-sm text-green-700 hover:bg-green-200"
                          >
                            View
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              window.location.href = `/provider/patients/${patient.id}?tab=chat`;
                            }}
                            className="rounded bg-blue-100 px-3 py-1 text-sm text-blue-700 hover:bg-blue-200"
                          >
                            Message
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Load More / Load All */}
              {meta.hasMore && (
                <div className="mt-4 flex items-center justify-center gap-4 border-t py-6">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    Load More
                  </button>
                  <button
                    onClick={loadAll}
                    disabled={loadingMore}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    Load All ({Math.max(0, meta.total - patients.length)} remaining)
                  </button>
                </div>
              )}

              {/* Pagination info */}
              <div className="py-4 text-center text-sm text-gray-500">
                {searchQuery ? (
                  <>
                    Showing {filteredPatients.length} of {meta.total} matching &quot;{searchQuery}&quot;
                    {meta.totalInSystem > 0 && ` (${meta.totalInSystem.toLocaleString()} total)`}
                  </>
                ) : (
                  <>Showing {filteredPatients.length} of {meta.totalInSystem.toLocaleString()} patients</>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Patient Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 py-4">
          <div className="mx-4 my-auto w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-6">
              <h3 className="text-lg font-semibold">Add New Patient</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                }}
              >
                <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <form
              onSubmit={handleCreatePatient}
              className="max-h-[70vh] space-y-4 overflow-y-auto p-6"
            >
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPatient.firstName}
                    onChange={(e) => {
                      setNewPatient({ ...newPatient, firstName: e.target.value });
                    }}
                    className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPatient.lastName}
                    onChange={(e) => {
                      setNewPatient({ ...newPatient, lastName: e.target.value });
                    }}
                    className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Email *</label>
                  <input
                    type="email"
                    required
                    value={newPatient.email}
                    onChange={(e) => {
                      setNewPatient({ ...newPatient, email: e.target.value });
                    }}
                    className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Phone *</label>
                  <input
                    type="tel"
                    required
                    value={newPatient.phone}
                    onChange={(e) => {
                      setNewPatient({ ...newPatient, phone: e.target.value });
                    }}
                    className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-green-500"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              {/* DOB and Gender */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    required
                    value={newPatient.dob}
                    onChange={(e) => {
                      setNewPatient({ ...newPatient, dob: e.target.value });
                    }}
                    className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Gender *</label>
                  <select
                    required
                    value={newPatient.gender}
                    onChange={(e) => {
                      setNewPatient({ ...newPatient, gender: e.target.value });
                    }}
                    className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-green-500"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Address *</label>
                <AddressInput
                  value={newPatient.address1}
                  onChange={(value: string, parsed?: AddressData) => {
                    if (parsed) {
                      setNewPatient((prev) => ({
                        ...prev,
                        address1: parsed.address1,
                        city: parsed.city,
                        state: parsed.state,
                        zip: parsed.zip,
                      }));
                    } else {
                      setNewPatient((prev) => ({ ...prev, address1: value }));
                    }
                  }}
                  placeholder="Street address"
                  className="w-full"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Address Line 2
                </label>
                <input
                  type="text"
                  value={newPatient.address2}
                  onChange={(e) => {
                    setNewPatient({ ...newPatient, address2: e.target.value });
                  }}
                  className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-green-500"
                  placeholder="Apt, suite, etc. (optional)"
                />
              </div>

              <div className="grid grid-cols-6 gap-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">City *</label>
                  <input
                    type="text"
                    required
                    value={newPatient.city}
                    onChange={(e) => {
                      setNewPatient({ ...newPatient, city: e.target.value });
                    }}
                    className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">State *</label>
                  <select
                    required
                    value={newPatient.state}
                    onChange={(e) => {
                      setNewPatient({ ...newPatient, state: e.target.value });
                    }}
                    className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Select</option>
                    {US_STATE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">ZIP *</label>
                  <input
                    type="text"
                    required
                    value={newPatient.zip}
                    onChange={(e) => {
                      setNewPatient({ ...newPatient, zip: e.target.value });
                    }}
                    className="w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-green-500"
                    placeholder="12345"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                  }}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Patient
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
