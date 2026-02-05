'use client';

import { useRouter } from 'next/navigation';
import { ShieldX, ArrowLeft, LogOut, Home } from 'lucide-react';

export default function UnauthorizedPage() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('auth-token') || 
                    localStorage.getItem('admin-token') || 
                    localStorage.getItem('provider-token');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => {});
      }
    } catch {}
    
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('admin-token');
    localStorage.removeItem('provider-token');
    localStorage.removeItem('super_admin-token');
    localStorage.removeItem('patient-token');
    
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-[#efece7] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldX className="w-8 h-8 text-red-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Access Denied
        </h1>
        
        <p className="text-gray-600 mb-8">
          You don&apos;t have permission to access this page. Please contact your administrator if you believe this is an error.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
          
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4fa77e] text-white rounded-xl hover:bg-[#3d8a65] transition-colors"
          >
            <Home className="w-4 h-4" />
            Home
          </button>
          
          <button
            onClick={handleLogout}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-red-300 text-red-600 rounded-xl hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
        
        <p className="text-xs text-gray-400 mt-8">
          Error Code: 403 Forbidden
        </p>
      </div>
    </div>
  );
}
