'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home, Users, Calendar, MessageSquare, FileText, TestTube,
  Pill, BookOpen, Settings, LogOut, ChevronRight, Search, Activity,
  Stethoscope
} from 'lucide-react';

const mainNavItems = [
  { icon: Home, path: '/provider', label: 'Dashboard', exact: true },
  { icon: Users, path: '/provider/patients', label: 'My Patients' },
  { icon: Calendar, path: '/provider/calendar', label: 'Calendar' },
  { icon: Stethoscope, path: '/provider/consultations', label: 'Consultations' },
  { icon: Pill, path: '/provider/prescriptions', label: 'Prescriptions' },
  { icon: TestTube, path: '/provider/labs', label: 'Lab Results' },
  { icon: FileText, path: '/provider/soap-notes', label: 'SOAP Notes' },
  { icon: MessageSquare, path: '/provider/messages', label: 'Messages' },
  { icon: BookOpen, path: '/provider/resources', label: 'Resources' },
  { icon: Settings, path: '/provider/settings', label: 'Settings' },
];

const clinicalTools = [
  { icon: BookOpen, path: '/provider/drug-reference', label: 'Drug Reference' },
  { icon: Search, path: '/provider/icd-lookup', label: 'ICD-10 Lookup' },
  { icon: Activity, path: '/provider/calculators', label: 'Medical Calculators' },
];

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(user);
      const role = parsedUser.role?.toLowerCase();
      if (role !== 'provider') {
        router.push('/login');
        return;
      }
      // Build display name from firstName/lastName or fallback to name field
      const displayName = parsedUser.firstName && parsedUser.lastName
        ? `${parsedUser.firstName} ${parsedUser.lastName}`
        : parsedUser.name || parsedUser.email?.split('@')[0] || '';
      setUserName(`Dr. ${displayName}`.trim());
      setLoading(false);
    } catch {
      localStorage.removeItem('user');
      router.push('/login');
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('provider-token');
    localStorage.removeItem('clinics');
    localStorage.removeItem('activeClinicId');
    router.push('/login');
  };

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return pathname === path;
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
          <Link href="/provider">
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

        {/* Main Navigation */}
        <nav className="flex-1 flex flex-col px-3 space-y-1 overflow-y-auto">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path, item.exact);
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

          {/* Clinical Tools Section */}
          {sidebarExpanded && (
            <div className="pt-6 mt-6 border-t border-gray-100">
              <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Clinical Tools
              </p>
              {clinicalTools.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
                      active
                        ? 'bg-[#4fa77e]/10 text-[#4fa77e]'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm font-medium whitespace-nowrap">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Collapsed Clinical Tools */}
          {!sidebarExpanded && (
            <div className="pt-6 mt-6 border-t border-gray-100 space-y-1">
              {clinicalTools.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    title={item.label}
                    className={`flex items-center justify-center p-2.5 rounded-xl transition-all ${
                      active
                        ? 'bg-[#4fa77e]/10 text-[#4fa77e]'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* User Info & Logout */}
        <div className="px-3 space-y-2 border-t border-gray-100 pt-4">
          {sidebarExpanded && userName && (
            <div className="px-3 py-2 text-xs text-gray-500 truncate">
              {userName}
            </div>
          )}
          <button
            onClick={handleLogout}
            title={!sidebarExpanded ? "Sign Out" : undefined}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all w-full"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {sidebarExpanded && (
              <span className="text-sm font-medium whitespace-nowrap">Sign Out</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 ${sidebarExpanded ? 'ml-56' : 'ml-20'}`}>
        {children}
      </main>
    </div>
  );
}
