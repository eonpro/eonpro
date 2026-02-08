'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getRoleConfig, getRoleTheme } from '@/lib/auth/roles.config';
import { 
  Menu, X, Bell, Search, LogOut, Video, PenTool, Pill,
  Home, Users, Calendar, MessageSquare, FileText, TestTube,
  BookOpen, Clock, AlertCircle, Activity, User, ChevronRight, Settings,
  Building2, ChevronDown, Check
} from 'lucide-react';

// Icon mapping
const iconMap: Record<string, any> = {
  Home, Users, Calendar, Video, Pill, TestTube, FileText, 
  MessageSquare, BookOpen, PenTool, Settings
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
    switch(action) {
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
    if (searchQuery) {
      router.push(`/provider/patients?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token = localStorage.getItem('auth-token') || localStorage.getItem('provider-token');
    if (token) fetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }).catch(() => {});
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
    switch(priority) {
      case 'high': return 'text-red-600 bg-red-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getAlertIcon = (type: string) => {
    switch(type) {
      case 'lab': return TestTube;
      case 'message': return MessageSquare;
      case 'appointment': return Calendar;
      case 'medication': return Pill;
      default: return AlertCircle;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation Bar - Clinical Theme */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b-2 border-green-500 shadow-md">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left section */}
            <div className="flex items-center">
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 hidden lg:block"
              >
                <Menu className="h-6 w-6" />
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 lg:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>
              
              {/* Logo with clinical badge */}
              <div className="flex items-center ml-4 gap-4">
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
            <form onSubmit={handleSearch} className="flex-1 max-w-lg mx-8 hidden md:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search patients by name, ID, or condition..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </form>

            {/* Right section */}
            <div className="flex items-center space-x-4">
              {/* Quick Actions */}
              <div className="hidden lg:flex items-center space-x-2">
                {config.navigation.quick?.map((action) => {
                  const Icon = iconMap[action.icon];
                  return (
                    <button
                      key={action.action}
                      onClick={() => handleQuickAction(action.action)}
                      className={`p-2 rounded-lg text-white transition-colors
                        ${action.color === 'green' ? 'bg-green-600 hover:bg-green-700' : ''}
                        ${action.color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : ''}
                        ${action.color === 'purple' ? 'bg-purple-600 hover:bg-purple-700' : ''}
                      `}
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
                    <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
                      {notifications.length}
                    </span>
                  )}
                </button>
                
                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-4 border-b border-gray-200">
                      <h3 className="text-lg font-semibold text-gray-900">Patient Alerts</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {notifications.map((alert) => {
                        const AlertIcon = getAlertIcon(alert.type);
                        return (
                          <div key={alert.id} className="p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                            <div className="flex items-start">
                              <div className={`p-2 rounded-lg ${getPriorityColor(alert.priority)}`}>
                                <AlertIcon className="h-5 w-5" />
                              </div>
                              <div className="ml-3 flex-1">
                                <p className="text-sm font-medium text-gray-900">{alert.patientName}</p>
                                <p className="text-sm text-gray-600">{alert.message}</p>
                                <p className="text-xs text-gray-400 mt-1">{alert.time}</p>
                              </div>
                              <ChevronRight className="h-5 w-5 text-gray-400" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="p-3 bg-gray-50">
                      <button className="w-full text-center text-sm text-green-600 hover:text-green-700 font-medium">
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
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
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
                    <span className="hidden lg:inline max-w-[120px] truncate font-medium">
                      {activeClinic?.name || 'Select Clinic'}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showClinicDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Clinic Dropdown */}
                  {showClinicDropdown && (
                    <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                      <div className="p-3 border-b border-gray-200">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Switch Clinic</p>
                      </div>
                      <div className="max-h-64 overflow-y-auto py-1">
                        {clinics.map((clinic) => (
                          <button
                            key={clinic.id}
                            onClick={() => handleClinicSwitch(clinic)}
                            disabled={switchingClinic}
                            className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-3 ${
                              clinic.id === activeClinic?.id ? 'bg-green-50' : ''
                            } ${switchingClinic ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {clinic.logoUrl ? (
                              <img
                                src={clinic.logoUrl}
                                alt={clinic.name}
                                className="h-8 w-8 rounded object-cover"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded bg-green-100 flex items-center justify-center">
                                <Building2 className="h-4 w-4 text-green-600" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{clinic.name}</p>
                              <p className="text-xs text-gray-500 capitalize">{clinic.role}</p>
                            </div>
                            {clinic.id === activeClinic?.id && (
                              <Check className="h-4 w-4 text-green-600" />
                            )}
                            {clinic.isPrimary && clinic.id !== activeClinic?.id && (
                              <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                Primary
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                      {switchingClinic && (
                        <div className="p-3 border-t border-gray-200 flex items-center justify-center gap-2 text-sm text-gray-500">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-500 border-t-transparent" />
                          Switching...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Single Clinic Display (if only one clinic) */}
              {clinics.length === 1 && activeClinic && (
                <div className="hidden lg:flex items-center gap-2 px-3 py-2 text-sm text-gray-600">
                  <Building2 className="h-4 w-4" />
                  <span className="max-w-[120px] truncate">{activeClinic.name}</span>
                </div>
              )}

              {/* User Menu */}
              <div className="flex items-center">
                <div className="mr-3 text-right hidden md:block">
                  <p className="text-sm font-medium text-gray-900">
                    Dr. {userData?.firstName} {userData?.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{userData?.specialty || 'General Practice'}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-green-600 flex items-center justify-center text-white font-semibold">
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
        <div className="bg-green-50 border-t border-green-200 px-4 py-2 hidden lg:block">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-6">
              <span className="flex items-center text-gray-700">
                <Clock className="h-4 w-4 mr-1 text-green-600" />
                Next Appointment: <strong className="ml-1">2:30 PM - John Smith</strong>
              </span>
              <span className="flex items-center text-gray-700">
                <Users className="h-4 w-4 mr-1 text-green-600" />
                Patients Today: <strong className="ml-1">8/12</strong>
              </span>
              <span className="flex items-center text-gray-700">
                <FileText className="h-4 w-4 mr-1 text-green-600" />
                Pending Notes: <strong className="ml-1">3</strong>
              </span>
              <span className="flex items-center text-gray-700">
                <TestTube className="h-4 w-4 mr-1 text-green-600" />
                Lab Results: <strong className="ml-1">5 New</strong>
              </span>
            </div>
            <Link href="/provider/schedule" className="text-green-600 hover:text-green-700 font-medium">
              View Full Schedule →
            </Link>
          </div>
        </div>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`fixed left-0 top-16 bottom-0 z-40 bg-white border-r border-gray-200 transition-all duration-300 ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
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
                    className={`flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-green-50 text-green-700 border-l-4 border-green-600'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <Icon className={`${sidebarCollapsed ? '' : 'mr-3'} h-5 w-5`} />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                    {item.badge === 'count' && !sidebarCollapsed && (
                      <span className="ml-auto bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
                        3
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Clinical Tools Section */}
            {!sidebarCollapsed && (
              <div className="mt-8 pt-8 border-t border-gray-200">
                <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Clinical Tools
                </h3>
                <div className="space-y-1">
                  <Link href="/provider/drug-reference" className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Drug Reference
                  </Link>
                  <Link href="/provider/icd-lookup" className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg">
                    <Search className="h-4 w-4 mr-2" />
                    ICD-10 Lookup
                  </Link>
                  <Link href="/provider/calculators" className="flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg">
                    <Activity className="h-4 w-4 mr-2" />
                    Medical Calculators
                  </Link>
                </div>
              </div>
            )}
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className={`transition-all duration-300 ${
        sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
      } mt-24 lg:mt-28`}>
        <div className="p-4 sm:p-6 lg:p-8">
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
