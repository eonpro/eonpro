'use client';

import { useState } from 'react';
import { Patient, Provider, Order } from '@/types/models';

interface ProviderPasswordSetupProps {
  providerId: number;
  providerName: string;
  hasPassword: boolean;
  onPasswordSet?: () => void;
}

export default function ProviderPasswordSetup({ 
  providerId, 
  providerName,
  hasPassword,
  onPasswordSet 
}: ProviderPasswordSetupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/providers/${providerId}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to set password');
      }

      setSuccess('Password set successfully!');
      setPassword('');
      setConfirmPassword('');
      
      // Close modal after 2 seconds
      setTimeout(() => {
        setIsOpen(false);
        if (onPasswordSet) onPasswordSet();
      }, 2000);
    } catch (err: any) {
    // @ts-ignore
   
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Setup Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`px-4 py-2 rounded-lg ${
          hasPassword 
            ? 'bg-gray-600 text-white hover:bg-gray-700' 
            : 'bg-[#4fa77e] text-white hover:bg-[#3f8660]'
        }`}
      >
        {hasPassword ? 'Change Password' : 'Set Password'}
      </button>

      {/* Password Setup Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">
              {hasPassword ? 'Change Provider Password' : 'Set Provider Password'}
            </h2>
            
            <p className="text-gray-600 mb-6">
              Set a password for <strong>{providerName}</strong>. 
              This password will be used to approve SOAP notes and access provider-specific features.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password (min 8 characters)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e: any) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  placeholder="Enter password"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e: any) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  placeholder="Confirm password"
                  required
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
                  {success}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setPassword('');
                    setConfirmPassword('');
                    setError('');
                    setSuccess('');
                  }}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-[#4fa77e] text-white rounded-lg hover:bg-[#3f8660] disabled:opacity-50"
                >
                  {isSubmitting ? 'Setting...' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
