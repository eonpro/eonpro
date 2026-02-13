'use client';

import { useRouter } from 'next/navigation';
import { ShieldX, ArrowLeft, LogOut, Home } from 'lucide-react';

export default function UnauthorizedPage() {
  const router = useRouter();

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token =
      localStorage.getItem('auth-token') ||
      localStorage.getItem('admin-token') ||
      localStorage.getItem('provider-token');
    if (token)
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('admin-token');
    localStorage.removeItem('provider-token');
    localStorage.removeItem('super_admin-token');
    localStorage.removeItem('patient-token');
    window.location.href = '/login';
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#efece7] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <ShieldX className="h-8 w-8 text-red-600" />
        </div>

        <h1 className="mb-2 text-2xl font-bold text-gray-900">Access Denied</h1>

        <p className="mb-8 text-gray-600">
          You don&apos;t have permission to access this page. Please contact your administrator if
          you believe this is an error.
        </p>

        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>

          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4fa77e] px-4 py-2.5 text-white transition-colors hover:bg-[#3d8a65]"
          >
            <Home className="h-4 w-4" />
            Home
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 px-4 py-2.5 text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>

        <p className="mt-8 text-xs text-gray-400">Error Code: 403 Forbidden</p>
      </div>
    </div>
  );
}
