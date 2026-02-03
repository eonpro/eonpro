'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Ticket, LogOut, ArrowLeft
} from 'lucide-react';
import {
  NotificationProvider,
  NotificationCenter,
  NotificationToastContainer
} from '@/components/notifications';
import { ClinicBrandingProvider } from '@/lib/contexts/ClinicBrandingContext';

function TicketsLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(user);
      const role = parsedUser.role?.toLowerCase();
      setUserRole(role);
      setLoading(false);
    } catch {
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    router.push('/login');
  };

  // Determine where to go back based on role
  const getBackPath = () => {
    switch (userRole) {
      case 'super_admin':
        return '/super-admin';
      case 'provider':
        return '/provider';
      case 'staff':
        return '/staff';
      default:
        return '/admin';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#efece7]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[#4fa77e] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#efece7]">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href={getBackPath()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-medium">Back to Dashboard</span>
          </Link>
          <div className="h-6 w-px bg-gray-300" />
          <div className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-[#4fa77e]" />
            <span className="text-lg font-semibold text-gray-900">Ticket Management</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <NotificationCenter notificationsPath="/admin/notifications" />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        {children}
      </main>
    </div>
  );
}

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicBrandingProvider>
      <NotificationProvider>
        <TicketsLayoutInner>{children}</TicketsLayoutInner>
        <NotificationToastContainer />
      </NotificationProvider>
    </ClinicBrandingProvider>
  );
}
