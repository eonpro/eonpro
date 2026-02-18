'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { logger } from '@/lib/logger';
import type { LayoutUser } from '@/types/common';
import { usePathname, useRouter } from 'next/navigation';
import { getRoleConfig, getRoleTheme } from '@/lib/auth/roles.config';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { EONPRO_LOGO } from '@/lib/constants/brand-assets';
import {
  Menu,
  X,
  Bell,
  User,
  LogOut,
  MessageSquare,
  CalendarPlus,
  Heart,
  Calendar,
  Pill,
  TestTube,
  FileText,
  Package,
  CreditCard,
  ChevronRight,
  Shield,
  Phone,
  AlertCircle,
  Clock,
  Activity,
  Camera,
} from 'lucide-react';

// Icon mapping
const iconMap: Record<string, any> = {
  Heart,
  Calendar,
  Pill,
  TestTube,
  FileText,
  MessageSquare,
  Package,
  CreditCard,
  User,
  CalendarPlus,
  Camera,
};

interface PatientLayoutProps {
  children: React.ReactNode;
  userData?: LayoutUser | null;
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
    // Production: load from APIs when available; no demo data
    try {
      setHealthMetrics([]);
      setReminders([]);
      setUnreadMessages(0);
    } catch {
      // Leave empty
    }
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'book-appointment':
        router.push(`${PATIENT_PORTAL_PATH}/appointments?action=book`);
        break;
      case 'message-provider':
        router.push(`${PATIENT_PORTAL_PATH}/chat`);
        break;
      case 'refill-rx':
        router.push(`${PATIENT_PORTAL_PATH}/medications?action=refill`);
        break;
      default:
        break;
    }
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token = localStorage.getItem('auth-token') || localStorage.getItem('patient-token');
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
    localStorage.removeItem('auth-token');
    localStorage.removeItem('patient-token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
  };

  const getReminderIcon = (type: string) => {
    switch (type) {
      case 'medication':
        return Pill;
      case 'appointment':
        return Calendar;
      case 'lab':
        return TestTube;
      case 'refill':
        return Package;
      default:
        return AlertCircle;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
      {/* Patient-Friendly Header */}
      <header className="border-b border-blue-200 bg-white shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Left section */}
            <div className="flex items-center">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>

              {/* Logo */}
              <div className="ml-2 flex items-center lg:ml-0">
                <img
                  src={EONPRO_LOGO}
                  alt="EONPRO logo"
                  className="h-10 w-auto"
                />
              </div>
            </div>

            {/* Right section */}
            <div className="flex items-center space-x-4">
              {/* Quick Actions - Visible on desktop */}
              <div className="hidden items-center space-x-3 lg:flex">
                {config.navigation.quick?.map((action) => {
                  const Icon = iconMap[action.icon];
                  return (
                    <button
                      key={action.action}
                      onClick={() => handleQuickAction(action.action)}
                      className={`flex items-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${action.color === 'green' ? 'bg-green-100 text-green-700 hover:bg-green-200' : ''} ${action.color === 'blue' ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : ''} ${action.color === 'brand' || action.color === 'purple' ? 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)] hover:brightness-95' : ''} `}
                    >
                      <Icon className="mr-2 h-4 w-4" />
                      {action.label}
                    </button>
                  );
                })}
              </div>

              {/* Emergency Contact */}
              <button className="hidden items-center rounded-lg bg-red-100 px-3 py-1.5 text-red-700 transition-colors hover:bg-red-200 md:flex">
                <Phone className="mr-2 h-4 w-4" />
                <span className="text-sm font-medium">Emergency</span>
              </button>

              {/* Messages */}
              <button
                onClick={() => router.push(`${PATIENT_PORTAL_PATH}/messages`)}
                className="relative p-2 text-gray-500 hover:text-gray-700"
              >
                <MessageSquare className="h-6 w-6" />
                {unreadMessages > 0 && (
                  <span className="absolute right-0 top-0 inline-flex -translate-y-1/2 translate-x-1/2 transform items-center justify-center rounded-full bg-red-500 px-2 py-1 text-xs font-bold leading-none text-white">
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
                  className="flex items-center space-x-3 rounded-lg p-2 transition-colors hover:bg-gray-100"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 font-semibold text-white">
                    {userData?.firstName?.[0] || 'P'}
                  </div>
                  <div className="hidden text-left md:block">
                    <p className="text-sm font-medium text-gray-900">
                      {userData?.firstName} {userData?.lastName}
                    </p>
                    {userData?.patientId && (
                      <p className="text-xs text-gray-500">Patient ID: {userData.patientId}</p>
                    )}
                  </div>
                </button>

                {/* Profile Dropdown */}
                {showProfile && (
                  <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-lg">
                    <div className="border-b border-gray-200 p-4">
                      <p className="text-sm font-medium text-gray-900">
                        {userData?.firstName} {userData?.lastName}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">{userData?.email}</p>
                    </div>
                    <div className="py-1">
                      <Link
                        href={`${PATIENT_PORTAL_PATH}/settings`}
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <User className="mr-2 h-4 w-4" />
                        My Profile
                      </Link>
                      <Link
                        href={`${PATIENT_PORTAL_PATH}/settings?tab=security`}
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <Shield className="mr-2 h-4 w-4" />
                        Privacy & Security
                      </Link>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
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
        <div className="border-t border-blue-100 bg-gradient-to-r from-blue-50 to-blue-50 px-4 py-3">
          <div className="flex items-center justify-between overflow-x-auto">
            <div className="flex items-center space-x-6">
              {healthMetrics.map((metric, index) => (
                <div key={index} className="flex items-center whitespace-nowrap">
                  <div className="mr-3">
                    <p className="text-xs text-gray-500">{metric.label}</p>
                    <p
                      className={`text-sm font-semibold ${
                        metric.color === 'green'
                          ? 'text-green-700'
                          : metric.color === 'blue'
                            ? 'text-blue-700'
                            : 'text-[var(--brand-primary)]'
                      }`}
                    >
                      {metric.value}
                    </p>
                  </div>
                  {metric.trend === 'up' && <Activity className="h-4 w-4 text-green-500" />}
                  {metric.trend === 'down' && (
                    <Activity className="h-4 w-4 rotate-180 text-blue-500" />
                  )}
                  {metric.trend === 'stable' && <Activity className="h-4 w-4 text-gray-400" />}
                </div>
              ))}
            </div>
            <Link
              href={`${PATIENT_PORTAL_PATH}/health-score`}
              className="whitespace-nowrap text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              View Full Summary →
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${mobileMenuOpen ? '' : 'pointer-events-none'}`}
      >
        {/* Overlay */}
        <div
          className={`fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity ${
            mobileMenuOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setMobileMenuOpen(false)}
        />

        {/* Sidebar */}
        <nav
          className={`fixed bottom-0 left-0 top-0 flex w-80 max-w-sm flex-col bg-white transition-transform ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4">
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
                    className={`flex items-center rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      </div>

      {/* Desktop Navigation */}
      <nav className="hidden border-b border-gray-200 bg-white shadow-sm lg:block">
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
                    className={`flex items-center border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-blue-500 text-blue-700'
                        : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="mr-2 h-4 w-4" />
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
        {reminders.length > 0 &&
          (pathname === PATIENT_PORTAL_PATH || pathname === '/patient-portal') && (
            <div className="border-b border-gray-200 bg-white">
              <div className="px-4 py-4 sm:px-6 lg:px-8">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">Today's Reminders</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {reminders.map((reminder) => {
                    const ReminderIcon = getReminderIcon(reminder.type);
                    return (
                      <div
                        key={reminder.id}
                        className={`flex items-center rounded-lg border p-3 ${
                          reminder.urgent ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div
                          className={`rounded-lg p-2 ${
                            reminder.urgent ? 'bg-red-100' : 'bg-blue-100'
                          }`}
                        >
                          <ReminderIcon
                            className={`h-5 w-5 ${
                              reminder.urgent ? 'text-red-600' : 'text-blue-600'
                            }`}
                          />
                        </div>
                        <div className="ml-3 flex-1">
                          <p className="text-sm font-medium text-gray-900">{reminder.title}</p>
                          <p className="mt-1 flex items-center text-xs text-gray-500">
                            <Clock className="mr-1 h-3 w-3" />
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
        <div className="px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
