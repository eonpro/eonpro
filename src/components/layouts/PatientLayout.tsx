'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getRoleConfig, getRoleTheme } from '@/lib/auth/roles.config';
import { 
  Menu, X, Bell, User, LogOut, MessageSquare, CalendarPlus,
  Heart, Calendar, Pill, TestTube, FileText, Package, CreditCard,
  ChevronRight, Shield, Phone, AlertCircle, Clock, Activity, Camera
} from 'lucide-react';

// Icon mapping
const iconMap: Record<string, any> = {
  Heart, Calendar, Pill, TestTube, FileText, MessageSquare, 
  Package, CreditCard, User, CalendarPlus, Camera
};

interface PatientLayoutProps {
  children: React.ReactNode;
  userData?: any;
}

interface HealthMetric {
  label: string;
  value: string;
  trend: 'up' | 'down' | 'stable';
  color: string;
}

interface Reminder {
  id: string;
  type: 'medication' | 'appointment' | 'lab' | 'refill';
  title: string;
  time: string;
  urgent: boolean;
}

export default function PatientLayout({ children, userData }: PatientLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [healthMetrics, setHealthMetrics] = useState<HealthMetric[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const config = getRoleConfig('patient');
  const theme = getRoleTheme('patient');

  useEffect(() => {
    loadPatientData();
  }, []);

  const loadPatientData = async () => {
    // Load patient-specific data
    try {
      // Mock data for demo
      setHealthMetrics([
        { label: 'Blood Pressure', value: '120/80', trend: 'stable', color: 'green' },
        { label: 'Weight', value: '165 lbs', trend: 'down', color: 'blue' },
        { label: 'Glucose', value: '95 mg/dL', trend: 'stable', color: 'green' },
        { label: 'Next Appointment', value: 'Dec 15', trend: 'stable', color: 'purple' }
      ]);
      
      setReminders([
        { id: '1', type: 'medication', title: 'Take morning medication', time: '8:00 AM', urgent: false },
        { id: '2', type: 'appointment', title: 'Dr. Smith - Annual Checkup', time: 'Dec 15, 2:30 PM', urgent: false },
        { id: '3', type: 'refill', title: 'Prescription refill needed', time: '5 days left', urgent: true }
      ]);
      
      setUnreadMessages(2);
    } catch (error) {
      // Fallback values
    }
  };

  const handleQuickAction = (action: string) => {
    switch(action) {
      case 'book-appointment':
        router.push('/patient-portal/appointments?action=book');
        break;
      case 'message-provider':
        router.push('/patient-portal/chat');
        break;
      case 'refill-rx':
        router.push('/patient-portal/medications?action=refill');
        break;
      default:
        break;
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('patient-token');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => {});
      }
    } catch {}
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('patient-token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    router.push('/login');
  };

  const getReminderIcon = (type: string) => {
    switch(type) {
      case 'medication': return Pill;
      case 'appointment': return Calendar;
      case 'lab': return TestTube;
      case 'refill': return Package;
      default: return AlertCircle;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Patient-Friendly Header */}
      <header className="bg-white shadow-sm border-b border-blue-200">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left section */}
            <div className="flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 lg:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>
              
              {/* Logo */}
              <div className="flex items-center ml-2 lg:ml-0">
                <img
                  src="https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg"
                  alt="EONPRO logo"
                  className="h-10 w-auto"
                />
              </div>
            </div>

            {/* Right section */}
            <div className="flex items-center space-x-4">
              {/* Quick Actions - Visible on desktop */}
              <div className="hidden lg:flex items-center space-x-3">
                {config.navigation.quick?.map((action) => {
                  const Icon = iconMap[action.icon];
                  return (
                    <button
                      key={action.action}
                      onClick={() => handleQuickAction(action.action)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center
                        ${action.color === 'green' ? 'bg-green-100 text-green-700 hover:bg-green-200' : ''}
                        ${action.color === 'blue' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : ''}
                        ${action.color === 'purple' ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : ''}
                      `}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {action.label}
                    </button>
                  );
                })}
              </div>

              {/* Emergency Contact */}
              <button className="hidden md:flex items-center px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors">
                <Phone className="h-4 w-4 mr-2" />
                <span className="text-sm font-medium">Emergency</span>
              </button>

              {/* Messages */}
              <button 
                onClick={() => router.push('/patient-portal/messages')}
                className="relative p-2 text-gray-500 hover:text-gray-700"
              >
                <MessageSquare className="h-6 w-6" />
                {unreadMessages > 0 && (
                  <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
                    {unreadMessages}
                  </span>
                )}
              </button>

              {/* Notifications */}
              <button className="p-2 text-gray-500 hover:text-gray-700">
                <Bell className="h-6 w-6" />
              </button>

              {/* Profile Menu */}
              <div className="relative">
                <button 
                  onClick={() => setShowProfile(!showProfile)}
                  className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
                    {userData?.firstName?.[0] || 'P'}
                  </div>
                  <div className="hidden md:block text-left">
                    <p className="text-sm font-medium text-gray-900">
                      {userData?.firstName} {userData?.lastName}
                    </p>
                    <p className="text-xs text-gray-500">Patient ID: {userData?.patientId || 'P12345'}</p>
                  </div>
                </button>

                {/* Profile Dropdown */}
                {showProfile && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-4 border-b border-gray-200">
                      <p className="text-sm font-medium text-gray-900">
                        {userData?.firstName} {userData?.lastName}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{userData?.email}</p>
                    </div>
                    <div className="py-1">
                      <Link href="/patient-portal/settings" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                        <User className="h-4 w-4 mr-2" />
                        My Profile
                      </Link>
                      <Link href="/patient-portal/settings?tab=security" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                        <Shield className="h-4 w-4 mr-2" />
                        Privacy & Security
                      </Link>
                      <button 
                        onClick={handleLogout}
                        className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Health Metrics Bar */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-t border-blue-100">
          <div className="flex items-center justify-between overflow-x-auto">
            <div className="flex items-center space-x-6">
              {healthMetrics.map((metric, index) => (
                <div key={index} className="flex items-center whitespace-nowrap">
                  <div className="mr-3">
                    <p className="text-xs text-gray-500">{metric.label}</p>
                    <p className={`text-sm font-semibold ${
                      metric.color === 'green' ? 'text-green-700' : 
                      metric.color === 'blue' ? 'text-blue-700' : 
                      'text-purple-700'
                    }`}>
                      {metric.value}
                    </p>
                  </div>
                  {metric.trend === 'up' && <Activity className="h-4 w-4 text-green-500" />}
                  {metric.trend === 'down' && <Activity className="h-4 w-4 text-blue-500 rotate-180" />}
                  {metric.trend === 'stable' && <Activity className="h-4 w-4 text-gray-400" />}
                </div>
              ))}
            </div>
            <Link href="/patient-portal/health-score" className="text-sm text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap">
              View Full Summary →
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <div className={`fixed inset-0 z-50 lg:hidden ${mobileMenuOpen ? '' : 'pointer-events-none'}`}>
        {/* Overlay */}
        <div 
          className={`fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity ${
            mobileMenuOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setMobileMenuOpen(false)}
        />

        {/* Sidebar */}
        <nav className={`fixed top-0 left-0 bottom-0 flex flex-col w-80 max-w-sm bg-white transition-transform ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
            <span className="text-lg font-semibold text-gray-900">Menu</span>
            <button onClick={() => setMobileMenuOpen(false)} className="p-2">
              <X className="h-6 w-6 text-gray-500" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-1">
              {config.navigation.primary.map((item) => {
                const Icon = iconMap[item.icon] || Heart;
                const isActive = pathname === item.path;
                
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      </div>

      {/* Desktop Navigation */}
      <nav className="hidden lg:block bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              {config.navigation.primary.map((item) => {
                const Icon = iconMap[item.icon] || Heart;
                const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
                
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      isActive
                        ? 'border-blue-500 text-blue-700'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="lg:mt-0">
        {/* Reminders Section */}
        {reminders.length > 0 && pathname === '/patient-portal' && (
          <div className="bg-white border-b border-gray-200">
            <div className="px-4 sm:px-6 lg:px-8 py-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Today's Reminders</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {reminders.map((reminder) => {
                  const ReminderIcon = getReminderIcon(reminder.type);
                  return (
                    <div 
                      key={reminder.id}
                      className={`flex items-center p-3 rounded-lg border ${
                        reminder.urgent 
                          ? 'border-red-200 bg-red-50' 
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${
                        reminder.urgent ? 'bg-red-100' : 'bg-blue-100'
                      }`}>
                        <ReminderIcon className={`h-5 w-5 ${
                          reminder.urgent ? 'text-red-600' : 'text-blue-600'
                        }`} />
                      </div>
                      <div className="ml-3 flex-1">
                        <p className="text-sm font-medium text-gray-900">{reminder.title}</p>
                        <p className="text-xs text-gray-500 flex items-center mt-1">
                          <Clock className="h-3 w-3 mr-1" />
                          {reminder.time}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Page Content */}
        <div className="px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
