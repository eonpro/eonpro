'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import {
  ChartIcon,
  SettingsIcon,
  UsersIcon,
  IntegrationsIcon,
  DeveloperIcon,
  SecurityIcon,
  BillingIcon,
  NotificationsIcon,
  AuditIcon
} from '@/components/icons/SettingsIcons';

interface SettingsSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  href: string;
  requiredPermission?: string;
}

const settingsSections: SettingsSection[] = [
  {
    id: 'dashboard',
    title: 'Overview',
    icon: <ChartIcon className="w-5 h-5" />,
    href: '/settings',
  },
  {
    id: 'general',
    title: 'General',
    icon: <SettingsIcon className="w-5 h-5" />,
    href: '/settings/general',
  },
  {
    id: 'users',
    title: 'User Management',
    icon: <UsersIcon className="w-5 h-5" />,
    href: '/settings/users',
    requiredPermission: PERMISSIONS.USER_READ,
  },
  {
    id: 'integrations',
    title: 'Integrations',
    icon: <IntegrationsIcon className="w-5 h-5" />,
    href: '/settings/integrations',
    requiredPermission: PERMISSIONS.INTEGRATION_READ,
  },
  {
    id: 'developer',
    title: 'Developer Tools',
    icon: <DeveloperIcon className="w-5 h-5" />,
    href: '/settings/developer',
    requiredPermission: PERMISSIONS.INTEGRATION_READ,
  },
  {
    id: 'security',
    title: 'Security',
    icon: <SecurityIcon className="w-5 h-5" />,
    href: '/settings/security',
    requiredPermission: PERMISSIONS.SYSTEM_CONFIG,
  },
  {
    id: 'billing',
    title: 'Billing',
    icon: <BillingIcon className="w-5 h-5" />,
    href: '/settings/billing',
    requiredPermission: PERMISSIONS.BILLING_VIEW,
  },
  {
    id: 'notifications',
    title: 'Notifications',
    icon: <NotificationsIcon className="w-5 h-5" />,
    href: '/settings/notifications',
  },
  {
    id: 'audit',
    title: 'Audit Logs',
    icon: <AuditIcon className="w-5 h-5" />,
    href: '/settings/audit',
    requiredPermission: PERMISSIONS.SYSTEM_AUDIT,
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);
  
  useEffect(() => {
    // For now, get user info from local storage or set a default
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');
    if (token) {
      // Decode JWT to get user info (simple decode, not verification)
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(base64));
        setUser({
          email: payload.email || 'admin@lifefile.com',
          role: payload.role || "admin",
        });
      } catch {
        // Default to admin for testing
        setUser({
          email: 'admin@lifefile.com',
          role: "admin",
        });
      }
    } else {
      // Default user for testing
      setUser({
        email: 'admin@lifefile.com',
        role: "admin",
      });
    }
  }, []);
  
  // Filter sections based on permissions
  const availableSections = settingsSections.filter((section: any) => {
    if (!section.requiredPermission) return true;
    if (!user) return false;
    return hasPermission(user.role as any, section.requiredPermission);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-lg h-screen sticky top-0">
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-800">Settings</h2>
            <p className="text-sm text-gray-500 mt-1">Manage your platform</p>
          </div>
          
          <nav className="mt-6">
            {availableSections.map((section: any) => {
              const isActive = pathname === section.href || 
                             (section.href !== '/settings' && pathname.startsWith(section.href));
              
              return (
                <Link
                  key={section.id}
                  href={section.href}
                  className={`
                    flex items-center px-6 py-3 text-sm font-medium
                    transition-colors duration-200
                    ${isActive 
                      ? 'bg-green-50 text-green-600 border-r-4 border-green-600' 
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }
                  `}
                >
                  <span className="mr-3">{section.icon}</span>
                  {section.title}
                </Link>
              );
            })}
          </nav>
          
          {/* User Info */}
          <div className="absolute bottom-0 w-full p-6 border-t border-gray-200">
            <div className="text-sm">
              <p className="text-gray-500">Logged in as</p>
              <p className="font-medium text-gray-700">{user?.email}</p>
              <p className="text-xs text-gray-400 capitalize">{user?.role?.toLowerCase()}</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
