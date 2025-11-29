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
import InfluencerLayout from './InfluencerLayout';
import { logger } from '@/lib/logger';

interface RoleBasedLayoutProps {
  children: React.ReactNode;
  userRole: string;
  userData?: any;
}

export default function RoleBasedLayout({ 
  children, 
  userRole, 
  userData 
}: RoleBasedLayoutProps) {
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
      influencer: [/^\/influencer/, /^\/referrals/],
    };

    const allowedPatterns = rolePathPatterns[normalizedRole] || [];
    const isPathAllowed = allowedPatterns.some(pattern => pattern.test(pathname));
    
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
      case 'influencer':
        return <InfluencerLayout userData={userData}>{children}</InfluencerLayout>;
      default:
        return <PatientLayout userData={userData}>{children}</PatientLayout>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-50 to-red-100">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
          <div className="text-red-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            You don't have permission to access this area.
          </p>
          <p className="text-sm text-gray-500">
            Redirecting to your dashboard...
          </p>
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
        const user = JSON.parse(storedUser);
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
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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
