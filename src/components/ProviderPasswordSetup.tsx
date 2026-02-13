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
  onPasswordSet,
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
    if (password.length < 12) {
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
        className={`rounded-lg px-4 py-2 ${
          hasPassword
            ? 'bg-gray-600 text-white hover:bg-gray-700'
            : 'bg-[#4fa77e] text-white hover:bg-[#3f8660]'
        }`}
      >
        {hasPassword ? 'Change Password' : 'Set Password'}
      </button>

      {/* Password Setup Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <h2 className="mb-4 text-xl font-bold">
              {hasPassword ? 'Change Provider Password' : 'Set Provider Password'}
            </h2>

            <p className="mb-6 text-gray-600">
              Set a password for <strong>{providerName}</strong>. This password will be used to
              approve SOAP notes and access provider-specific features.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Password (min 8 characters)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e: any) => setPassword(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  placeholder="Enter password"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e: any) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#4fa77e]"
                  placeholder="Confirm password"
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}

              {success && (
                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>
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
                  className="rounded-lg border px-4 py-2 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-[#4fa77e] px-4 py-2 text-white hover:bg-[#3f8660] disabled:opacity-50"
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
