"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClinicSwitcher } from "@/components/clinic/ClinicSwitcher";
import { LogOut, User, Shield, Menu, X, ChevronRight } from "lucide-react";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

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
    { href: '/super-admin', label: 'Super Admin', roles: ['super_admin'] },
    { href: '/super-admin/clinics', label: 'Clinics', roles: ['super_admin'] },
    { href: '/admin', label: 'Dashboard', roles: ['admin', 'super_admin'] },
    { href: '/patients', label: 'Patients', roles: ['admin', 'provider', 'staff', 'super_admin'] },
    { href: '/providers', label: 'Providers', roles: ['admin', 'super_admin'] },
    { href: '/intake-forms', label: 'Intake Forms', roles: ['admin', 'staff', 'super_admin'] },
    { href: '/pharmacy/analytics', label: 'Pharmacy', roles: ['admin', 'provider', 'super_admin'] },
    { href: '/settings', label: 'Settings', roles: ['admin', 'super_admin'] },
  ];

  const visibleLinks = navLinks.filter(link => link.roles.includes(userRole));
  
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

  const getDashboardLink = () => {
    if (userRole === 'super_admin') return '/super-admin';
    return '/admin';
  };

  return (
    <>
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">
          {/* Logo + Clinic Switcher */}
          <div className="flex items-center gap-3">
            <Link href={getDashboardLink()} className="flex-shrink-0">
              <img
                src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
                alt="EONPRO logo"
                className="h-8 sm:h-10 w-auto"
              />
            </Link>
            
            {multiClinicEnabled && userRole !== 'super_admin' && (
              <div className="hidden sm:block border-l border-gray-300 pl-3">
                <ClinicSwitcher />
              </div>
            )}
            
            {userRole === 'super_admin' && (
              <span className="hidden sm:inline-block px-2 py-1 bg-slate-800 text-white text-xs font-medium rounded">
                Super Admin
              </span>
            )}
          </div>
          
          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-1 xl:space-x-4">
            {visibleLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  pathname === link.href || pathname?.startsWith(link.href + '/')
                    ? 'text-teal-600 bg-teal-50' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {link.label}
              </Link>
            ))}
            
            {/* Desktop User Menu */}
            <div className="relative ml-2">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition"
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
              </button>
              
              {showDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowDropdown(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
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

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu Drawer */}
      <div 
        className={`fixed top-0 right-0 h-full w-[85%] max-w-sm bg-white z-50 transform transition-transform duration-300 ease-out lg:hidden ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Mobile Menu Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              userRole === 'super_admin' ? 'bg-slate-800' : 'bg-teal-100'
            }`}>
              {userRole === 'super_admin' ? (
                <Shield className="w-5 h-5 text-white" />
              ) : (
                <User className="w-5 h-5 text-teal-600" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{user?.name || 'User'}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition"
            aria-label="Close menu"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Mobile Role Badge */}
        {user?.role && (
          <div className="px-4 py-2 border-b border-gray-100">
            <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${
              userRole === 'super_admin' ? 'bg-slate-800 text-white' :
              userRole === 'admin' ? 'bg-purple-100 text-purple-700' :
              userRole === 'provider' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {user?.role?.replace('_', ' ').toUpperCase()}
            </span>
          </div>
        )}

        {/* Mobile Clinic Switcher */}
        {multiClinicEnabled && userRole !== 'super_admin' && (
          <div className="px-4 py-3 border-b border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase mb-2">Clinic</p>
            <ClinicSwitcher />
          </div>
        )}

        {/* Mobile Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between px-4 py-3.5 text-base font-medium transition ${
                pathname === link.href || pathname?.startsWith(link.href + '/')
                  ? 'text-teal-600 bg-teal-50 border-r-4 border-teal-600' 
                  : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
              }`}
            >
              <span>{link.label}</span>
              <ChevronRight className={`w-5 h-5 ${
                pathname === link.href || pathname?.startsWith(link.href + '/')
                  ? 'text-teal-600' 
                  : 'text-gray-400'
              }`} />
            </Link>
          ))}
        </nav>

        {/* Mobile Menu Footer */}
        <div className="border-t border-gray-200 p-4 safe-bottom">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 active:bg-red-200 transition"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
