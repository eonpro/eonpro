'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon } from '@/components/icons/SettingsIcons';
import UserCreateModal from './UserCreateModal';

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  lastLogin: string | null;
  createdAt: string;
}

export default function UserManagementPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([
    // Demo users for display
    {
      id: 1,
      email: 'admin@lifefile.com',
      firstName: 'Admin',
      lastName: 'User',
      role: "admin",
      status: 'ACTIVE',
      lastLogin: '2024-11-26T10:00:00Z',
      createdAt: '2024-01-01T00:00:00Z'
    },
    {
      id: 2,
      email: 'provider@lifefile.com',
      firstName: 'Dr. John',
      lastName: 'Smith',
      role: "provider",
      status: 'ACTIVE',
      lastLogin: '2024-11-25T15:30:00Z',
      createdAt: '2024-03-15T00:00:00Z'
    }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form states for creating user
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: "patient",
    // Provider fields
    npi: '',
    licenseNumber: '',
    licenseState: '',
    deaNumber: '',
    specialty: '',
    phone: '',
    address: '',
    acceptingNewPatients: false,
  });

  useEffect(() => {
    // Users are pre-loaded with demo data
    setLoading(false);
  }, []);

  const fetchUsers = async () => {
    // In demo mode, users are already loaded
    // In production, this would fetch from API
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Demo mode: Add user to local state
    const newUser: User = {
      id: users.length + 1,
      email: formData.email,
      firstName: formData.firstName,
      lastName: formData.lastName,
      role: formData.role,
      status: 'ACTIVE',
      lastLogin: null,
      createdAt: new Date().toISOString(),
    };
    
    setUsers([...users, newUser]);
    setShowCreateModal(false);
    
    // Show success message
    setSuccessMessage(`User ${formData.email} created successfully!`);
    setTimeout(() => setSuccessMessage(null), 3000);
    
    // Reset form
    setFormData({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      role: "patient",
      npi: '',
      licenseNumber: '',
      licenseState: '',
      deaNumber: '',
      specialty: '',
      phone: '',
      address: '',
      acceptingNewPatients: false,
    });
    
    // In production, this would call the API:
    // const response = await fetch('/api/users/create', {...})
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'INACTIVE': return 'bg-gray-100 text-gray-800';
      case 'SUSPENDED': return 'bg-red-100 text-red-800';
      case 'PENDING_VERIFICATION': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin": return 'bg-purple-100 text-purple-800';
      case "admin": return 'bg-blue-100 text-blue-800';
      case "provider": return 'bg-green-100 text-green-800';
      case "influencer": return 'bg-pink-100 text-pink-800';
      case "patient": return 'bg-gray-100 text-gray-800';
      case 'staff': return 'bg-yellow-100 text-yellow-800';
      case 'support': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  // Success message display
  if (successMessage) {
    setTimeout(() => setSuccessMessage(null), 3000);
  }

  return (
    <div>
      {/* Success Message */}
      {successMessage && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {successMessage}
        </div>
      )}
      
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600 mt-2">Manage platform users and permissions</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          Create User
        </button>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Login
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user: any) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {user.firstName} {user.lastName}
                    </div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleColor(user.role)}`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(user.status)}`}>
                    {user.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button className="text-indigo-600 hover:text-indigo-900 mr-3">
                    Edit
                  </button>
                  <button className="text-red-600 hover:text-red-900">
                    Suspend
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {users.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No users found</p>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      <UserCreateModal
        show={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateUser}
        formData={formData}
        setFormData={setFormData}
      />
    </div>
  );
}
