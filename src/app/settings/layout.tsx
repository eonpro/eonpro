'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import { getStoredUser } from '@/lib/auth/stored-role';
import {
  ChartIcon,
  SettingsIcon,
  UsersIcon,
  IntegrationsIcon,
  DeveloperIcon,
  SecurityIcon,
  BillingIcon,
  NotificationsIcon,
  AuditIcon,
  TransactionsIcon,
  ProfileIcon,
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
    icon: <ChartIcon className="h-5 w-5" />,
    href: '/settings',
  },
  {
    id: 'profile',
    title: 'Profile',
    icon: <ProfileIcon className="h-5 w-5" />,
    href: '/settings/profile',
  },
  {
    id: 'general',
    title: 'General',
    icon: <SettingsIcon className="h-5 w-5" />,
    href: '/settings/general',
  },
  {
    id: 'users',
    title: 'User Management',
    icon: <UsersIcon className="h-5 w-5" />,
    href: '/settings/users',
    requiredPermission: PERMISSIONS.USER_READ,
  },
  {
    id: 'integrations',
    title: 'Integrations',
    icon: <IntegrationsIcon className="h-5 w-5" />,
    href: '/settings/integrations',
    requiredPermission: PERMISSIONS.INTEGRATION_READ,
  },
  {
    id: 'developer',
    title: 'Developer Tools',
    icon: <DeveloperIcon className="h-5 w-5" />,
    href: '/settings/developer',
    requiredPermission: PERMISSIONS.INTEGRATION_READ,
  },
  {
    id: 'security',
    title: 'Security',
    icon: <SecurityIcon className="h-5 w-5" />,
    href: '/settings/security',
    requiredPermission: PERMISSIONS.SYSTEM_CONFIG,
  },
  {
    id: 'billing',
    title: 'Billing',
    icon: <BillingIcon className="h-5 w-5" />,
    href: '/settings/billing',
    requiredPermission: PERMISSIONS.BILLING_VIEW,
  },
  {
    id: 'transactions',
    title: 'Transactions',
    icon: <TransactionsIcon className="h-5 w-5" />,
    href: '/settings/transactions',
    requiredPermission: PERMISSIONS.BILLING_VIEW,
  },
  {
    id: 'notifications',
    title: 'Notifications',
    icon: <NotificationsIcon className="h-5 w-5" />,
    href: '/settings/notifications',
  },
  {
    id: 'audit',
    title: 'Audit Logs',
    icon: <AuditIcon className="h-5 w-5" />,
    href: '/settings/audit',
    requiredPermission: PERMISSIONS.SYSTEM_AUDIT,
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored?.role) {
      setUser({
        email: stored.email ?? 'admin@lifefile.com',
        role: (stored.role as string).toLowerCase(),
      });
    } else {
      setUser({
        email: 'admin@lifefile.com',
        role: 'admin',
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
        <div className="sticky top-0 h-screen w-64 bg-white shadow-lg">
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-800">Settings</h2>
            <p className="mt-1 text-sm text-gray-500">Manage your platform</p>
          </div>

          <nav className="mt-6">
            {availableSections.map((section: any) => {
              const isActive =
                pathname === section.href ||
                (section.href !== '/settings' && pathname.startsWith(section.href));

              return (
                <Link
                  key={section.id}
                  href={section.href}
                  className={`flex items-center px-6 py-3 text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? 'border-r-4 border-green-600 bg-green-50 text-green-600'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  } `}
                >
                  <span className="mr-3">{section.icon}</span>
                  {section.title}
                </Link>
              );
            })}
          </nav>

          {/* User Info */}
          <div className="absolute bottom-0 w-full border-t border-gray-200 p-6">
            <div className="text-sm">
              <p className="text-gray-500">Logged in as</p>
              <p className="font-medium text-gray-700">{user?.email}</p>
              <p className="text-xs capitalize text-gray-400">{user?.role?.toLowerCase()}</p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-8">{children}</div>
      </div>
    </div>
  );
}
