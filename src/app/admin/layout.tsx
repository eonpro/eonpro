'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home, Users, Building2, ShoppingCart, Store, TrendingUp,
  DollarSign, Settings, LogOut, ChevronRight, ClipboardList, CreditCard, Key
} from 'lucide-react';
import InternalChat from '@/components/InternalChat';

const navItems = [
  { icon: Home, path: '/', label: 'Home' },
  { icon: Users, path: '/admin/patients', label: 'Patients' },
  { icon: Building2, path: '/admin/clinics', label: 'Clinics' },
  { icon: ShoppingCart, path: '/admin/orders', label: 'Orders' },
  { icon: Store, path: '/admin/products', label: 'Products' },
  { icon: ClipboardList, path: '/intake-forms', label: 'Intake Forms' },
  { icon: TrendingUp, path: '/admin/analytics', label: 'Analytics' },
  { icon: DollarSign, path: '/admin/finance', label: 'Finance' },
  { icon: CreditCard, path: '/admin/stripe-dashboard', label: 'Stripe' },
  { icon: Key, path: '/admin/registration-codes', label: 'Registration Codes' },
  { icon: Settings, path: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<number | null>(null);
  const [userRole, setUserRole] = useState<string>('admin');

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(user);
      const role = parsedUser.role?.toLowerCase();
      if (role !== 'admin' && role !== 'super_admin') {
        router.push('/login');
        return;
      }
      setUserId(parsedUser.id || null);
      setUserRole(role);
      setLoading(false);
    } catch {
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    router.push('/login');
  };

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname === path || pathname?.startsWith(path + '/');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#efece7]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-[#4fa77e] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#efece7] flex">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 bg-white border-r border-gray-200 flex flex-col py-4 z-50 transition-all duration-300 ${
          sidebarExpanded ? 'w-56' : 'w-20'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-center mb-6 px-4">
          <Link href="/">
            {sidebarExpanded ? (
              <img
                src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
                alt="EONPRO"
                className="h-10 w-auto"
              />
            ) : (
              <img
                src="https://static.wixstatic.com/media/c49a9b_f1c55bbf207b4082bdef7d23fd95f39e~mv2.png"
                alt="EONPRO"
                className="h-10 w-10 object-contain"
              />
            )}
          </Link>
        </div>

        {/* Expand Button */}
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className={`absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 focus:outline-none transition-all ${
            sidebarExpanded ? 'rotate-180' : ''
          }`}
        >
          <ChevronRight className="h-3 w-3 text-gray-400" />
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
        {children}
      </main>

      {/* Internal Team Chat */}
      {userId && (
        <InternalChat currentUserId={userId} currentUserRole={userRole} />
      )}
    </div>
  );
}
