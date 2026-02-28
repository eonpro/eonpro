'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  Users,
  UserPlus,
  ShoppingCart,
  Store,
  Settings,
  LogOut,
  ChevronRight,
  Ticket,
  MessageSquare,
} from 'lucide-react';
import {
  NotificationProvider,
  NotificationCenter,
  NotificationToastContainer,
} from '@/components/notifications';
import { ClinicBrandingProvider, useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { getAdminNavConfig } from '@/lib/nav/adminNav';
import { EONPRO_LOGO, EONPRO_ICON } from '@/lib/constants/brand-assets';

const staffNavIconMap = {
  Home,
  UserPlus,
  Users,
  ShoppingCart,
  Store,
  Settings,
  Ticket,
  MessageSquare,
} as const;

function StaffLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { branding, isLoading: brandingLoading } = useClinicBranding();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const primaryColor = branding?.primaryColor || '#4fa77e';
  const clinicLogo = branding?.logoUrl || EONPRO_LOGO;
  const clinicIcon = branding?.iconUrl || EONPRO_ICON;
  const clinicName = branding?.clinicName || 'EONPRO';
  const isWhiteLabeled = branding?.clinicName && branding.clinicName !== 'EONPRO';

  useEffect(() => {
    try {
      const user = localStorage.getItem('user');
      if (!user) {
        router.push('/login');
        return;
      }
      const parsedUser = JSON.parse(user);
      const role = parsedUser.role?.toLowerCase();
      if (role !== 'staff') {
        router.push('/login');
        return;
      }
      setLoading(false);
    } catch {
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router]);

  const navItems = useMemo(() => {
    const config = getAdminNavConfig('staff');
    return config.map((item) => ({
      ...item,
      icon: staffNavIconMap[item.iconKey as keyof typeof staffNavIconMap] ?? Home,
    }));
  }, []);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token =
      localStorage.getItem('auth-token') ||
      localStorage.getItem('staff-token');
    if (token)
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('staff-token');
    localStorage.removeItem('clinics');
    localStorage.removeItem('activeClinicId');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token_timestamp');
    [
      'auth-token',
      'staff-token',
      'selected-clinic',
    ].forEach((name) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.eonpro.io;`;
    });
    window.location.href = '/login';
  };

  const isActive = (path: string) => {
    if (path === '/staff') return pathname === '/staff';
    return pathname === path || pathname?.startsWith(path + '/');
  };

  if (loading || brandingLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
        <img src={EONPRO_ICON} alt="Loading" className="h-12 w-12 animate-pulse object-contain" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#efece7]">
      {/* Sidebar */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 flex flex-col border-r border-gray-200 bg-white py-4 transition-all duration-300 ${
          sidebarExpanded ? 'w-56' : 'w-20'
        }`}
      >
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center px-4">
          <Link href="/staff">
            {sidebarExpanded ? (
              <img
                src={clinicLogo}
                alt={clinicName}
                className="h-10 w-auto max-w-[140px] object-contain"
              />
            ) : (
              <img src={clinicIcon} alt={clinicName} className="h-10 w-10 object-contain" />
            )}
          </Link>
          {isWhiteLabeled && sidebarExpanded && (
            <span className="mt-1 flex items-center justify-center gap-1 text-[10px] text-gray-400">
              Powered by{' '}
              <img src={EONPRO_LOGO} alt="EONPRO" className="h-[21px] w-auto" />
            </span>
          )}
        </div>

        {/* Expand Button */}
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className={`absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition-all hover:bg-gray-50 focus:outline-none ${
            sidebarExpanded ? 'rotate-180' : ''
          }`}
        >
          <ChevronRight className="h-3 w-3 text-gray-400" />
        </button>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);

            const handleNavClick = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              if (pathname === item.path) {
                window.location.reload();
              } else {
                window.location.href = item.path;
              }
            };

            return (
              <button
                key={item.path}
                onClick={handleNavClick}
                title={!sidebarExpanded ? item.label : undefined}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                  active ? '' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
                style={active ? { backgroundColor: `${primaryColor}15`, color: primaryColor } : {}}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarExpanded && (
                  <span className="whitespace-nowrap text-sm font-medium">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="space-y-2 border-t border-gray-100 px-3 pt-4">
          <button
            type="button"
            onClick={handleLogout}
            title={!sidebarExpanded ? 'Logout' : undefined}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {sidebarExpanded && (
              <span className="whitespace-nowrap text-sm font-medium">Logout</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 ${sidebarExpanded ? 'ml-56' : 'ml-20'}`}>
        {/* Notification Bar */}
        <div className="sticky top-0 z-40 border-b border-gray-200/50 bg-[#efece7]/95 px-6 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <NotificationCenter
                notificationsPath="/staff"
                dropdownPosition="left"
              />
              <span className="text-sm font-medium text-gray-600">Notifications</span>
            </div>
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicBrandingProvider>
      <NotificationProvider>
        <StaffLayoutInner>{children}</StaffLayoutInner>
        <NotificationToastContainer />
      </NotificationProvider>
    </ClinicBrandingProvider>
  );
}
