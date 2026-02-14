'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getRoleConfig, getRoleTheme } from '@/lib/auth/roles.config';
import { logger } from '@/lib/logger';
import {
  Menu,
  X,
  Bell,
  Search,
  LogOut,
  Video,
  PenTool,
  Pill,
  Home,
  Users,
  Calendar,
  MessageSquare,
  FileText,
  TestTube,
  BookOpen,
  Clock,
  AlertCircle,
  Activity,
  User,
  ChevronRight,
  Settings,
  Building2,
  ChevronDown,
  Check,
} from 'lucide-react';

// Icon mapping
const iconMap: Record<string, any> = {
  Home,
  Users,
  Calendar,
  Video,
  Pill,
  TestTube,
  FileText,
  MessageSquare,
  BookOpen,
  PenTool,
  Settings,
};

interface Clinic {
  id: number;
  name: string;
  subdomain: string | null;
  logoUrl: string | null;
  role: string;
  isPrimary: boolean;
}

interface ProviderLayoutProps {
  children: React.ReactNode;
  userData?: any;
}

interface PatientAlert {
  id: string;
  patientName: string;
  type: 'lab' | 'medication' | 'appointment' | 'message';
  message: string;
  priority: 'high' | 'medium' | 'low';
  time: string;
}

export default function ProviderLayout({ children, userData }: ProviderLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<PatientAlert[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [currentPatientCount, setCurrentPatientCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Multi-clinic state
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [activeClinic, setActiveClinic] = useState<Clinic | null>(null);
  const [showClinicDropdown, setShowClinicDropdown] = useState(false);
  const [switchingClinic, setSwitchingClinic] = useState(false);

  const config = getRoleConfig('provider');
  const theme = getRoleTheme('provider');

  useEffect(() => {
    loadProviderData();
    loadClinicData();
  }, []);

  const loadClinicData = () => {
    // Load clinics from localStorage (set during login)
    try {
      const storedClinics = localStorage.getItem('clinics');
      const activeClinicId = localStorage.getItem('activeClinicId');

      if (storedClinics) {
        const parsedClinics = JSON.parse(storedClinics);
        setClinics(parsedClinics);

        if (activeClinicId) {
          const active = parsedClinics.find((c: Clinic) => c.id === parseInt(activeClinicId));
          setActiveClinic(active || parsedClinics[0]);
        } else if (parsedClinics.length > 0) {
          setActiveClinic(parsedClinics[0]);
        }
      }
    } catch (error) {
      console.error('Error loading clinic data:', error);
    }
  };

  const handleClinicSwitch = async (clinic: Clinic) => {
    if (clinic.id === activeClinic?.id) {
      setShowClinicDropdown(false);
      return;
    }

    setSwitchingClinic(true);
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('provider-token');
      const response = await fetch('/api/auth/switch-clinic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ clinicId: clinic.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to switch clinic');
      }

      const data = await response.json();

      // Update localStorage
      localStorage.setItem('auth-token', data.token);
      localStorage.setItem('provider-token', data.token);
      localStorage.setItem('activeClinicId', String(clinic.id));
      localStorage.setItem('user', JSON.stringify(data.user));

      // Update state
      setActiveClinic(clinic);
      setShowClinicDropdown(false);

      // Reload the page to refresh data for new clinic
      window.location.reload();
    } catch (error) {
      console.error('Error switching clinic:', error);
      alert('Failed to switch clinic. Please try again.');
    } finally {
      setSwitchingClinic(false);
    }
  };

  const loadProviderData = async () => {
    // Production: load from APIs when available; no demo data
    try {
      setNotifications([]);
      setCurrentPatientCount(0);
    } catch {
      setCurrentPatientCount(0);
    }
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'start-consultation':
        router.push('/provider/consultations/new');
        break;
      case 'create-soap':
        router.push('/provider/soap-notes/new');
        break;
      case 'prescribe':
        router.push('/provider/prescriptions/new');
        break;
      default:
        break;
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      router.push(`/provider/patients?search=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token = localStorage.getItem('auth-token') || localStorage.getItem('provider-token');
    if (token)
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch((err: unknown) => {
        logger.debug('Logout API call failed (continuing with redirect)', {
          message: err instanceof Error ? err.message : 'Unknown',
        });
      });
    localStorage.removeItem('user');
    localStorage.removeItem('provider-token');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('clinics');
    localStorage.removeItem('activeClinicId');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-clinic-dropdown]')) {
        setShowClinicDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-50';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50';
      case 'low':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'lab':
        return TestTube;
      case 'message':
        return MessageSquare;
      case 'appointment':
        return Calendar;
      case 'medication':
        return Pill;
      default:
        return AlertCircle;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar - Clinical Theme */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b-2 border-green-500 bg-white shadow-md">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Left section */}
            <div className="flex items-center">
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:block"
              >
                <Menu className="h-6 w-6" />
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>

              {/* Logo with clinical badge */}
              <div className="ml-4 flex items-center gap-4">
                <img
                  src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
                  alt="EONPRO logo"
                  className="h-10 w-auto"
                />
                <div className="hidden md:block">
                  <p className="text-sm text-gray-500">Active Patients</p>
                  <p className="text-lg font-semibold text-gray-900">{currentPatientCount}</p>
                </div>
              </div>
            </div>

            {/* Center - Patient Search */}
            <form onSubmit={handleSearch} className="mx-8 hidden max-w-lg flex-1 md:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search patients by name, ID, or condition..."
                  className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </form>

            {/* Right section */}
            <div className="flex items-center space-x-4">
              {/* Quick Actions */}
              <div className="hidden items-center space-x-2 lg:flex">
                {config.navigation.quick?.map((action) => {
                  const Icon = iconMap[action.icon];
                  return (
                    <button
                      key={action.action}
                      onClick={() => handleQuickAction(action.action)}
                      className={`rounded-lg p-2 text-white transition-colors ${action.color === 'green' ? 'bg-green-600 hover:bg-green-700' : ''} ${action.color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : ''} ${action.color === 'purple' ? 'bg-purple-600 hover:bg-purple-700' : ''} `}
                      title={action.label}
                    >
                      <Icon className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>

              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 text-gray-500 hover:text-gray-700"
                >
                  <Bell className="h-6 w-6" />
                  {notifications.length > 0 && (
                    <span className="absolute right-0 top-0 inline-flex -translate-y-1/2 translate-x-1/2 transform items-center justify-center rounded-full bg-red-500 px-2 py-1 text-xs font-bold leading-none text-white">
                      {notifications.length}
                    </span>
                  )}
                </button>

                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div className="absolute right-0 z-50 mt-2 w-96 rounded-lg border border-gray-200 bg-white shadow-lg">
                    <div className="border-b border-gray-200 p-4">
                      <h3 className="text-lg font-semibold text-gray-900">Patient Alerts</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.map((alert) => {
                        const AlertIcon = getAlertIcon(alert.type);
                        return (
                          <div
                            key={alert.id}
                            className="cursor-pointer border-b border-gray-100 p-4 hover:bg-gray-50"
                          >
                            <div className="flex items-start">
                              <div className={`rounded-lg p-2 ${getPriorityColor(alert.priority)}`}>
                                <AlertIcon className="h-5 w-5" />
                              </div>
                              <div className="ml-3 flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                  {alert.patientName}
                                </p>
                                <p className="text-sm text-gray-600">{alert.message}</p>
                                <p className="mt-1 text-xs text-gray-400">{alert.time}</p>
                              </div>
                              <ChevronRight className="h-5 w-5 text-gray-400" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="bg-gray-50 p-3">
                      <button className="w-full text-center text-sm font-medium text-green-600 hover:text-green-700">
                        View All Alerts
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Clinic Switcher (only show if multiple clinics) */}
              {clinics.length > 1 && (
                <div className="relative" data-clinic-dropdown>
                  <button
                    onClick={() => setShowClinicDropdown(!showClinicDropdown)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
                    disabled={switchingClinic}
                  >
                    {activeClinic?.logoUrl ? (
                      <img
                        src={activeClinic.logoUrl}
                        alt={activeClinic.name}
                        className="h-6 w-6 rounded object-cover"
                      />
                    ) : (
                      <Building2 className="h-5 w-5 text-gray-500" />
                    )}
                    <span className="hidden max-w-[120px] truncate font-medium lg:inline">
                      {activeClinic?.name || 'Select Clinic'}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-gray-400 transition-transform ${showClinicDropdown ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Clinic Dropdown */}
                  {showClinicDropdown && (
                    <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
                      <div className="border-b border-gray-200 p-3">
                        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                          Switch Clinic
                        </p>
                      </div>
                      <div className="max-h-64 overflow-y-auto py-1">
                        {clinics.map((clinic) => (
                          <button
                            key={clinic.id}
                            onClick={() => handleClinicSwitch(clinic)}
                            disabled={switchingClinic}
                            className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 ${
                              clinic.id === activeClinic?.id ? 'bg-green-50' : ''
                            } ${switchingClinic ? 'cursor-not-allowed opacity-50' : ''}`}
                          >
                            {clinic.logoUrl ? (
                              <img
                                src={clinic.logoUrl}
                                alt={clinic.name}
                                className="h-8 w-8 rounded object-cover"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded bg-green-100">
                                <Building2 className="h-4 w-4 text-green-600" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">
                                {clinic.name}
                              </p>
                              <p className="text-xs capitalize text-gray-500">{clinic.role}</p>
                            </div>
                            {clinic.id === activeClinic?.id && (
                              <Check className="h-4 w-4 text-green-600" />
                            )}
                            {clinic.isPrimary && clinic.id !== activeClinic?.id && (
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                                Primary
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      {switchingClinic && (
                        <div className="flex items-center justify-center gap-2 border-t border-gray-200 p-3 text-sm text-gray-500">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
                          Switching...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Single Clinic Display (if only one clinic) */}
              {clinics.length === 1 && activeClinic && (
                <div className="hidden items-center gap-2 px-3 py-2 text-sm text-gray-600 lg:flex">
                  <Building2 className="h-4 w-4" />
                  <span className="max-w-[120px] truncate">{activeClinic.name}</span>
                </div>
              )}

              {/* User Menu */}
              <div className="flex items-center">
                <div className="mr-3 hidden text-right md:block">
                  <p className="text-sm font-medium text-gray-900">
                    Dr. {userData?.firstName} {userData?.lastName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {userData?.specialty || 'General Practice'}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 font-semibold text-white">
                  {userData?.firstName?.[0] || 'D'}
                </div>
              </div>

              {/* Logout */}
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 text-gray-500 hover:text-gray-700"
                title="Sign Out"
              >
                <LogOut className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="hidden border-t border-green-200 bg-green-50 px-4 py-2 lg:block">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-6">
              <span className="flex items-center text-gray-700">
                <Clock className="mr-1 h-4 w-4 text-green-600" />
                Next Appointment: <strong className="ml-1">2:30 PM - John Smith</strong>
              </span>
              <span className="flex items-center text-gray-700">
                <Users className="mr-1 h-4 w-4 text-green-600" />
                Patients Today: <strong className="ml-1">8/12</strong>
              </span>
              <span className="flex items-center text-gray-700">
                <FileText className="mr-1 h-4 w-4 text-green-600" />
                Pending Notes: <strong className="ml-1">3</strong>
              </span>
              <span className="flex items-center text-gray-700">
                <TestTube className="mr-1 h-4 w-4 text-green-600" />
                Lab Results: <strong className="ml-1">5 New</strong>
              </span>
            </div>
            <Link
              href="/provider/schedule"
              className="font-medium text-green-600 hover:text-green-700"
            >
              View Full Schedule →
            </Link>
          </div>
        </div>
      </header>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed bottom-0 left-0 top-16 z-40 border-r border-gray-200 bg-white transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-64'
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <nav className="h-full overflow-y-auto py-4">
          <div className="px-3">
            {/* Main Navigation */}
            <div className="space-y-1">
              {config.navigation.primary.map((item) => {
                const Icon = iconMap[item.icon] || Home;
                const isActive = pathname === item.path || pathname.startsWith(item.path + '/');

                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-l-4 border-green-600 bg-green-50 text-green-700'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <Icon className={`${sidebarCollapsed ? '' : 'mr-3'} h-5 w-5`} />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                    {item.badge === 'count' && !sidebarCollapsed && (
                      <span className="ml-auto rounded-full bg-green-600 px-2 py-0.5 text-xs text-white">
                        3
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Clinical Tools Section */}
            {!sidebarCollapsed && (
              <div className="mt-8 border-t border-gray-200 pt-8">
                <h3 className="mb-3 px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Clinical Tools
                </h3>
                <div className="space-y-1">
                  <Link
                    href="/provider/drug-reference"
                    className="flex items-center rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <BookOpen className="mr-2 h-4 w-4" />
                    Drug Reference
                  </Link>
                  <Link
                    href="/provider/icd-lookup"
                    className="flex items-center rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <Search className="mr-2 h-4 w-4" />
                    ICD-10 Lookup
                  </Link>
                  <Link
                    href="/provider/calculators"
                    className="flex items-center rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  >
                    <Activity className="mr-2 h-4 w-4" />
                    Medical Calculators
                  </Link>
                </div>
              </div>
            )}
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main
        className={`transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
        } mt-24 lg:mt-28`}
      >
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
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
