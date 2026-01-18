'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, Users, Building2, ShoppingCart, Store, TrendingUp,
  DollarSign, Settings, LogOut, ClipboardList, ChevronRight
} from 'lucide-react';

const navItems = [
  { icon: Home, path: '/admin', label: 'Dashboard' },
  { icon: Users, path: '/admin/patients', label: 'Patients' },
  { icon: Building2, path: '/admin/clinics', label: 'Clinics' },
  { icon: ShoppingCart, path: '/admin/orders', label: 'Orders' },
  { icon: Store, path: '/admin/products', label: 'Products' },
  { icon: ClipboardList, path: '/intake-forms', label: 'Intake Forms' },
  { icon: TrendingUp, path: '/admin/analytics', label: 'Analytics' },
  { icon: DollarSign, path: '/admin/finance', label: 'Finance' },
  { icon: Settings, path: '/admin/settings', label: 'Settings' },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  userData?: any;
}

export default function AdminLayout({ children, userData }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    router.push('/login');
  };

  const isActive = (path: string) => {
    if (path === '/admin') {
      return pathname === '/admin';
    }
    return pathname === path || pathname.startsWith(path + '/');
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 bg-white border-r border-gray-200 flex flex-col py-4 z-50 transition-all duration-300 ${
          sidebarExpanded ? 'w-56' : 'w-20'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-center mb-6 px-4">
          <Link href="/" className="flex items-center gap-3">
            <img
              src="https://static.wixstatic.com/media/c49a9b_f1c55bbf207b4082bdef7d23fd95f39e~mv2.png"
              alt="EONPRO"
              className="h-10 w-10 object-contain flex-shrink-0"
            />
            {sidebarExpanded && (
              <img
                src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
                alt="EONPRO"
                className="h-8 w-auto"
              />
            )}
          </Link>
        </div>

        {/* Expand Button */}
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className={`absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-all ${
            sidebarExpanded ? 'rotate-180' : ''
          }`}
        >
          <ChevronRight className="h-3 w-3 text-gray-500" />
        </button>

        {/* Navigation Icons */}
        <nav className="flex-1 flex flex-col px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                title={!sidebarExpanded ? item.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  active
                    ? 'bg-[#4fa77e]/10 text-[#4fa77e]'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarExpanded && (
                  <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="px-3">
          <button
            onClick={handleLogout}
            title={!sidebarExpanded ? "Logout" : undefined}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all w-full"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {sidebarExpanded && (
              <span className="text-sm font-medium whitespace-nowrap">Logout</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 ${sidebarExpanded ? 'ml-56' : 'ml-20'}`}>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
