'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '@/components/layouts/AdminLayout';
import AdminDashboard from '@/components/dashboards/AdminDashboard';

export default function AdminPage() {
  const router = useRouter();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check authentication
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/demo/login');
      return;
    }
    
    const data = JSON.parse(user);
    if (data.role?.toLowerCase() !== 'admin' && data.role?.toLowerCase() !== 'super_admin') {
      router.push('/demo/login');
      return;
    }
    
    setUserData(data);
    setLoading(false);
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <AdminLayout userData={userData}>
      <AdminDashboard />
    </AdminLayout>
  );
}