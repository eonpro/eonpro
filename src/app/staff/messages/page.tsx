"use client";

import { useEffect, useState } from "react";
import InternalChat from "@/components/InternalChat";
import { logger } from "@/lib/logger";

export default function StaffMessagesPage() {
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
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold mb-4">Internal Messages</h1>
        <p className="text-gray-600 mb-6">
          Communicate with providers, other staff members, and support team
        </p>
      </div>
      <InternalChat 
        currentUserId={userId}
        currentUserRole={userRole}
      />
    </div>
  );
}
