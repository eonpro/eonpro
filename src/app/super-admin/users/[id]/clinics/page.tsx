'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, Building2, Plus, Trash2, Check, AlertCircle, 
  Star, RefreshCw, Search 
} from 'lucide-react';

interface Clinic {
  id: number;
  name: string;
  subdomain: string;
  customDomain?: string;
  logoUrl?: string;
  primaryColor?: string;
  status: string;
}

interface UserClinic {
  id: number;
  clinicId: number;
  role: string;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: string;
  clinic: Clinic;
}

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export default function UserClinicsPage() {
  const params = useParams();
  const router = useRouter();
  const userId = parseInt(params.id as string);

  const [user, setUser] = useState<User | null>(null);
  const [userClinics, setUserClinics] = useState<UserClinic[]>([]);
  const [allClinics, setAllClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (userId) {
      fetchUserData();
      fetchUserClinics();
      fetchAllClinics();
    }
  }, [userId]);

  const getAuthToken = () => {
    return localStorage.getItem('auth-token') || 
           localStorage.getItem('super_admin-token') ||
           localStorage.getItem('SUPER_ADMIN-token');
  };

  const fetchUserData = async () => {
    // User data is now fetched along with clinics
  };

  const fetchUserClinics = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/super-admin/users/${userId}/clinics`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUserClinics(data.userClinics || []);
        
        // Set user data from the response
        if (data.user) {
          setUser(data.user);
        }
        
        // If no userClinics but there's a legacy clinic, show that
        if ((!data.userClinics || data.userClinics.length === 0) && data.legacyClinic) {
          // Create a pseudo UserClinic entry from legacy data
          setUserClinics([{
            id: 0,
            clinicId: data.legacyClinic.id,
            role: data.user?.role || 'staff',
            isPrimary: true,
            isActive: true,
            createdAt: new Date().toISOString(),
            clinic: data.legacyClinic,
          }]);
        }
      } else {
        const errorData = await response.json();
        console.error('Error response:', errorData);
      }
    } catch (error) {
      console.error('Error fetching user clinics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllClinics = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch('/api/super-admin/clinics', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setAllClinics(data.clinics || []);
      }
    } catch (error) {
      console.error('Error fetching clinics:', error);
    }
  };

  const handleAddToClinic = async () => {
    if (!selectedClinicId || !selectedRole) {
      alert('Please select a clinic and role');
      return;
    }

    setAdding(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/super-admin/users/${userId}/clinics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          clinicId: selectedClinicId,
          role: selectedRole,
          isPrimary: userClinics.length === 0, // First clinic is primary
        }),
      });

      if (response.ok) {
        setShowAddModal(false);
        setSelectedClinicId(null);
        setSelectedRole('');
        fetchUserClinics();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to add user to clinic');
      }
    } catch (error) {
      console.error('Error adding to clinic:', error);
      alert('Failed to add user to clinic');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveFromClinic = async (clinicId: number) => {
    if (!confirm('Are you sure you want to remove this user from this clinic?')) {
      return;
    }

    try {
      const token = getAuthToken();
      const response = await fetch(`/api/super-admin/users/${userId}/clinics?clinicId=${clinicId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        fetchUserClinics();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to remove user from clinic');
      }
    } catch (error) {
      console.error('Error removing from clinic:', error);
      alert('Failed to remove user from clinic');
    }
  };

  const handleSetPrimary = async (clinicId: number) => {
    try {
      const token = getAuthToken();
      // Update all to non-primary first, then set the selected one as primary
      const response = await fetch(`/api/super-admin/users/${userId}/clinics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          clinicId,
          isPrimary: true,
          role: userClinics.find(uc => uc.clinicId === clinicId)?.role,
        }),
      });

      if (response.ok) {
        fetchUserClinics();
      }
    } catch (error) {
      console.error('Error setting primary clinic:', error);
    }
  };

  // Filter clinics that user is not already assigned to
  const availableClinics = allClinics.filter(
    clinic => !userClinics.some(uc => uc.clinicId === clinic.id)
  ).filter(
    clinic => clinic.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              clinic.subdomain.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="h-8 w-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Clinic Assignments</h1>
            <p className="text-gray-500">Manage which clinics this user can access</p>
          </div>
        </div>

        {/* User Info Card */}
        <div className="bg-white rounded-xl p-6 border border-gray-200 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-teal-700">
                  {user ? `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}` : 'U'}
                </span>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {user ? `${user.firstName} ${user.lastName}` : `User #${userId}`}
                </h2>
                <p className="text-gray-500">
                  {user?.email && <span className="block text-sm">{user.email}</span>}
                  Assigned to {userClinics.length} clinic{userClinics.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add to Clinic
            </button>
          </div>
        </div>

        {/* Clinic Assignments */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Assigned Clinics</h3>
          </div>

          {userClinics.length === 0 ? (
            <div className="p-8 text-center">
              <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">User is not assigned to any clinics</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-4 text-teal-600 hover:text-teal-700 font-medium"
              >
                Add to a clinic
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {userClinics.map((uc) => (
                <div key={uc.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-4">
                    {uc.clinic.logoUrl ? (
                      <img 
                        src={uc.clinic.logoUrl} 
                        alt="" 
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div 
                        className="h-12 w-12 rounded-lg flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: uc.clinic.primaryColor || '#3B82F6' }}
                      >
                        {uc.clinic.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{uc.clinic.name}</p>
                        {uc.isPrimary && (
                          <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                            <Star className="h-3 w-3" />
                            Primary
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{uc.clinic.subdomain}.eonpro.io</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Role: <span className="font-medium">{uc.role}</span>
                        {!uc.isActive && (
                          <span className="ml-2 text-red-500">(Inactive)</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!uc.isPrimary && (
                      <button
                        onClick={() => handleSetPrimary(uc.clinicId)}
                        className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                        title="Set as primary clinic"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveFromClinic(uc.clinicId)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove from clinic"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-800 font-medium">Multi-Clinic Access</p>
              <p className="text-sm text-blue-700 mt-1">
                Users assigned to multiple clinics can switch between them using the clinic 
                switcher in the header. They will see different data based on the active clinic.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Add to Clinic Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Add User to Clinic</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search clinics..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              {/* Clinic Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Clinic</label>
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                  {availableClinics.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      {searchTerm ? 'No matching clinics found' : 'User is already assigned to all clinics'}
                    </div>
                  ) : (
                    availableClinics.map((clinic) => (
                      <button
                        key={clinic.id}
                        onClick={() => setSelectedClinicId(clinic.id)}
                        className={`w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left ${
                          selectedClinicId === clinic.id ? 'bg-teal-50 border-l-4 border-teal-500' : ''
                        }`}
                      >
                        <div 
                          className="h-8 w-8 rounded flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                          style={{ backgroundColor: clinic.primaryColor || '#3B82F6' }}
                        >
                          {clinic.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{clinic.name}</p>
                          <p className="text-xs text-gray-500">{clinic.subdomain}.eonpro.io</p>
                        </div>
                        {selectedClinicId === clinic.id && (
                          <Check className="h-5 w-5 text-teal-600 flex-shrink-0" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Role in this Clinic</label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">Select a role</option>
                  <option value="ADMIN">Admin - Full clinic access</option>
                  <option value="PROVIDER">Provider - Patient care access</option>
                  <option value="STAFF">Staff - Limited administrative access</option>
                  <option value="SUPPORT">Support - Customer service access</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-gray-200">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddToClinic}
                disabled={!selectedClinicId || !selectedRole || adding}
                className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {adding ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add to Clinic
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

