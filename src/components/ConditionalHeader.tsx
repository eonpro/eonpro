'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ClinicSwitcher } from '@/components/clinic/ClinicSwitcher';
import { EONPRO_LOGO } from '@/lib/constants/brand-assets';
import { safeParseJsonString } from '@/lib/utils/safe-json';
import { LogOut, User, Shield, Menu, X, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';

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
      const parsed = safeParseJsonString(userData);
      if (parsed) setUser(parsed);
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

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token =
      localStorage.getItem('auth-token') ||
      localStorage.getItem('admin-token') ||
      localStorage.getItem('provider-token') ||
      localStorage.getItem('super_admin-token');
    if (token)
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    localStorage.removeItem('auth-token');
    localStorage.removeItem('admin-token');
    localStorage.removeItem('provider-token');
    localStorage.removeItem('super_admin-token');
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    document.cookie.split(';').forEach((c) => {
      document.cookie = c
        .replace(/^ +/, '')
        .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });
    window.location.href = '/login';
  };

  const userRole = user?.role?.toLowerCase() || '';

  // Define navigation links with role access
  const navLinks: NavLink[] = [
    { href: '/super-admin', label: 'Super Admin', roles: ['super_admin'] },
    { href: '/super-admin/clinics', label: 'Clinics', roles: ['super_admin'] },
    { href: '/admin', label: 'Dashboard', roles: ['admin', 'super_admin'] },
    { href: '/patients', label: 'Patients', roles: ['admin', 'provider', 'staff', 'super_admin'] },
    { href: '/providers', label: 'Providers', roles: ['admin', 'super_admin'] },
    { href: '/pharmacy/analytics', label: 'Pharmacy', roles: ['admin', 'provider', 'super_admin'] },
    { href: '/settings', label: 'Settings', roles: ['admin', 'super_admin'] },
  ];

  const visibleLinks = navLinks.filter((link) => link.roles.includes(userRole));

  const noHeaderPages = [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
    '/affiliate',
    '/patient-portal',
    '/portal',
    '/provider',
    '/staff',
    '/support',
    '/demo',
    '/pay/',
    '/admin',
    '/super-admin',
    '/patients',
    '/intake-forms',
    '/affiliate',
  ];

  const isNoHeaderPage =
    noHeaderPages.some((page) => pathname?.startsWith(page));
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
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          {/* Logo + Clinic Switcher */}
          <div className="flex items-center gap-3">
            <Link href={getDashboardLink()} className="flex-shrink-0">
              <img
                src={EONPRO_LOGO}
                alt="EONPRO logo"
                className="h-8 w-auto sm:h-10"
              />
            </Link>

            {multiClinicEnabled && userRole !== 'super_admin' && (
              <div className="hidden border-l border-gray-300 pl-3 sm:block">
                <ClinicSwitcher />
              </div>
            )}

            {userRole === 'super_admin' && (
              <span className="hidden rounded bg-slate-800 px-2 py-1 text-xs font-medium text-white sm:inline-block">
                Super Admin
              </span>
            )}
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden items-center space-x-1 lg:flex xl:space-x-4">
            {visibleLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  pathname === link.href || pathname?.startsWith(link.href + '/')
                    ? 'bg-teal-50 text-teal-600'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {link.label}
              </Link>
            ))}

            {/* Desktop User Menu */}
            <div className="relative ml-2">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    userRole === 'super_admin' ? 'bg-slate-800' : 'bg-teal-100'
                  }`}
                >
                  {userRole === 'super_admin' ? (
                    <Shield className="h-4 w-4 text-white" />
                  ) : (
                    <User className="h-4 w-4 text-teal-600" />
                  )}
                </div>
              </button>

              {showDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                    <div className="border-b border-gray-100 px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">
                        {user?.name || user?.email}
                      </p>
                      <p className="text-xs text-gray-500">{user?.email}</p>
                      <span
                        className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          userRole === 'super_admin'
                            ? 'bg-slate-800 text-white'
                            : userRole === 'admin'
                              ? 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]'
                              : userRole === 'provider'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-700'
                        }`}
                      >
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
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
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
            className="rounded-lg p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-[85%] max-w-sm transform bg-white transition-transform duration-300 ease-out lg:hidden ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Mobile Menu Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                userRole === 'super_admin' ? 'bg-slate-800' : 'bg-teal-100'
              }`}
            >
              {userRole === 'super_admin' ? (
                <Shield className="h-5 w-5 text-white" />
              ) : (
                <User className="h-5 w-5 text-teal-600" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{user?.name || 'User'}</p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close menu"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Mobile Role Badge */}
        {user?.role && (
          <div className="border-b border-gray-100 px-4 py-2">
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                userRole === 'super_admin'
                  ? 'bg-slate-800 text-white'
                  : userRole === 'admin'
                    ? 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]'
                    : userRole === 'provider'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700'
              }`}
            >
              {user?.role?.replace('_', ' ').toUpperCase()}
            </span>
          </div>
        )}

        {/* Mobile Clinic Switcher */}
        {multiClinicEnabled && userRole !== 'super_admin' && (
          <div className="border-b border-gray-200 px-4 py-3">
            <p className="mb-2 text-xs font-medium uppercase text-gray-500">Clinic</p>
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
                  ? 'border-r-4 border-teal-600 bg-teal-50 text-teal-600'
                  : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100'
              }`}
            >
              <span>{link.label}</span>
              <ChevronRight
                className={`h-5 w-5 ${
                  pathname === link.href || pathname?.startsWith(link.href + '/')
                    ? 'text-teal-600'
                    : 'text-gray-400'
                }`}
              />
            </Link>
          ))}
        </nav>

        {/* Mobile Menu Footer */}
        <div className="safe-bottom border-t border-gray-200 p-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-3 font-medium text-red-600 transition hover:bg-red-100 active:bg-red-200"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}
