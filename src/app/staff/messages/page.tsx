'use client';

import { useEffect, useState } from 'react';
import InternalChat from '@/components/InternalChat';
import { getStoredUser } from '@/lib/auth/stored-role';

export default function StaffMessagesPage() {
  const [userId, setUserId] = useState<number>(1);
  const [userRole, setUserRole] = useState<string>('staff');

  useEffect(() => {
    const user = getStoredUser();
    if (user?.id != null) setUserId(Number(user.id));
    if (user?.role) setUserRole((user.role as string).toLowerCase());
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow">
        <h1 className="mb-4 text-2xl font-bold">Internal Messages</h1>
        <p className="mb-6 text-gray-600">
          Communicate with providers, other staff members, and support team
        </p>
      </div>
      <InternalChat currentUserId={userId} currentUserRole={userRole} />
    </div>
  );
}
