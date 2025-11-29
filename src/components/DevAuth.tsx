'use client';

import React, { useState, useEffect } from 'react';

/**
 * Development Authentication Helper
 * REMOVE THIS IN PRODUCTION!
 */
export default function DevAuth() {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);

  // Check localStorage on client side only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const user = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      setCurrentUser(user);
      setHasToken(!!token);
    }
  }, [status]); // Re-check when status changes

  // Only show in development
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    return null;
  }

  const authenticateAs = async (role: string) => {
    try {
      setStatus('Generating token...');
      
      // Get fresh token from dev endpoint
      const response = await fetch('/api/auth/dev-token', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        throw new Error('Failed to get token');
      }

      const data = await response.json();
      
      // Store token in localStorage for client-side requests
      if (typeof window !== 'undefined') {
        localStorage.setItem('token', data.token);
        
        // Also store user info
        localStorage.setItem('user', JSON.stringify(data.user));
      }
      
      setStatus(`✓ Authenticated as ${role}. Refreshing...`);
      
      // Refresh page after short delay
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
    } catch (error: any) {
    // @ts-ignore
   
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    setStatus(`✗ Error: ${errorMessage}`);
    }
  };

  const clearAuth = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setStatus('✓ Cleared authentication. Refreshing...');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-yellow-500 text-black px-3 py-2 rounded-lg shadow-lg hover:bg-yellow-600 text-sm font-semibold"
          title="Development Authentication"
        >
          🔑 Dev Auth
        </button>
      )}

      {isOpen && (
        <div className="bg-white border-2 border-yellow-500 rounded-lg shadow-xl p-4 w-80">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-lg">Dev Authentication</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          <div className="mb-3 p-2 bg-yellow-50 rounded text-xs">
            ⚠️ Development mode only - Remove in production
          </div>

          {hasToken && currentUser && (
            <div className="mb-3 p-2 bg-green-50 rounded text-sm">
              <strong>Current:</strong> {(() => {
                try {
                  return JSON.parse(currentUser).email;
                } catch {
                  return 'Unknown';
                }
              })()}
              <br />
              <strong>Role:</strong> {(() => {
                try {
                  return JSON.parse(currentUser).role;
                } catch {
                  return 'Unknown';
                }
              })()}
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={() => authenticateAs('admin')}
              data-dev-auth-admin
              className="w-full bg-purple-600 text-white px-3 py-2 rounded hover:bg-purple-700"
            >
              Login as Admin
            </button>
            <button
              onClick={() => authenticateAs('provider')}
              data-dev-auth-provider
              className="w-full bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700"
            >
              Login as Provider
            </button>
            <button
              onClick={() => authenticateAs('patient')}
              className="w-full bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700"
            >
              Login as Patient
            </button>
            <button
              onClick={() => authenticateAs('influencer')}
              className="w-full bg-pink-600 text-white px-3 py-2 rounded hover:bg-pink-700"
            >
              Login as Influencer
            </button>
            {hasToken && (
              <button
                onClick={clearAuth}
                className="w-full bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700"
              >
                Clear Authentication
              </button>
            )}
          </div>

          {status && (
            <div className={`mt-3 p-2 rounded text-sm ${
              status.includes('✓') ? 'bg-green-100 text-green-800' : 
              status.includes('✗') ? 'bg-red-100 text-red-800' : 
              'bg-blue-100 text-blue-800'
            }`}>
              {status}
            </div>
          )}

          <div className="mt-3 text-xs text-gray-500">
            This helper allows you to quickly authenticate as different user roles
            for testing. The token is stored in localStorage and sent with API requests.
          </div>
        </div>
      )}
    </div>
  );
}
