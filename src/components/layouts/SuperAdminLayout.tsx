'use client';

import AdminLayout from './AdminLayout';

interface SuperAdminLayoutProps {
  children: React.ReactNode;
  userData?: any;
}

// SuperAdminLayout extends AdminLayout with additional features
export default function SuperAdminLayout({ children, userData }: SuperAdminLayoutProps) {
  // For now, use AdminLayout as base with super_admin role
  // In production, this would have additional features like:
  // - Multi-clinic management
  // - System-wide analytics
  // - Global user management
  // - API management
  // - Platform configuration

  return <AdminLayout userData={{ ...userData, role: 'super_admin' }}>{children}</AdminLayout>;
}
