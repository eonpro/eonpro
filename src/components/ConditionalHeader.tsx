"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClinicSwitcher } from "@/components/clinic/ClinicSwitcher";
import { LogOut, User, Shield, Building2, Users, FileText, Pill, Settings } from "lucide-react";
import { useState, useEffect } from "react";

interface NavLink {
  href: string;
  label: string;
  icon?: React.ReactNode;
  roles: string[];
}

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
    localStorage.removeItem('auth-token');
    localStorage.removeItem('admin-token');
    localStorage.removeItem('provider-token');
    localStorage.removeItem('super_admin-token');
    localStorage.removeItem('user');
    
    document.cookie.split(";").forEach((c) => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    
    router.push('/login');
  };

  const userRole = user?.role?.toLowerCase() || '';
  
  // Define navigation links with role access
  const navLinks: NavLink[] = [
    // Super Admin only links
    { href: '/super-admin', label: 'Super Admin', roles: ['super_admin'] },
    { href: '/super-admin/clinics', label: 'Clinics', roles: ['super_admin'] },
    
    // Admin links (also accessible by super_admin)
    { href: '/admin', label: 'Dashboard', roles: ['admin', 'super_admin'] },
    { href: '/patients', label: 'Patients', roles: ['admin', 'provider', 'staff', 'super_admin'] },
    { href: '/providers', label: 'Providers', roles: ['admin', 'super_admin'] },
    { href: '/intake-forms', label: 'Intake Forms', roles: ['admin', 'staff', 'super_admin'] },
    { href: '/pharmacy/analytics', label: 'Pharmacy', roles: ['admin', 'provider', 'super_admin'] },
    { href: '/settings', label: 'Settings', roles: ['admin', 'super_admin'] },
  ];

  // Filter links based on user role
  const visibleLinks = navLinks.filter(link => link.roles.includes(userRole));
  
  // Don't show admin header on role-specific pages (they have their own headers)
  // or on authentication/public pages
  const noHeaderPages = [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/influencer',
    '/patient-portal',
    '/provider',
    '/staff',
    '/support',
    '/demo',
    '/pay/',
  ];
  
  const isNoHeaderPage = noHeaderPages.some(page => pathname?.startsWith(page));
  const multiClinicEnabled = process.env.NEXT_PUBLIC_ENABLE_MULTI_CLINIC === 'true';
  
  if (isNoHeaderPage) {
    return null;
  }

  // Get dashboard link based on role
  const getDashboardLink = () => {
    if (userRole === 'super_admin') return '/super-admin';
    return '/admin';
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href={getDashboardLink()}>
            <img
              src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
              alt="EONPRO logo"
              className="h-10 w-auto"
            />
          </Link>
          
          {multiClinicEnabled && userRole !== 'super_admin' && (
            <div className="border-l border-gray-300 pl-4">
              <ClinicSwitcher />
            </div>
          )}
          
          {userRole === 'super_admin' && (
            <span className="px-2 py-1 bg-slate-800 text-white text-xs font-medium rounded">
              Super Admin
            </span>
          )}
        </div>
        
        <nav className="flex items-center space-x-6">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition ${
                pathname === link.href || pathname?.startsWith(link.href + '/')
                  ? 'text-teal-600' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
          
          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition"
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                userRole === 'super_admin' ? 'bg-slate-800' : 'bg-teal-100'
              }`}>
                {userRole === 'super_admin' ? (
                  <Shield className="w-4 h-4 text-white" />
                ) : (
                  <User className="w-4 h-4 text-teal-600" />
                )}
              </div>
              <span className="hidden md:inline">{user?.email || 'User'}</span>
            </button>
            
            {showDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowDropdown(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">{user?.name || user?.email}</p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded ${
                      userRole === 'super_admin' ? 'bg-slate-800 text-white' :
                      userRole === 'admin' ? 'bg-purple-100 text-purple-700' :
                      userRole === 'provider' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {user?.role?.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  
                  {userRole === 'super_admin' && (
                    <Link
                      href="/super-admin"
                      onClick={() => setShowDropdown(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Super Admin Dashboard
                    </Link>
                  )}
                  
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
