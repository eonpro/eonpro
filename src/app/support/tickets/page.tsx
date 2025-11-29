"use client";

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
      role: 'admin'
    });
  }, []);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <TicketManager 
        currentUserId={currentUser.id} 
        currentUserRole={currentUser.role} 
      />
      <InternalChat 
        currentUserId={currentUser.id} 
        currentUserRole={currentUser.role} 
      />
    </div>
  );
}
