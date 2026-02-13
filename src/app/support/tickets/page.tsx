'use client';

import { useEffect, useState } from 'react';
import TicketManager from '@/components/TicketManager';
import InternalChat from '@/components/InternalChat';

export default function TicketsPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    // Get current user from localStorage or session
    // For now, mock the current user
    setCurrentUser({
      id: 1,
      role: 'admin',
    });
  }, []);

  if (!currentUser) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <TicketManager currentUserId={currentUser.id} currentUserRole={currentUser.role} />
      <InternalChat currentUserId={currentUser.id} currentUserRole={currentUser.role} />
    </div>
  );
}
