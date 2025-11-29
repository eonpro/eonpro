'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getRoleConfig, getRoleTheme } from '@/lib/auth/roles.config';
import { 
  Menu, X, ChevronDown, Bell, Search, Settings, LogOut,
  Home, Users, Briefcase, ShoppingCart, TrendingUp, DollarSign,
  Ticket, FileText, UserPlus, ShoppingBag, FileBarChart,
  Stethoscope, Headphones, Shield, UserCheck
} from 'lucide-react';
// import ClinicSwitcher from '@/components/clinic/ClinicSwitcher';

// Icon mapping
const iconMap: Record<string, any> = {
  Home, Users, Briefcase, ShoppingCart, TrendingUp, DollarSign,
  Ticket, Settings, FileText, UserPlus, ShoppingBag, FileBarChart,
  Stethoscope, Headphones, Shield, UserCheck
};

interface AdminLayoutProps {
  children: React.ReactNode;
  userData?: any;
}

export default function AdminLayout({ children, userData }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [notifications, setNotifications] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const config = getRoleConfig('admin');
  const theme = getRoleTheme('admin');

  useEffect(() => {
    // Load notification count
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    // Fetch unread notifications
    try {
      const response = await fetch('/api/notifications/unread-count');
      const data = await response.json();
      setNotifications(data.count || 0);
    } catch {
      // Fallback for demo
      setNotifications(3);
    }
  };

  const toggleSubmenu = (label: string) => {
    setExpandedMenus(prev => 
      prev.includes(label) 
        ? prev.filter(l => l !== label)
        : [...prev, label]
    );
  };

  const handleQuickAction = (action: string) => {
    switch(action) {
      case 'add-patient':
        router.push('/admin/patients/new');
        break;
      case 'create-order':
        router.push('/admin/orders/new');
        break;
      case 'view-reports':
        router.push('/admin/reports');
        break;
      default:
        break;
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery) {
      router.push(`/admin/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar */}
      <header className={`fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm`}>
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left section */}
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none hidden lg:block"
              >
                <Menu className="h-6 w-6" />
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none lg:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>
              
              {/* Logo/Brand */}
              <div className="flex items-center ml-4">
                <img
                  src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
                  alt="EONPRO logo"
                  className="h-10 w-auto"
                />
              </div>
            </div>

            {/* Center section - Search */}
            <form onSubmit={handleSearch} className="flex-1 max-w-lg mx-8 hidden md:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search patients, orders, staff..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </form>

            {/* Right section */}
            <div className="flex items-center space-x-4">
              {/* Clinic Switcher */}
              {/* <ClinicSwitcher /> */}

              {/* Notifications */}
              <button className="relative p-2 text-gray-400 hover:text-gray-500">
                <Bell className="h-6 w-6" />
                {notifications > 0 && (
                  <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
                    {notifications}
                  </span>
                )}
              </button>

              {/* User Menu */}
              <div className="relative">
                <button className="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500">
                  <div className="h-8 w-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-semibold">
                    {userData?.firstName?.[0] || 'A'}
                  </div>
                  <span className="ml-2 text-gray-700 font-medium hidden md:block">
                    {userData?.firstName} {userData?.lastName}
                  </span>
                  <ChevronDown className="ml-1 h-4 w-4 text-gray-400" />
                </button>
              </div>

              {/* Settings */}
              <button 
                onClick={() => router.push('/admin/settings')}
                className="p-2 text-gray-400 hover:text-gray-500"
              >
                <Settings className="h-6 w-6" />
              </button>

              {/* Logout */}
              <button 
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-gray-500"
              >
                <LogOut className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`fixed left-0 top-16 bottom-0 z-40 bg-white border-r border-gray-200 transition-all duration-300 ${
        sidebarOpen ? 'w-64' : 'w-16'
      } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <nav className="h-full overflow-y-auto py-4">
          <div className="px-3">
            {/* Quick Actions */}
            {sidebarOpen && config.navigation.quick && (
              <div className="mb-6">
                <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Quick Actions
                </h3>
                <div className="space-y-1">
                  {config.navigation.quick.map((action) => {
                    const Icon = iconMap[action.icon] || UserPlus;
                    return (
                      <button
                        key={action.action}
                        onClick={() => handleQuickAction(action.action)}
                        className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors
                          ${action.color === 'green' ? 'text-green-700 bg-green-50 hover:bg-green-100' : ''}
                          ${action.color === 'blue' ? 'text-blue-700 bg-blue-50 hover:bg-blue-100' : ''}
                          ${action.color === 'purple' ? 'text-purple-700 bg-purple-50 hover:bg-purple-100' : ''}
                        `}
                      >
                        <Icon className="h-4 w-4 mr-2" />
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Main Navigation */}
            <div className="space-y-1">
              {config.navigation.primary.map((item) => {
                const Icon = iconMap[item.icon] || Home;
                const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
                const hasSubItems = item.subItems && item.subItems.length > 0;
                const isExpanded = expandedMenus.includes(item.label);

                return (
                  <div key={item.path}>
                    {hasSubItems ? (
                      <>
                        <button
                          onClick={() => toggleSubmenu(item.label)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                            isActive
                              ? 'bg-purple-50 text-purple-700'
                              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center">
                            <Icon className={`${sidebarOpen ? 'mr-3' : ''} h-5 w-5`} />
                            {sidebarOpen && <span>{item.label}</span>}
                          </div>
                          {sidebarOpen && (
                            <ChevronDown className={`h-4 w-4 transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`} />
                          )}
                        </button>
                        {sidebarOpen && isExpanded && (
                          <div className="ml-8 mt-1 space-y-1">
                            {item.subItems!.map((subItem) => {
                              const SubIcon = iconMap[subItem.icon] || FileText;
                              return (
                                <Link
                                  key={subItem.path}
                                  href={subItem.path}
                                  className={`flex items-center px-3 py-1.5 text-sm rounded-md transition-colors ${
                                    pathname === subItem.path
                                      ? 'text-purple-700 bg-purple-50'
                                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                  }`}
                                >
                                  <SubIcon className="h-4 w-4 mr-2" />
                                  {subItem.label}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <Link
                        href={item.path}
                        className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                          isActive
                            ? 'bg-purple-50 text-purple-700'
                            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                        title={!sidebarOpen ? item.label : undefined}
                      >
                        <Icon className={`${sidebarOpen ? 'mr-3' : ''} h-5 w-5`} />
                        {sidebarOpen && <span>{item.label}</span>}
                        {item.badge === 'count' && notifications > 0 && sidebarOpen && (
                          <span className="ml-auto bg-purple-500 text-white text-xs px-2 py-0.5 rounded-full">
                            {notifications}
                          </span>
                        )}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>

            {/* User Info */}
            {sidebarOpen && (
              <div className="mt-8 pt-8 border-t border-gray-200">
                <div className="px-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Your Role
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {config.displayName}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {config.description}
                  </p>
                </div>
              </div>
            )}
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className={`transition-all duration-300 ${
        sidebarOpen ? 'lg:ml-64' : 'lg:ml-16'
      } mt-16`}>
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Page Title Area */}
          <div className="mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {pathname.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Dashboard'}
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    {new Date().toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
                <div className="flex items-center space-x-4">
                  {/* Breadcrumb or additional actions can go here */}
                </div>
              </div>
            </div>
          </div>

          {/* Page Content */}
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
