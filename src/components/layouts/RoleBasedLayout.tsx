'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getRoleConfig, getRoleTheme } from '@/lib/auth/roles.config';
import SuperAdminLayout from './SuperAdminLayout';
import AdminLayout from './AdminLayout';
import ProviderLayout from './ProviderLayout';
import StaffLayout from './StaffLayout';
import SupportLayout from './SupportLayout';
import PatientLayout from './PatientLayout';
import { logger } from '@/lib/logger';
import { safeParseJsonString } from '@/lib/utils/safe-json';

interface RoleBasedLayoutProps {
  children: React.ReactNode;
  userRole: string;
  userData?: any;
}

export default function RoleBasedLayout({ children, userRole, userData }: RoleBasedLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isAuthorized, setIsAuthorized] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const normalizedRole = userRole?.toLowerCase() || 'patient';
  const roleConfig = getRoleConfig(normalizedRole);

  useEffect(() => {
    // Check if user is accessing the correct area
    checkAuthorization();
  }, [pathname, normalizedRole]);

  const checkAuthorization = () => {
    setIsLoading(true);

    // Define role-based path patterns
    const rolePathPatterns: Record<string, RegExp[]> = {
      super_admin: [/^\/super-admin/, /^\/admin/, /^\/api\/admin/],
      admin: [/^\/admin/, /^\/staff/, /^\/support/],
      provider: [/^\/provider/, /^\/patients/],
      staff: [/^\/staff/, /^\/support/],
      support: [/^\/support/],
      patient: [/^\/patient-portal/, /^\/appointments/],
    };

    const allowedPatterns = rolePathPatterns[normalizedRole] || [];
    const isPathAllowed = allowedPatterns.some((pattern) => pattern.test(pathname));

    // Check if it's a public path
    const publicPaths = ['/login', '/register', '/forgot-password', '/public', '/'];
    const isPublicPath = publicPaths.includes(pathname) || pathname.startsWith('/public');

    if (!isPublicPath && !isPathAllowed) {
      logger.warn(`Unauthorized access attempt: Role ${normalizedRole} accessing ${pathname}`);
      setIsAuthorized(false);

      // Redirect to role's default path
      setTimeout(() => {
        router.push(roleConfig.defaultPath);
      }, 1000);
    } else {
      setIsAuthorized(true);
    }

    setIsLoading(false);
  };

  // Select the appropriate layout based on role
  const getLayout = () => {
    switch (normalizedRole) {
      case 'super_admin':
        return <SuperAdminLayout userData={userData}>{children}</SuperAdminLayout>;
      case 'admin':
        return <AdminLayout userData={userData}>{children}</AdminLayout>;
      case 'provider':
        return <ProviderLayout userData={userData}>{children}</ProviderLayout>;
      case 'staff':
        return <StaffLayout userData={userData}>{children}</StaffLayout>;
      case 'support':
        return <SupportLayout userData={userData}>{children}</SupportLayout>;
      case 'patient':
        return <PatientLayout userData={userData}>{children}</PatientLayout>;
      default:
        return <PatientLayout userData={userData}>{children}</PatientLayout>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="border-primary mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-b-2"></div>
          <p className="text-gray-600">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50 to-red-100">
        <div className="max-w-md rounded-lg bg-white p-8 text-center shadow-lg">
          <div className="mb-4 text-red-500">
            <svg
              className="mx-auto h-16 w-16"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900">Access Denied</h2>
          <p className="mb-4 text-gray-600">You don't have permission to access this area.</p>
          <p className="text-sm text-gray-500">Redirecting to your dashboard...</p>
        </div>
      </div>
    );
  }

  return getLayout();
}

// Export a HOC for easy page wrapping
export function withRoleBasedLayout<P extends object>(
  Component: React.ComponentType<P>,
  requireRole?: string
) {
  return function WrappedComponent(props: P) {
    const [userRole, setUserRole] = useState<string | null>(null);
    const [userData, setUserData] = useState<any>(null);
    const router = useRouter();

    useEffect(() => {
      // Get user data from localStorage or session
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const user = safeParseJsonString(storedUser);
        if (!user) return;
        setUserRole(user.role);
        setUserData(user);

        // Check if specific role is required
        if (requireRole && user.role.toLowerCase() !== requireRole.toLowerCase()) {
          router.push('/unauthorized');
        }
      } else {
        // No user found, redirect to login
        router.push('/login');
      }
    }, [requireRole, router]);

    if (!userRole) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="border-primary h-12 w-12 animate-spin rounded-full border-b-2"></div>
        </div>
      );
    }

    return (
      <RoleBasedLayout userRole={userRole} userData={userData}>
        <Component {...props} />
      </RoleBasedLayout>
    );
  };
}
