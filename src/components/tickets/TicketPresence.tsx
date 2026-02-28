'use client';

/**
 * Ticket Presence Component
 * =========================
 *
 * Shows which users are currently viewing a ticket.
 * Uses WebSocket when available, gracefully degrades when not.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Eye } from 'lucide-react';
import useWebSocket from '@/hooks/useWebSocket';

interface Viewer {
  userId: number;
  firstName: string;
  lastName: string;
  joinedAt: number;
}

interface TicketPresenceProps {
  ticketId: string | number;
  currentUserId?: number;
  currentUserName?: string;
}

const TICKET_VIEWING = 'ticket:viewing';
const TICKET_LEFT = 'ticket:left';
const TICKET_VIEWERS = 'ticket:viewers';

export default function TicketPresence({
  ticketId,
  currentUserId,
  currentUserName,
}: TicketPresenceProps) {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const { isConnected, emit, subscribe } = useWebSocket({
    autoConnect: true,
    events: [TICKET_VIEWERS],
  });
  const announcedRef = useRef(false);

  useEffect(() => {
    if (!isConnected || !currentUserId) return;

    if (!announcedRef.current) {
      emit(TICKET_VIEWING, {
        ticketId: Number(ticketId),
        userId: currentUserId,
        userName: currentUserName || 'Unknown',
      });
      announcedRef.current = true;
    }

    const unsub = subscribe(TICKET_VIEWERS, (data: unknown) => {
      const payload = data as { ticketId: number; viewers: Viewer[] };
      if (payload.ticketId === Number(ticketId)) {
        setViewers(payload.viewers.filter((v) => v.userId !== currentUserId));
      }
    });

    return () => {
      emit(TICKET_LEFT, { ticketId: Number(ticketId), userId: currentUserId });
      announcedRef.current = false;
      if (unsub) unsub();
    };
  }, [isConnected, ticketId, currentUserId, currentUserName, emit, subscribe]);

  if (viewers.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Eye className="h-4 w-4 text-green-500" />
      <div className="flex -space-x-2">
        {viewers.slice(0, 5).map((v) => (
          <div
            key={v.userId}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-green-100 text-xs font-medium text-green-700"
            title={`${v.firstName} ${v.lastName} is viewing`}
          >
            {v.firstName[0]}{v.lastName[0]}
          </div>
        ))}
      </div>
      {viewers.length > 5 && (
        <span className="text-xs text-gray-500">+{viewers.length - 5} more</span>
      )}
      <span className="text-xs text-green-600">
        {viewers.length === 1 ? '1 other viewing' : `${viewers.length} others viewing`}
      </span>
    </div>
  );
}
