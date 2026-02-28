'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { logger } from '../lib/logger';
import { apiGet, apiFetch } from '@/lib/api/fetch';
import {
  MessageCircle,
  X,
  ChevronLeft,
  Send,
  Check,
  CheckCheck,
  Users,
  Hash,
  Sparkles,
  Shield,
  Heart,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  AlertCircle,
  Laugh,
} from 'lucide-react';
import { normalizedIncludes } from '@/lib/utils/search';

// =============================================================================
// Types
// =============================================================================

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  originalRole?: string;
  clinicName?: string | null;
  specialty?: string | null;
  isOnline?: boolean;
  isPlatformAdmin?: boolean;
}

interface ReactionUser {
  id: number;
  firstName: string;
  lastName: string;
}

interface Reaction {
  id: number;
  emoji: string;
  userId: number;
  user: ReactionUser;
  createdAt: string;
}

interface Message {
  id: number;
  createdAt: string;
  senderId: number;
  recipientId?: number;
  message: string;
  isRead: boolean;
  readAt?: string;
  messageType: string;
  channelId?: string;
  sender: User;
  recipient?: User;
  replies?: Message[];
  reactions?: Reaction[];
}

// iMessage-style reaction types
const REACTION_EMOJIS = {
  love: { icon: Heart, label: 'Love', color: 'text-red-500', bg: 'bg-red-50' },
  like: { icon: ThumbsUp, label: 'Like', color: 'text-blue-500', bg: 'bg-blue-50' },
  dislike: { icon: ThumbsDown, label: 'Dislike', color: 'text-gray-500', bg: 'bg-gray-100' },
  question: { icon: HelpCircle, label: 'Question', color: 'text-[var(--brand-primary)]', bg: 'bg-[var(--brand-primary-light)]' },
  exclamation: {
    icon: AlertCircle,
    label: 'Emphasis',
    color: 'text-orange-500',
    bg: 'bg-orange-50',
  },
  laugh: { icon: Laugh, label: 'Ha ha', color: 'text-yellow-500', bg: 'bg-yellow-50' },
} as const;

type ReactionType = keyof typeof REACTION_EMOJIS;

interface InternalChatProps {
  currentUserId: number;
  currentUserRole: string;
}

// =============================================================================
// Apple-Style Internal Chat Component
// =============================================================================

export default function InternalChat({ currentUserId, currentUserRole }: InternalChatProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'direct' | 'channels'>('direct');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [lastUnreadMessages, setLastUnreadMessages] = useState<Message[]>([]);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>('default');
  const [activeReactionPicker, setActiveReactionPicker] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevUnreadCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastMessageIdRef = useRef<number>(0);
  const unreadPollFailuresRef = useRef(0);
  const messagesPollFailuresRef = useRef(0);

  // Initialize notification sound
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio('/sounds/notification.mp3');
      audioRef.current.volume = 0.3;
    }
  }, []);

  // ===========================================================================
  // Data Fetching
  // ===========================================================================

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await apiFetch('/api/internal/users?excludeSelf=true');
      if (response.ok) {
        const data = await response.json();
        const userList = Array.isArray(data) ? data : data.data || [];
        // Use Number() for safe comparison in case of type mismatches
        setUsers(userList.filter((u: User) => Number(u.id) !== Number(currentUserId)));
      } else {
        logger.error('Failed to fetch users:', response.status);
        setUsers([]);
      }
    } catch (error) {
      logger.error('Error fetching users:', error);
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [currentUserId]);

  const fetchMessages = useCallback(async (): Promise<boolean> => {
    if (!selectedRecipient) {
      return true;
    }

    setLoading(true);
    try {
      // DEBUG: Log what localStorage has vs what props have
      const storedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
      let storedUserId: number | null = null;
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          storedUserId = parsed.id ? Number(parsed.id) : null;
        } catch (e) {
          console.error('[InternalChat] Failed to parse stored user:', e);
        }
      }

      console.log('[InternalChat] User ID comparison:', {
        propsCurrentUserId: currentUserId,
        propsCurrentUserIdType: typeof currentUserId,
        localStorageUserId: storedUserId,
        localStorageUserIdType: typeof storedUserId,
        match: Number(currentUserId) === storedUserId,
      });

      const response = await apiGet('/api/internal/messages');
      if (response.ok) {
        const data = await response.json();
        // Handle both old format (array) and new format (object with messages and _meta)
        const messageList = Array.isArray(data) ? data : data.messages || data.data || [];
        const apiUserId = data._meta?.authenticatedUserId;

        // CRITICAL: Detect and handle auth mismatch between client and server
        if (apiUserId && Number(apiUserId) !== Number(currentUserId)) {
          console.error('[InternalChat] ❌ AUTH MISMATCH DETECTED!', {
            clientUserId: currentUserId,
            serverUserId: apiUserId,
            serverUserRole: data._meta?.authenticatedUserRole,
            localStorageUserId: storedUserId,
          });
          // The API returned messages for a DIFFERENT user than the client expects
          // This is the root cause of the one-way messaging bug
          logger.error('Auth mismatch: client and server have different user IDs');

          // Force re-authentication to fix the mismatch
          // Clear localStorage and redirect to login
          if (typeof window !== 'undefined') {
            console.warn('[InternalChat] Forcing re-authentication due to session mismatch');
            localStorage.removeItem('user');
            // Clear all auth cookies
            const authCookies = [
              'auth-token',
              'admin-token',
              'super_admin-token',
              'provider-token',
              'patient-token',
              'staff-token',
              'support-token',
            ];
            authCookies.forEach((name) => {
              document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
            });
            window.location.href = '/login?reason=session_mismatch';
            return false; // Stop processing
          }
        }

        // IMPORTANT: Ensure numeric comparison - IDs might come as strings from localStorage/JSON
        const myId = Number(currentUserId);
        const theirId = Number(selectedRecipient.id);

        // Debug logging - enhanced
        console.log('[InternalChat] Filtering messages:', {
          currentUserId,
          myId,
          apiAuthenticatedUserId: apiUserId,
          authMatch: apiUserId ? Number(apiUserId) === myId : 'N/A',
          selectedRecipientId: selectedRecipient.id,
          theirId,
          totalMessages: messageList.length,
          // Show ALL messages for debugging
          allMessages: messageList.map((m: Message) => ({
            id: m.id,
            senderId: m.senderId,
            recipientId: m.recipientId,
            senderName: m.sender ? `${m.sender.firstName} ${m.sender.lastName}` : 'unknown',
            msg: m.message?.substring(0, 30),
          })),
        });

        // Use Number() to ensure numeric comparison
        const filteredMessages = messageList.filter((m: Message) => {
          const msgSenderId = Number(m.senderId);
          const msgRecipientId = Number(m.recipientId);
          return (
            (msgSenderId === myId && msgRecipientId === theirId) ||
            (msgSenderId === theirId && msgRecipientId === myId)
          );
        });

        console.log('[InternalChat] Filtered result:', filteredMessages.length, 'messages');

        filteredMessages.sort(
          (a: Message, b: Message) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        // Check if there are new messages from the other person (not from us)
        const latestMessage = filteredMessages[filteredMessages.length - 1];
        if (
          latestMessage &&
          Number(latestMessage.senderId) === theirId &&
          latestMessage.id > lastMessageIdRef.current
        ) {
          // New message from the other person in current conversation
          // Play sound only if this is truly new (not initial load)
          if (lastMessageIdRef.current > 0 && audioRef.current) {
            audioRef.current.play().catch(() => {});
          }
        }

        // Update last message ID
        if (latestMessage) {
          lastMessageIdRef.current = Math.max(lastMessageIdRef.current, latestMessage.id);
        }

        setMessages(filteredMessages);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Error fetching messages:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [selectedRecipient, currentUserId]);

  const fetchUnreadCount = useCallback(async (): Promise<boolean> => {
    try {
      const response = await apiGet('/api/internal/messages?unreadOnly=true');
      if (response.ok) {
        const data = await response.json();
        // Handle both old format (array) and new format (object with messages)
        const messageList: Message[] = Array.isArray(data)
          ? data
          : data.messages || data.data || [];
        const newCount = messageList.length;

        // Check if we have NEW unread messages (count increased)
        if (newCount > prevUnreadCountRef.current && prevUnreadCountRef.current >= 0) {
          // Find the new messages (not seen before)
          const newMessages = messageList.filter(
            (m: Message) => !lastUnreadMessages.find((old: Message) => old.id === m.id)
          );

          if (newMessages.length > 0) {
            const latestMessage = newMessages[0];
            const senderName = latestMessage.sender
              ? `${latestMessage.sender.firstName} ${latestMessage.sender.lastName}`.trim()
              : 'Someone';

            // Play notification sound
            if (audioRef.current) {
              audioRef.current.play().catch(() => {
                // Silently fail if autoplay is blocked
              });
            }

            // Show browser notification if permitted
            if (notificationPermission === 'granted' && !isOpen) {
              new Notification('New Message', {
                body: `${senderName}: ${latestMessage.message.substring(0, 50)}${latestMessage.message.length > 50 ? '...' : ''}`,
                icon: '/favicon.ico',
                tag: 'internal-chat-notification',
              });
            }

            // AUTO-OPEN chat and select the sender when new message arrives
            if (!isOpen && latestMessage.sender) {
              // Open chat window
              setIsOpen(true);
              // Select the sender to show the conversation
              setSelectedRecipient(latestMessage.sender);
            } else if (isOpen && !selectedRecipient && latestMessage.sender) {
              // Chat is open but no conversation selected - select the sender
              setSelectedRecipient(latestMessage.sender);
            }
          }

          setLastUnreadMessages(messageList);
        }

        prevUnreadCountRef.current = newCount;
        setUnreadCount(newCount);
        return true;
      }
      // 500/503 = server/pool stress - signal for backoff
      return false;
    } catch (error) {
      logger.error('Error fetching unread count:', error);
      return false;
    }
  }, [isOpen, selectedRecipient, lastUnreadMessages, notificationPermission]);

  // ===========================================================================
  // Effects
  // ===========================================================================

  // Request notification permission on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === 'default') {
        Notification.requestPermission().then((permission) => {
          setNotificationPermission(permission);
        });
      }
    }
  }, []);

  // Poll for unread messages with exponential backoff on 500/503 (connection pool stress)
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const BASE_MS = isOpen ? 4000 : 5000;
    const MAX_MS = 60000;

    const scheduleNext = () => {
      if (cancelled) {
        return;
      }
      const delay = Math.min(
        BASE_MS * Math.pow(2, unreadPollFailuresRef.current),
        MAX_MS
      );
      timeoutId = setTimeout(() => {
        timeoutId = null;
        if (cancelled) {
          return;
        }
        fetchUnreadCount().then((ok) => {
          if (cancelled) {
            return;
          }
          if (ok) {
            unreadPollFailuresRef.current = 0;
          } else {
            unreadPollFailuresRef.current = Math.min(
              unreadPollFailuresRef.current + 1,
              8
            );
          }
          scheduleNext();
        });
      }, delay);
    };

    fetchUnreadCount().then((ok) => {
      if (cancelled) {
        return;
      }
      if (ok) {
        unreadPollFailuresRef.current = 0;
      } else {
        unreadPollFailuresRef.current = 1;
      }
      scheduleNext();
    });

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [fetchUnreadCount, isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen, fetchUsers]);

  useEffect(() => {
    if (selectedRecipient) {
      // Reset message tracking when switching conversations
      lastMessageIdRef.current = 0;
      fetchMessages();
      inputRef.current?.focus();
    }
  }, [selectedRecipient, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close reaction picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Close if clicking outside the reaction picker area
      if (activeReactionPicker && !target.closest('[data-reaction-picker]')) {
        setActiveReactionPicker(null);
      }
    };

    if (!activeReactionPicker) return;

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeReactionPicker]);

  useEffect(() => {
    if (!isOpen || !selectedRecipient) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const BASE_MS = 4000;
    const MAX_MS = 60000;

    const scheduleNext = () => {
      if (cancelled) {
        return;
      }
      const delay = Math.min(
        BASE_MS * Math.pow(2, messagesPollFailuresRef.current),
        MAX_MS
      );
      timeoutId = setTimeout(() => {
        timeoutId = null;
        if (cancelled) {
          return;
        }
        fetchMessages().then((ok) => {
          if (cancelled) {
            return;
          }
          if (ok) {
            messagesPollFailuresRef.current = 0;
          } else {
            messagesPollFailuresRef.current = Math.min(
              messagesPollFailuresRef.current + 1,
              8
            );
          }
          scheduleNext();
        });
      }, delay);
    };

    fetchMessages().then((ok) => {
      if (cancelled) {
        return;
      }
      if (ok) {
        messagesPollFailuresRef.current = 0;
      } else {
        messagesPollFailuresRef.current = 1;
      }
      scheduleNext();
    });

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isOpen, selectedRecipient, fetchMessages]);

  // ===========================================================================
  // Handlers
  // ===========================================================================

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedRecipient || sendingMessage) {
      return;
    }

    const messageText = newMessage.trim();
    setNewMessage('');
    setSendingMessage(true);

    // Optimistic update
    const tempMessage: Message = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      senderId: currentUserId,
      recipientId: selectedRecipient.id,
      message: messageText,
      isRead: false,
      messageType: 'DIRECT',
      sender: {
        id: currentUserId,
        firstName: 'You',
        lastName: '',
        email: '',
        role: currentUserRole,
      },
    };
    setMessages((prev) => [...prev, tempMessage]);

    try {
      const response = await apiFetch('/api/internal/messages', {
        method: 'POST',
        body: JSON.stringify({
          recipientId: selectedRecipient.id,
          message: messageText,
          messageType: 'DIRECT',
        }),
      });

      if (response.ok) {
        const sentMessage = await response.json();
        setMessages((prev) => prev.map((m) => (m.id === tempMessage.id ? sentMessage : m)));
      } else {
        // Revert optimistic update
        setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id));
        setNewMessage(messageText);
      }
    } catch (error) {
      logger.error('Error sending message:', error);
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id));
      setNewMessage(messageText);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedRecipient(null);
    setMessages([]);
    setSearchTerm('');
    setActiveReactionPicker(null);
  };

  const addReaction = async (messageId: number, emoji: ReactionType) => {
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === messageId) {
          const existingReaction = m.reactions?.find(
            (r) => r.userId === currentUserId && r.emoji === emoji
          );
          if (existingReaction) {
            // Already reacted with this emoji, do nothing
            return m;
          }
          const newReaction: Reaction = {
            id: Date.now(),
            emoji,
            userId: currentUserId,
            user: { id: currentUserId, firstName: 'You', lastName: '' },
            createdAt: new Date().toISOString(),
          };
          return {
            ...m,
            reactions: [...(m.reactions || []), newReaction],
          };
        }
        return m;
      })
    );
    setActiveReactionPicker(null);

    try {
      const response = await apiFetch(`/api/internal/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });

      if (!response.ok) {
        // Revert optimistic update on error
        fetchMessages();
      }
    } catch (error) {
      logger.error('Error adding reaction:', error);
      fetchMessages();
    }
  };

  const removeReaction = async (messageId: number, emoji: string) => {
    // Optimistic update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === messageId) {
          return {
            ...m,
            reactions: m.reactions?.filter(
              (r) => !(r.userId === currentUserId && r.emoji === emoji)
            ),
          };
        }
        return m;
      })
    );

    try {
      const response = await apiFetch(
        `/api/internal/messages/${messageId}/reactions?emoji=${encodeURIComponent(emoji)}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        fetchMessages();
      }
    } catch (error) {
      logger.error('Error removing reaction:', error);
      fetchMessages();
    }
  };

  const toggleReaction = (messageId: number, emoji: ReactionType) => {
    const message = messages.find((m) => m.id === messageId);
    const existingReaction = message?.reactions?.find(
      (r) => r.userId === currentUserId && r.emoji === emoji
    );

    if (existingReaction) {
      removeReaction(messageId, emoji);
    } else {
      addReaction(messageId, emoji);
    }
  };

  // ===========================================================================
  // Helpers
  // ===========================================================================

  const filteredUsers = users.filter(
    (user) => {
      if (!searchTerm) return true;
      return (
        normalizedIncludes(`${user.firstName} ${user.lastName}`, searchTerm) ||
        normalizedIncludes(user.email, searchTerm)
      );
    }
  );

  const platformAdmins = filteredUsers.filter((u) => u.isPlatformAdmin);
  const regularUsers = filteredUsers.filter((u) => !u.isPlatformAdmin);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  };

  const getRoleStyle = (role: string, isPlatformAdmin?: boolean) => {
    if (isPlatformAdmin) {
      return 'bg-[var(--brand-primary)] text-white';
    }
    switch (role?.toLowerCase()) {
      case 'admin':
        return 'bg-orange-100 text-orange-700';
      case 'provider':
        return 'bg-blue-100 text-blue-700';
      case 'staff':
        return 'bg-emerald-100 text-emerald-700';
      case 'support':
        return 'bg-cyan-100 text-cyan-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getAvatarGradient = (id: number, isPlatformAdmin?: boolean) => {
    if (isPlatformAdmin) {
      return 'from-[var(--brand-primary)] to-[var(--brand-primary)]';
    }
    const gradients = [
      'from-blue-400 to-blue-600',
      'from-emerald-400 to-emerald-600',
      'from-orange-400 to-orange-600',
      'from-pink-400 to-pink-600',
      'from-cyan-400 to-cyan-600',
      'from-amber-400 to-amber-600',
    ];
    return gradients[id % gradients.length];
  };

  // ===========================================================================
  // Render: Closed State (Floating Button)
  // ===========================================================================

  const hideButtonOnMobile = pathname?.startsWith('/provider/prescription-queue');

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={`group fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6${hideButtonOnMobile ? ' hidden sm:block' : ''}`}
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        title="Open Team Chat"
      >
        <div className="relative">
          {/* Pulsing ring animation when there are unread messages */}
          {unreadCount > 0 && (
            <div className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-75" />
          )}

          {/* Glow effect */}
          <div
            className={`absolute inset-0 rounded-full blur-lg transition-opacity ${
              unreadCount > 0
                ? 'bg-gradient-to-r from-red-500 to-orange-500 opacity-60'
                : 'bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-primary)] opacity-40 group-hover:opacity-60'
            }`}
          />

          {/* Button - smaller on mobile so it doesn't cover queue content */}
          <div
            className={`relative transform rounded-full p-3 text-white shadow-xl transition-all duration-200 hover:scale-105 hover:shadow-2xl sm:p-4 ${
              unreadCount > 0
                ? 'bg-gradient-to-r from-red-500 to-orange-500'
                : 'bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-primary)]'
            }`}
          >
            <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>

          {/* Badge */}
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[18px] animate-pulse items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-lg sm:-right-1 sm:-top-1 sm:h-5 sm:min-w-[20px] sm:px-1.5 sm:text-[10px]">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </button>
    );
  }

  // ===========================================================================
  // Render: User List Item
  // ===========================================================================

  const UserListItem = ({ user }: { user: User }) => (
    <button
      onClick={() => setSelectedRecipient(user)}
      className="group flex w-full items-center gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50/80 active:bg-gray-100"
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div
          className={`h-11 w-11 rounded-full bg-gradient-to-br ${getAvatarGradient(user.id, user.isPlatformAdmin)} flex items-center justify-center shadow-sm`}
        >
          <span className="text-sm font-semibold text-white">
            {getInitials(user.firstName, user.lastName)}
          </span>
        </div>
        {/* Online indicator */}
        {user.isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" />
        )}
        {/* Platform Admin badge */}
        {user.isPlatformAdmin && (
          <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand-primary)] shadow-sm">
            <Shield className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium text-gray-900">
            {user.firstName} {user.lastName}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getRoleStyle(user.role, user.isPlatformAdmin)}`}
          >
            {user.isPlatformAdmin ? 'Platform Admin' : user.role}
          </span>
          {user.clinicName && !user.isPlatformAdmin && (
            <span className="truncate text-xs text-gray-400">{user.clinicName}</span>
          )}
        </div>
      </div>

      {/* Chevron */}
      <ChevronLeft className="h-4 w-4 rotate-180 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );

  // ===========================================================================
  // Render: Open State
  // ===========================================================================

  return (
    <div
      className="fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6"
      style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      {/* Container - full height on mobile, fixed height on sm+ */}
      <div className="flex h-[min(85dvh,580px)] w-[min(100vw-2rem,380px)] flex-col overflow-hidden rounded-2xl border border-gray-200/50 bg-white/95 shadow-2xl backdrop-blur-xl sm:h-[580px] sm:w-[380px]">
        {/* ===== Header ===== */}
        <div className="flex-shrink-0 border-b border-gray-100 bg-gray-50/80 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            {selectedRecipient ? (
              <>
                <button
                  onClick={() => setSelectedRecipient(null)}
                  className="-ml-1.5 rounded-lg p-1.5 transition-colors hover:bg-gray-200/60"
                >
                  <ChevronLeft className="h-5 w-5 text-blue-500" />
                </button>
                <div className="flex flex-1 items-center justify-center gap-2">
                  <div
                    className={`h-8 w-8 rounded-full bg-gradient-to-br ${getAvatarGradient(selectedRecipient.id, selectedRecipient.isPlatformAdmin)} flex items-center justify-center`}
                  >
                    <span className="text-xs font-medium text-white">
                      {getInitials(selectedRecipient.firstName, selectedRecipient.lastName)}
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold leading-tight text-gray-900">
                      {selectedRecipient.firstName} {selectedRecipient.lastName}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {selectedRecipient.isPlatformAdmin
                        ? 'Platform Admin'
                        : selectedRecipient.role}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-primary)]">
                  <MessageCircle className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold leading-tight text-gray-900">
                    Team Chat
                  </h2>
                  <p className="text-[10px] text-gray-500">{users.length} team members</p>
                </div>
              </div>
            )}
            <button
              onClick={handleClose}
              className="rounded-lg p-1.5 transition-colors hover:bg-gray-200/60"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* ===== Content Area ===== */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedRecipient ? (
            // ===== Chat View =====
            <>
              {/* Messages */}
              <div className="flex-1 space-y-2 overflow-y-auto bg-gradient-to-b from-gray-50/50 to-white px-4 py-3">
                {loading && messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-gray-400">
                    <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
                    <p className="text-sm">Loading messages...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center py-12 text-gray-400">
                    <div
                      className={`h-16 w-16 rounded-full bg-gradient-to-br ${getAvatarGradient(selectedRecipient.id, selectedRecipient.isPlatformAdmin)} mb-4 flex items-center justify-center opacity-50`}
                    >
                      <span className="text-xl font-semibold text-white">
                        {getInitials(selectedRecipient.firstName, selectedRecipient.lastName)}
                      </span>
                    </div>
                    <p className="mb-1 font-medium text-gray-600">
                      {selectedRecipient.firstName} {selectedRecipient.lastName}
                    </p>
                    <p className="max-w-[200px] text-center text-sm text-gray-400">
                      Start a conversation with {selectedRecipient.firstName}
                    </p>
                  </div>
                ) : (
                  messages.map((message, index) => {
                    // Use Number() to ensure correct comparison (API might return different types)
                    const isOwn = Number(message.senderId) === Number(currentUserId);
                    const showTimestamp =
                      index === 0 ||
                      new Date(message.createdAt).getTime() -
                        new Date(messages[index - 1].createdAt).getTime() >
                        300000;

                    // Group reactions by emoji
                    const reactionGroups = (message.reactions || []).reduce(
                      (acc, r) => {
                        if (!acc[r.emoji]) {
                          acc[r.emoji] = [];
                        }
                        acc[r.emoji].push(r);
                        return acc;
                      },
                      {} as Record<string, Reaction[]>
                    );

                    const hasReactions = Object.keys(reactionGroups).length > 0;

                    return (
                      <div key={message.id}>
                        {showTimestamp && (
                          <p className="py-2 text-center text-[10px] text-gray-400">
                            {formatTime(message.createdAt)}
                          </p>
                        )}
                        <div className={`group flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <div className="relative max-w-[75%]">
                            {/* Message Bubble */}
                            <div
                              className={`rounded-2xl px-3.5 py-2 ${
                                isOwn
                                  ? 'rounded-br-md bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                                  : 'rounded-bl-md bg-gray-100 text-gray-900'
                              }`}
                              onDoubleClick={() =>
                                setActiveReactionPicker(
                                  activeReactionPicker === message.id ? null : message.id
                                )
                              }
                            >
                              <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">
                                {message.message}
                              </p>
                              <div
                                className={`mt-1 flex items-center justify-end gap-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}
                              >
                                <span className="text-[10px]">
                                  {new Date(message.createdAt).toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                </span>
                                {isOwn &&
                                  (message.isRead ? (
                                    <CheckCheck className="h-3 w-3" />
                                  ) : (
                                    <Check className="h-3 w-3" />
                                  ))}
                              </div>
                            </div>

                            {/* Reactions Display */}
                            {hasReactions && (
                              <div
                                className={`mt-1 flex flex-wrap gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}
                              >
                                {Object.entries(reactionGroups).map(([emoji, reactions]) => {
                                  const config = REACTION_EMOJIS[emoji as ReactionType];
                                  if (!config) {
                                    return null;
                                  }
                                  const Icon = config.icon;
                                  const hasUserReacted = reactions.some(
                                    (r) => r.userId === currentUserId
                                  );
                                  return (
                                    <button
                                      key={emoji}
                                      onClick={() =>
                                        toggleReaction(message.id, emoji as ReactionType)
                                      }
                                      className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] transition-all ${
                                        hasUserReacted
                                          ? `${config.bg} ${config.color} ring-current/20 ring-1 ring-inset`
                                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                      }`}
                                      title={reactions
                                        .map((r) => `${r.user.firstName} ${r.user.lastName}`.trim())
                                        .join(', ')}
                                    >
                                      <Icon className="h-3 w-3" />
                                      {reactions.length > 1 && <span>{reactions.length}</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Reaction Picker (shows on double-click or hover) */}
                            {activeReactionPicker === message.id && (
                              <div
                                data-reaction-picker
                                className={`absolute ${isOwn ? 'right-0' : 'left-0'} -top-10 z-10 flex gap-0.5 rounded-full bg-white p-1 shadow-lg ring-1 ring-gray-200`}
                              >
                                {(Object.keys(REACTION_EMOJIS) as ReactionType[]).map((emoji) => {
                                  const config = REACTION_EMOJIS[emoji];
                                  const Icon = config.icon;
                                  const hasUserReacted = message.reactions?.some(
                                    (r) => r.userId === currentUserId && r.emoji === emoji
                                  );
                                  return (
                                    <button
                                      key={emoji}
                                      onClick={() => toggleReaction(message.id, emoji)}
                                      className={`rounded-full p-1.5 transition-all hover:scale-110 ${
                                        hasUserReacted
                                          ? `${config.bg} ${config.color}`
                                          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                                      }`}
                                      title={config.label}
                                    >
                                      <Icon className="h-4 w-4" />
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Hover indicator to open reaction picker */}
                            <button
                              onClick={() =>
                                setActiveReactionPicker(
                                  activeReactionPicker === message.id ? null : message.id
                                )
                              }
                              className={`absolute ${isOwn ? '-left-7' : '-right-7'} top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-300 opacity-0 transition-all hover:bg-gray-100 hover:text-gray-500 group-hover:opacity-100`}
                              title="Add reaction"
                            >
                              <Heart className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex-shrink-0 border-t border-gray-100 bg-white p-3">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="Message..."
                    className="flex-1 rounded-full bg-gray-100 px-4 py-2.5 text-sm transition-all placeholder:text-gray-400 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sendingMessage}
                    className="rounded-full bg-gradient-to-r from-blue-500 to-blue-600 p-2.5 text-white shadow-sm transition-all hover:from-blue-600 hover:to-blue-700 hover:shadow-md disabled:cursor-not-allowed disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            // ===== Users List View =====
            <>
              {/* Tabs */}
              <div className="flex-shrink-0 px-4 pt-3">
                <div className="flex rounded-lg bg-gray-100 p-1">
                  <button
                    onClick={() => setActiveTab('direct')}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all ${
                      activeTab === 'direct'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    Direct
                  </button>
                  <button
                    onClick={() => setActiveTab('channels')}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition-all ${
                      activeTab === 'channels'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Hash className="h-4 w-4" />
                    Channels
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="flex-shrink-0 px-4 py-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search team members..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-xl bg-gray-100 py-2.5 pl-4 pr-4 text-sm transition-all placeholder:text-gray-400 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Users List */}
              <div className="flex-1 overflow-y-auto px-2">
                {activeTab === 'direct' ? (
                  usersLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                      <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-500" />
                      <p className="text-sm">Loading team...</p>
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                      <Users className="mb-3 h-12 w-12 opacity-30" />
                      <p className="font-medium text-gray-500">No team members found</p>
                      <p className="mt-1 text-sm text-gray-400">Try a different search</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {/* Platform Admins Section */}
                      {platformAdmins.length > 0 && (
                        <div className="mb-2">
                          <div className="flex items-center gap-2 px-3 py-2">
                            <Sparkles className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-primary)]">
                              Platform Support
                            </span>
                          </div>
                          {platformAdmins.map((user) => (
                            <UserListItem key={user.id} user={user} />
                          ))}
                        </div>
                      )}

                      {/* Regular Users */}
                      {regularUsers.length > 0 && (
                        <div>
                          {platformAdmins.length > 0 && (
                            <div className="mt-2 flex items-center gap-2 px-3 py-2">
                              <Users className="h-3.5 w-3.5 text-gray-400" />
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                Team Members
                              </span>
                            </div>
                          )}
                          {regularUsers.map((user) => (
                            <UserListItem key={user.id} user={user} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  // Channels tab - Coming soon
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200">
                      <Hash className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="font-medium text-gray-500">Channels coming soon</p>
                    <p className="mt-1 max-w-[200px] text-center text-sm text-gray-400">
                      Group conversations for teams and departments
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
