'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getRoleConfig, getRoleTheme } from '@/lib/auth/roles.config';
import { EONPRO_LOGO } from '@/lib/constants/brand-assets';
import {
  Menu,
  Home,
  ClipboardList,
  Calendar,
  Package,
  FileText,
  Ticket,
  MessageSquare,
  HelpCircle,
  UserPlus,
  LogOut,
} from 'lucide-react';

const iconMap: Record<string, any> = {
  Home,
  ClipboardList,
  Calendar,
  Package,
  FileText,
  Ticket,
  MessageSquare,
  HelpCircle,
  UserPlus,
};

interface StaffLayoutProps {
  children: React.ReactNode;
  userData?: any;
}

export default function StaffLayout({ children, userData }: StaffLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const config = getRoleConfig('staff');
  const theme = getRoleTheme('staff');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-cyan-500 bg-white shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="rounded-md p-2 text-gray-500 hover:text-gray-700 lg:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>
              <img
                src={EONPRO_LOGO}
                alt="EONPRO logo"
                className="ml-2 h-10 w-auto"
              />
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {userData?.firstName} {userData?.lastName}
              </span>
              <button
                onClick={() => {
                  localStorage.removeItem('user');
                  router.push('/login');
                }}
                className="p-2 text-gray-500 hover:text-gray-700"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 transform border-r border-gray-200 bg-white transition-transform lg:relative lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } mt-16 lg:mt-0`}
        >
          <nav className="h-full overflow-y-auto py-4">
            <div className="space-y-1 px-3">
              {config.navigation.primary.map((item) => {
                const Icon = iconMap[item.icon] || Home;
                const isActive = pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center rounded-md px-3 py-2 text-sm font-medium ${
                      isActive ? 'bg-cyan-50 text-cyan-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
