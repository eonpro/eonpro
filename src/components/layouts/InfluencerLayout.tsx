'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getRoleConfig, getRoleTheme } from '@/lib/auth/roles.config';
import { 
  Menu, Home, Users, DollarSign, Target, Download, 
  TrendingUp, HelpCircle, Share2, LogOut
} from 'lucide-react';

const iconMap: Record<string, any> = {
  Home, Users, DollarSign, Target, Download, 
  TrendingUp, HelpCircle, Share2
};

interface InfluencerLayoutProps {
  children: React.ReactNode;
  userData?: any;
}

export default function InfluencerLayout({ children, userData }: InfluencerLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const config = getRoleConfig('influencer');
  const theme = getRoleTheme('influencer');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-100">
      {/* Header */}
      <header className="bg-white border-b border-pink-500 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-md text-gray-500 hover:text-gray-700 lg:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>
              <img
                src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
                alt="EONPRO logo"
                className="h-10 w-auto ml-2"
              />
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                {userData?.firstName} {userData?.lastName}
              </span>
              <button 
                onClick={() => {
                  localStorage.removeItem('user');
                  localStorage.removeItem('influencer-token');
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
        <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } mt-16 lg:mt-0`}>
          <nav className="h-full overflow-y-auto py-4">
            <div className="px-3 space-y-1">
              {config.navigation.primary.map((item) => {
                const Icon = iconMap[item.icon] || Home;
                const isActive = pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                      isActive
                        ? 'bg-pink-50 text-pink-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
