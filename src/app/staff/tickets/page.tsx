'use client';

import { useEffect, useState } from 'react';
import TicketManager from '@/components/TicketManager';
import { getStoredUser } from '@/lib/auth/stored-role';

export default function StaffTicketsPage() {
  const [userId, setUserId] = useState<number>(1);
  const [userRole, setUserRole] = useState<string>('staff');

  useEffect(() => {
    const user = getStoredUser();
    if (user?.id != null) setUserId(Number(user.id));
    if (user?.role) setUserRole((user.role as string).toLowerCase());
  }, []);

  return <TicketManager currentUserId={userId} currentUserRole={userRole} />;
}
