"use client";

import { useState, useEffect, useCallback, useRef } from "react";

import { useRouter } from "next/navigation";

import { Users, Search, UserPlus, X, Loader2, ChevronDown } from "lucide-react";

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
  hasMore: boolean;
}

const PAGE_SIZE = 50; // Load 50 at a time for better UX

export default function ProviderPatientsPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false); // New: for search-in-progress indicator
  const [loadingMore, setLoadingMore] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<PaginationMeta>({ count: 0, total: 0, hasMore: false });
  const [offset, setOffset] = useState(0);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);

  // New patient form
  const [newPatient, setNewPatient] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dob: "",
    gender: "male",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
  });

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // Fetch patients function
  const fetchPatients = useCallback(async (currentOffset: number, isNewSearch = false, searchQuery = "") => {
    try {
      // Only show full loading spinner on initial page load
      // For searches, show a subtle searching indicator without clearing the list
      if (isNewSearch && isInitialLoadRef.current) {
        setLoading(true);
      } else if (isNewSearch) {
        setSearching(true);
      } else {
        setLoadingMore(true);
      }

      const token = localStorage.getItem("auth-token") || localStorage.getItem("provider-token");

      // Build query params with server-side search and pagination
      const params = new URLSearchParams({
        includeContact: "true",
        limit: PAGE_SIZE.toString(),
        offset: currentOffset.toString(),
      });

      // Add server-side search if present
      if (searchQuery.trim()) {
        params.set("search", searchQuery.trim());
      }

      const response = await fetch(`/api/patients?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Map API response to component interface
        const mapped = (data.patients || []).map((p: any) => ({
          id: p.id,
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          email: p.email || '',
          phone: p.phone || '',
          dateOfBirth: p.dateOfBirth || '',
          gender: p.gender || '',
          status: p.status || 'active', // Default to active if no status
          createdAt: p.createdAt || '',
        }));

        if (isNewSearch) {
          setPatients(mapped);
          isInitialLoadRef.current = false;
        } else {
          setPatients(prev => [...prev, ...mapped]);
        }

        setMeta({
          count: data.meta?.count || mapped.length,
          total: data.meta?.total || mapped.length,
          hasMore: data.meta?.hasMore || false,
        });
        setOffset(currentOffset + mapped.length);
      }
    } catch (err) {
      console.error("Error fetching patients:", err);
    } finally {
      setLoading(false);
      setSearching(false);
      setLoadingMore(false);
    }
  }, []);

  // Fetch patients when search changes (including initial load)
  useEffect(() => {
    setOffset(0);
    // Don't clear patients here - let fetchPatients handle the replacement
    // This prevents flickering and allows typing to work smoothly
    fetchPatients(0, true, debouncedSearch);
  }, [debouncedSearch, fetchPatients]);

  const loadMore = () => {
    if (!loadingMore && meta.hasMore) {
      fetchPatients(offset, false, debouncedSearch);
    }
  };

  const loadAll = async () => {
    // Load all remaining patients
    let currentOffset = offset;
    setLoadingMore(true);
    
    try {
      const token = localStorage.getItem("auth-token") || localStorage.getItem("provider-token");
      let hasMore = true;
      let allNewPatients: Patient[] = [];
      
      while (hasMore) {
        const params = new URLSearchParams({
          includeContact: "true",
          limit: "500", // Max limit to load faster
          offset: currentOffset.toString(),
        });
        
        if (debouncedSearch.trim()) {
          params.set("search", debouncedSearch.trim());
        }

        const response = await fetch(`/api/patients?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          const mapped = (data.patients || []).map((p: any) => ({
            id: p.id,
            firstName: p.firstName || '',
            lastName: p.lastName || '',
            email: p.email || '',
            phone: p.phone || '',
            dateOfBirth: p.dateOfBirth || '',
            gender: p.gender || '',
            status: p.status || 'active',
            createdAt: p.createdAt || '',
          }));
          
          allNewPatients = [...allNewPatients, ...mapped];
          currentOffset += mapped.length;
          hasMore = data.meta?.hasMore || false;
          
          setMeta({
            count: data.meta?.count || 0,
            total: data.meta?.total || 0,
            hasMore: false,
          });
        } else {
          break;
        }
      }
      
      setPatients(prev => [...prev, ...allNewPatients]);
      setOffset(currentOffset);
    } catch (err) {
      console.error("Error loading all patients:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError("");

    try {
      const token = localStorage.getItem("auth-token") || localStorage.getItem("provider-token");
      const response = await fetch("/api/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newPatient),
      });

      const data = await response.json();

      if (response.ok) {
        setShowAddModal(false);
        setNewPatient({
          firstName: "",
          lastName: "",
          email: "",
          phone: "",
          dob: "",
          gender: "male",
          address1: "",
          address2: "",
          city: "",
          state: "",
          zip: "",
        });
        // Reset search and refresh the patient list
        setSearchTerm("");
        setDebouncedSearch("");
        setOffset(0);
        setPatients([]);
        fetchPatients(0, true, "");
      } else {
        // Parse validation errors if present
        if (data.issues) {
          const messages = data.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ');
          setError(messages);
        } else {
          setError(data.error || "Failed to create patient");
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to create patient");
    } finally {
      setCreating(false);
    }
  };

  const calculateAge = (dob: string) => {
    if (!dob) {return "-";}
    // Check if the value looks like encrypted data (contains colons and base64-like characters)
    if (dob.includes(':') && dob.length > 50) {
      return "-"; // Encrypted data, can't calculate age
    }
    const birthDate = new Date(dob);
    // Check if date is valid
    if (isNaN(birthDate.getTime())) {
      return "-";
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
    switch(status?.toLowerCase()) {
      case "active": return "bg-green-100 text-green-800";
      case "critical": return "bg-red-100 text-red-800";
      case "inactive": return "bg-gray-100 text-gray-800";
      default: return "bg-blue-100 text-blue-800";
    }
  };

  // Client-side filtering only for status (search is now server-side)
  const filteredPatients = patients.filter(patient => {
    return filterStatus === "all" || patient.status?.toLowerCase() === filterStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            My Patients
          </h1>
          <button
            onClick={() => { setShowAddModal(true); }}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4" />
            Add Patient
          </button>
        </div>

        {/* Search and Filter */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            {searching ? (
              <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-green-500 animate-spin" />
            ) : (
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            )}
            <input
              type="text"
              placeholder="Search patients by name..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); }}
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); }}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
          >
            <option value="all">All Patients</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-gray-900">{meta.total}</div>
          <div className="text-sm text-gray-600">Total Patients</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-green-600">{patients.length}</div>
          <div className="text-sm text-gray-600">
            Loaded {meta.hasMore && <span className="text-xs text-gray-400">(of {meta.total})</span>}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-gray-600">
            {patients.filter(p => p.status?.toLowerCase() === "inactive").length}
          </div>
          <div className="text-sm text-gray-600">Inactive</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-blue-600">
            {patients.filter(p => {
              const created = new Date(p.createdAt);
              const weekAgo = new Date();
              weekAgo.setDate(weekAgo.getDate() - 7);
              return created > weekAgo;
            }).length}
          </div>
          <div className="text-sm text-gray-600">New This Week</div>
        </div>
      </div>

      {/* Patients List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          {filteredPatients.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">
                {searchTerm ? "No patients match your search" : "No patients yet"}
              </p>
              <button
                onClick={() => { setShowAddModal(true); }}
                className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Add Your First Patient
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">Patient</th>
                    <th className="text-left py-3 px-4">Contact</th>
                    <th className="text-left py-3 px-4">Age/Gender</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-left py-3 px-4">Added</th>
                    <th className="text-left py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => { router.push(`/patients/${patient.id}`); }}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium">{patient.firstName} {patient.lastName}</div>
                        <div className="text-sm text-gray-500">ID: {patient.patientId || patient.id}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm">{patient.email || <span className="text-gray-400">No email</span>}</div>
                        <div className="text-sm text-gray-500">{patient.phone || <span className="text-gray-400">No phone</span>}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          {calculateAge(patient.dateOfBirth) !== "-" 
                            ? `${calculateAge(patient.dateOfBirth)} years` 
                            : "N/A"}
                        </div>
                        <div className="text-sm text-gray-500 capitalize">
                          {patient.gender ? patient.gender.charAt(0).toUpperCase() : "-"}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(patient.status)}`}>
                          {patient.status || "Active"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {new Date(patient.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); router.push(`/patients/${patient.id}`); }}
                            className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
                          >
                            View
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); router.push(`/patients/${patient.id}?tab=chat`); }}
                            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
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
                <div className="flex items-center justify-center gap-4 py-6 border-t mt-4">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
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
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                  >
                    Load All ({meta.total - patients.length} remaining)
                  </button>
                </div>
              )}
              
              {/* Pagination info */}
              <div className="text-center text-sm text-gray-500 py-4">
                Showing {filteredPatients.length} of {meta.total} patients
                {debouncedSearch && ` matching "${debouncedSearch}"`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Patient Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto py-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 my-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold">Add New Patient</h3>
              <button onClick={() => { setShowAddModal(false); }}>
                <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <form onSubmit={handleCreatePatient} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPatient.firstName}
                    onChange={(e) => { setNewPatient({ ...newPatient, firstName: e.target.value }); }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPatient.lastName}
                    onChange={(e) => { setNewPatient({ ...newPatient, lastName: e.target.value }); }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={newPatient.email}
                    onChange={(e) => { setNewPatient({ ...newPatient, email: e.target.value }); }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    value={newPatient.phone}
                    onChange={(e) => { setNewPatient({ ...newPatient, phone: e.target.value }); }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              {/* DOB and Gender */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    required
                    value={newPatient.dob}
                    onChange={(e) => { setNewPatient({ ...newPatient, dob: e.target.value }); }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gender *
                  </label>
                  <select
                    required
                    value={newPatient.gender}
                    onChange={(e) => { setNewPatient({ ...newPatient, gender: e.target.value }); }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address *
                </label>
                <input
                  type="text"
                  required
                  value={newPatient.address1}
                  onChange={(e) => { setNewPatient({ ...newPatient, address1: e.target.value }); }}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Street address"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address Line 2
                </label>
                <input
                  type="text"
                  value={newPatient.address2}
                  onChange={(e) => { setNewPatient({ ...newPatient, address2: e.target.value }); }}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Apt, suite, etc. (optional)"
                />
              </div>

              <div className="grid grid-cols-6 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPatient.city}
                    onChange={(e) => { setNewPatient({ ...newPatient, city: e.target.value }); }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State *
                  </label>
                  <select
                    required
                    value={newPatient.state}
                    onChange={(e) => { setNewPatient({ ...newPatient, state: e.target.value }); }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Select</option>
                    <option value="AL">AL</option>
                    <option value="AK">AK</option>
                    <option value="AZ">AZ</option>
                    <option value="AR">AR</option>
                    <option value="CA">CA</option>
                    <option value="CO">CO</option>
                    <option value="CT">CT</option>
                    <option value="DE">DE</option>
                    <option value="FL">FL</option>
                    <option value="GA">GA</option>
                    <option value="HI">HI</option>
                    <option value="ID">ID</option>
                    <option value="IL">IL</option>
                    <option value="IN">IN</option>
                    <option value="IA">IA</option>
                    <option value="KS">KS</option>
                    <option value="KY">KY</option>
                    <option value="LA">LA</option>
                    <option value="ME">ME</option>
                    <option value="MD">MD</option>
                    <option value="MA">MA</option>
                    <option value="MI">MI</option>
                    <option value="MN">MN</option>
                    <option value="MS">MS</option>
                    <option value="MO">MO</option>
                    <option value="MT">MT</option>
                    <option value="NE">NE</option>
                    <option value="NV">NV</option>
                    <option value="NH">NH</option>
                    <option value="NJ">NJ</option>
                    <option value="NM">NM</option>
                    <option value="NY">NY</option>
                    <option value="NC">NC</option>
                    <option value="ND">ND</option>
                    <option value="OH">OH</option>
                    <option value="OK">OK</option>
                    <option value="OR">OR</option>
                    <option value="PA">PA</option>
                    <option value="RI">RI</option>
                    <option value="SC">SC</option>
                    <option value="SD">SD</option>
                    <option value="TN">TN</option>
                    <option value="TX">TX</option>
                    <option value="UT">UT</option>
                    <option value="VT">VT</option>
                    <option value="VA">VA</option>
                    <option value="WA">WA</option>
                    <option value="WV">WV</option>
                    <option value="WI">WI</option>
                    <option value="WY">WY</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ZIP *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPatient.zip}
                    onChange={(e) => { setNewPatient({ ...newPatient, zip: e.target.value }); }}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="12345"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
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
