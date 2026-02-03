'use client';

/**
 * Profile Settings Page
 * 
 * Allows all users to manage their profile picture and basic profile information.
 * Works for: Admins, Providers, Influencers, Affiliates, Patients, Staff, Support, Sales Reps
 */

import React, { useState, useEffect, useRef } from 'react';
import { EditableAvatar } from '@/components/UserAvatar';

interface ProfileData {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: string;
  avatarUrl?: string | null;
  avatarKey?: string | null;
}

export default function ProfileSettingsPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch profile picture info
      const avatarRes = await fetch('/api/user/profile-picture');
      const avatarData = avatarRes.ok ? await avatarRes.json() : {};

      // Fetch user details from settings dashboard
      const dashboardRes = await fetch('/api/settings/dashboard');
      const dashboardData = dashboardRes.ok ? await dashboardRes.json() : {};

      // Fetch full user info
      const userRes = await fetch('/api/auth/me');
      const userDataWrapper = userRes.ok ? await userRes.json() : {};
      const userData = userDataWrapper.user || userDataWrapper;

      const profileData: ProfileData = {
        id: avatarData.user?.id || userData.id || 0,
        firstName: avatarData.user?.firstName || userData.firstName || '',
        lastName: avatarData.user?.lastName || userData.lastName || '',
        email: dashboardData.user?.email || userData.email || '',
        phone: userData.phone || '',
        role: dashboardData.user?.role || userData.role || 'user',
        avatarUrl: avatarData.avatarUrl || userData.avatarUrl,
        avatarKey: avatarData.avatarKey,
      };

      setProfile(profileData);
      setFirstName(profileData.firstName);
      setLastName(profileData.lastName);
      setPhone(profileData.phone || '');
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please select a valid image file (JPEG, PNG, WebP, or GIF)');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/user/profile-picture', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to upload');
      }

      const data = await res.json();
      
      setProfile((prev) => prev ? {
        ...prev,
        avatarUrl: data.avatarUrl,
        avatarKey: data.avatarKey,
      } : null);

      setSuccess('Profile picture updated!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = async () => {
    if (!profile?.avatarUrl) return;
    
    if (!confirm('Are you sure you want to remove your profile picture?')) {
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const res = await fetch('/api/user/profile-picture', {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove');
      }

      setProfile((prev) => prev ? {
        ...prev,
        avatarUrl: null,
        avatarKey: null,
      } : null);

      setSuccess('Profile picture removed');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setProfile((prev) => prev ? {
        ...prev,
        firstName,
        lastName,
        phone,
      } : null);

      setSuccess('Profile updated!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = profile && (
    firstName !== profile.firstName ||
    lastName !== profile.lastName ||
    phone !== (profile.phone || '')
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Profile Settings</h1>
        <p className="text-gray-600 mt-2">
          Manage your profile picture and personal information
        </p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center">
          <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-center">
          <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {success}
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        {/* Profile Picture Section */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold mb-6">Profile Picture</h2>
          
          <div className="flex items-start gap-6">
            <EditableAvatar
              avatarUrl={profile?.avatarUrl}
              firstName={profile?.firstName}
              lastName={profile?.lastName}
              size="2xl"
              onEdit={handleAvatarClick}
              isLoading={isUploading}
            />
            
            <div className="flex-1">
              <p className="text-sm text-gray-600 mb-4">
                Your profile picture will be displayed in chats, comments, and throughout the platform.
              </p>
              
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleAvatarClick}
                  disabled={isUploading}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 
                           transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {profile?.avatarUrl ? 'Change Picture' : 'Upload Picture'}
                </button>
                
                {profile?.avatarUrl && (
                  <button
                    onClick={handleRemoveAvatar}
                    disabled={isUploading}
                    className="px-4 py-2 border border-red-300 text-red-600 rounded-lg 
                             hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                )}
              </div>
              
              <p className="text-xs text-gray-500 mt-3">
                Recommended: Square image, at least 200x200 pixels. Max 5MB. 
                Supported formats: JPEG, PNG, WebP, GIF.
              </p>
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Personal Information Section */}
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold mb-6">Personal Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                First Name
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md 
                         focus:outline-none focus:ring-green-500 focus:border-green-500"
                placeholder="Enter your first name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md 
                         focus:outline-none focus:ring-green-500 focus:border-green-500"
                placeholder="Enter your last name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-50 
                         text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
                Contact support to change your email address
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md 
                         focus:outline-none focus:ring-green-500 focus:border-green-500"
                placeholder="(555) 555-5555"
              />
            </div>
          </div>
        </div>

        {/* Account Information (Read-only) */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-medium text-gray-700 mb-4">Account Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between py-2">
              <span className="text-gray-500">Role</span>
              <span className="text-gray-900 font-medium capitalize">
                {profile?.role?.toLowerCase().replace('_', ' ')}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-500">User ID</span>
              <span className="text-gray-900 font-mono">{profile?.id}</span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="p-6 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={() => {
              setFirstName(profile?.firstName || '');
              setLastName(profile?.lastName || '');
              setPhone(profile?.phone || '');
            }}
            disabled={!hasChanges || isSaving}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg 
                     hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reset
          </button>
          <button
            onClick={handleSaveProfile}
            disabled={!hasChanges || isSaving}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 
                     transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                     flex items-center gap-2"
          >
            {isSaving && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            Save Changes
          </button>
        </div>
      </div>

      {/* Tips Section */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-sm font-medium text-blue-800 mb-2">Tips for a great profile picture</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>- Use a clear, recent photo of your face</li>
          <li>- Choose a neutral background</li>
          <li>- Make sure your face is well-lit and visible</li>
          <li>- Square images work best</li>
        </ul>
      </div>
    </div>
  );
}
