"use client";

import { useEffect, useState } from "react";
import TicketManager from "@/components/TicketManager";
import { logger } from "@/lib/logger";

export default function StaffTicketsPage() {
  const [userId, setUserId] = useState<number>(1);
  const [userRole, setUserRole] = useState<string>("staff");

  useEffect(() => {
    // In a real application, get this from authentication context
    const token = localStorage.getItem("staff-token") || localStorage.getItem("auth-token");
    if (token) {
      try {
        // Decode token to get user info (simplified for demo)
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.userId) setUserId(payload.userId);
        if (payload.role) setUserRole(payload.role);
      } catch (error) {
        logger.error("Error parsing token", error as Error);
      }
    }
  }, []);

  return (
    <TicketManager 
      currentUserId={userId}
      currentUserRole={userRole}
    />
  );
}
