'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home, Users, Building2, ShoppingCart, Store, TrendingUp,
  DollarSign, Settings, LogOut, FileText, ClipboardList
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      {/* Minimal Sidebar - Always Collapsed */}
      <aside className="fixed left-0 top-0 bottom-0 w-20 bg-white border-r border-gray-200 flex flex-col items-center py-4 z-50">
        {/* Logo */}
        <div className="mb-6">
          <Link href="/">
            <img
              src="https://static.wixstatic.com/media/c49a9b_f1c55bbf207b4082bdef7d23fd95f39e~mv2.png"
              alt="EONPRO"
              className="h-10 w-10 object-contain"
            />
          </Link>
        </div>

        {/* Navigation Icons */}
        <nav className="flex-1 flex flex-col items-center space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                title={item.label}
                className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all ${
                  active
                    ? 'bg-[#4fa77e]/10 text-[#4fa77e]'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
              >
                <Icon className="h-5 w-5" />
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <button
          onClick={handleLogout}
          title="Logout"
          className="w-12 h-12 flex items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-20">
        <div className="p-8">
          {children}
        </div>
      </main>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
