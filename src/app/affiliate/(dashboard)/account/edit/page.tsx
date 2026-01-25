'use client';

/**
 * Edit Affiliate Profile Page
 * 
 * Update display name, contact info.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface ProfileData {
  displayName: string;
  email: string;
  phone: string;
}

export default function EditProfilePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    displayName: '',
    email: '',
    phone: '',
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/affiliate/account');
        if (res.ok) {
          const data = await res.json();
          setProfile({
            displayName: data.profile.displayName || '',
            email: data.profile.email || '',
            phone: data.profile.phone || '',
          });
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/affiliate/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/affiliate/account');
        }, 1500);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update profile');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white px-6 py-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link href="/affiliate/account" className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-xl font-semibold text-gray-900">Edit Profile</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-6">
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800"
          >
            Profile updated successfully! Redirecting...
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-6 space-y-6"
          >
            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={profile.displayName}
                onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gray-900 focus:ring-0 transition-colors"
                placeholder="Your name"
              />
              <p className="mt-1 text-sm text-gray-500">
                This is how you'll appear in the partner portal
              </p>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gray-900 focus:ring-0 transition-colors"
                placeholder="you@example.com"
              />
              <p className="mt-1 text-sm text-gray-500">
                Used for login and notifications
              </p>
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-gray-900 focus:ring-0 transition-colors"
                placeholder="+1 (555) 123-4567"
              />
              <p className="mt-1 text-sm text-gray-500">
                Used for SMS notifications and account verification
              </p>
            </div>
          </motion.div>

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            <Link
              href="/affiliate/account"
              className="flex-1 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl text-center hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-3 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 disabled:bg-gray-400 transition-colors flex items-center justify-center"
            >
              {isSaving ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
