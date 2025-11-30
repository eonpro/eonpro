"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClinicSwitcher } from "@/components/clinic/ClinicSwitcher";
import { LogOut, User } from "lucide-react";
import { useState, useEffect } from "react";

export default function ConditionalHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ name?: string; email?: string; role?: string } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleLogout = () => {
    // Clear all auth data
    localStorage.removeItem('auth-token');
    localStorage.removeItem('admin-token');
    localStorage.removeItem('provider-token');
    localStorage.removeItem('super_admin-token');
    localStorage.removeItem('user');
    
    // Clear cookies
    document.cookie.split(";").forEach((c) => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    
    // Redirect to login
    router.push('/login');
  };
  
  // Don't show admin header on role-specific pages (they have their own headers)
  const roleSpecificPages = [
    '/influencer',
    '/patient-portal',
    '/provider',
    '/staff',
    '/support',
    '/demo',
  ];
  
  const isRoleSpecificPage = roleSpecificPages.some(page => pathname?.startsWith(page));
  
  // Check if multi-clinic is enabled
  const multiClinicEnabled = process.env.NEXT_PUBLIC_ENABLE_MULTI_CLINIC === 'true';
  
  if (isRoleSpecificPage) {
    return null; // No header for role-specific pages
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <img
              src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
              alt="EONPRO logo"
              className="h-10 w-auto"
            />
          </Link>
          
          {multiClinicEnabled && (
            <div className="border-l border-gray-300 pl-4">
              <ClinicSwitcher />
            </div>
          )}
        </div>
        
        <nav className="flex items-center space-x-6">
          <Link
            href="/admin"
            className={`text-sm font-medium transition ${
              pathname === '/admin' 
                ? 'text-green-600' 
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Dashboard
          </Link>
          <Link
            href="/patients"
            className={`text-sm font-medium transition ${
              pathname?.startsWith('/patients')
                ? 'text-green-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Patients
          </Link>
          <Link
            href="/intake-forms"
            className={`text-sm font-medium transition flex items-center ${
              pathname?.startsWith('/intake-forms')
                ? 'text-green-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Intake Forms
          </Link>
          <Link
            href="/pharmacy/analytics"
            className={`text-sm font-medium transition flex items-center ${
              pathname?.startsWith('/pharmacy')
                ? 'text-green-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Pharmacy
          </Link>
          <Link
            href="/settings"
            className={`text-sm font-medium transition flex items-center ${
              pathname?.startsWith('/settings')
                ? 'text-green-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </Link>
          
          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-teal-600" />
              </div>
              <span className="hidden md:inline">{user?.name || user?.email || 'User'}</span>
            </button>
            
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-sm font-medium text-gray-900">{user?.name || 'User'}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                  <p className="text-xs text-teal-600 capitalize">{user?.role?.replace('_', ' ')}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
