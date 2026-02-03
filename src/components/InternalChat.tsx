"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '../lib/logger';
import {
  MessageCircle,
  X,
  Search,
  ChevronLeft,
  Send,
  Check,
  CheckCheck,
  Users,
  Hash,
  Sparkles,
  Shield,
} from 'lucide-react';

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
}

interface InternalChatProps {
  currentUserId: number;
  currentUserRole: string;
}

// =============================================================================
// Apple-Style Internal Chat Component
// =============================================================================

export default function InternalChat({ currentUserId, currentUserRole }: InternalChatProps) {
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ===========================================================================
  // Data Fetching
  // ===========================================================================

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await fetch('/api/internal/users?excludeSelf=true');
      if (response.ok) {
        const data = await response.json();
        const userList = Array.isArray(data) ? data : (data.data || []);
        setUsers(userList.filter((u: User) => u.id !== currentUserId));
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

  const fetchMessages = useCallback(async () => {
    if (!selectedRecipient) return;

    setLoading(true);
    try {
      const response = await fetch('/api/internal/messages');
      if (response.ok) {
        const data = await response.json();
        const messageList = Array.isArray(data) ? data : (data.data || []);

        // IMPORTANT: Ensure numeric comparison - IDs might come as strings from localStorage/JSON
        const myId = Number(currentUserId);
        const theirId = Number(selectedRecipient.id);

        // Debug logging
        console.log('[InternalChat] Filtering messages:', {
          currentUserId,
          myId,
          selectedRecipientId: selectedRecipient.id,
          theirId,
          totalMessages: messageList.length,
          sampleMessages: messageList.slice(0, 3).map((m: Message) => ({
            id: m.id,
            senderId: m.senderId,
            senderIdType: typeof m.senderId,
            recipientId: m.recipientId,
            recipientIdType: typeof m.recipientId,
            msg: m.message?.substring(0, 20)
          }))
        });

        // Use Number() to ensure numeric comparison
        const filteredMessages = messageList.filter((m: Message) => {
          const msgSenderId = Number(m.senderId);
          const msgRecipientId = Number(m.recipientId);
          return (msgSenderId === myId && msgRecipientId === theirId) ||
                 (msgSenderId === theirId && msgRecipientId === myId);
        });

        console.log('[InternalChat] Filtered result:', filteredMessages.length, 'messages');

        filteredMessages.sort((a: Message, b: Message) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        setMessages(filteredMessages);
      }
    } catch (error) {
      logger.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedRecipient, currentUserId]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await fetch('/api/internal/messages?unreadOnly=true');
      if (response.ok) {
        const data = await response.json();
        const messageList = Array.isArray(data) ? data : (data.data || []);
        setUnreadCount(messageList.length);
      }
    } catch (error) {
      logger.error('Error fetching unread count:', error);
    }
  }, []);

  // ===========================================================================
  // Effects
  // ===========================================================================

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      fetchUnreadCount();
    }
  }, [isOpen, fetchUsers, fetchUnreadCount]);

  useEffect(() => {
    if (selectedRecipient) {
      fetchMessages();
      inputRef.current?.focus();
    }
  }, [selectedRecipient, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && selectedRecipient) {
      // Poll every 15 seconds instead of 5 to reduce database load
      const interval = setInterval(() => {
        fetchMessages();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [isOpen, selectedRecipient, fetchMessages]);

  // Separate unread count polling - less frequent
  useEffect(() => {
    if (isOpen) {
      const interval = setInterval(() => {
        fetchUnreadCount();
      }, 30000); // Every 30 seconds
      return () => clearInterval(interval);
    }
  }, [isOpen, fetchUnreadCount]);

  // ===========================================================================
  // Handlers
  // ===========================================================================

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedRecipient || sendingMessage) return;

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
      sender: { id: currentUserId, firstName: 'You', lastName: '', email: '', role: currentUserRole },
    };
    setMessages(prev => [...prev, tempMessage]);

    try {
      const response = await fetch('/api/internal/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: selectedRecipient.id,
          message: messageText,
          messageType: 'DIRECT'
        })
      });

      if (response.ok) {
        const sentMessage = await response.json();
        setMessages(prev => prev.map(m => m.id === tempMessage.id ? sentMessage : m));
      } else {
        // Revert optimistic update
        setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
        setNewMessage(messageText);
      }
    } catch (error) {
      logger.error('Error sending message:', error);
      setMessages(prev => prev.filter(m => m.id !== tempMessage.id));
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
  };

  // ===========================================================================
  // Helpers
  // ===========================================================================

  const filteredUsers = users.filter(user =>
    `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const platformAdmins = filteredUsers.filter(u => u.isPlatformAdmin);
  const regularUsers = filteredUsers.filter(u => !u.isPlatformAdmin);

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
      return 'bg-gradient-to-r from-violet-500 to-purple-500 text-white';
    }
    switch (role?.toLowerCase()) {
      case 'admin': return 'bg-orange-100 text-orange-700';
      case 'provider': return 'bg-blue-100 text-blue-700';
      case 'staff': return 'bg-emerald-100 text-emerald-700';
      case 'support': return 'bg-cyan-100 text-cyan-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getAvatarGradient = (id: number, isPlatformAdmin?: boolean) => {
    if (isPlatformAdmin) {
      return 'from-violet-500 to-purple-600';
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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 group"
        title="Open Team Chat"
      >
        <div className="relative">
          {/* Glow effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />

          {/* Button */}
          <div className="relative bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-full p-4 shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200">
            <MessageCircle className="h-6 w-6" />
          </div>

          {/* Badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 shadow-lg animate-pulse">
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
      className="w-full p-3 flex items-center gap-3 hover:bg-gray-50/80 active:bg-gray-100 transition-colors rounded-xl group"
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${getAvatarGradient(user.id, user.isPlatformAdmin)} flex items-center justify-center shadow-sm`}>
          <span className="text-white font-semibold text-sm">
            {getInitials(user.firstName, user.lastName)}
          </span>
        </div>
        {/* Online indicator */}
        {user.isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />
        )}
        {/* Platform Admin badge */}
        {user.isPlatformAdmin && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-full flex items-center justify-center shadow-sm">
            <Shield className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate text-[15px]">
            {user.firstName} {user.lastName}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${getRoleStyle(user.role, user.isPlatformAdmin)}`}>
            {user.isPlatformAdmin ? 'Platform Admin' : user.role}
          </span>
          {user.clinicName && !user.isPlatformAdmin && (
            <span className="text-xs text-gray-400 truncate">{user.clinicName}</span>
          )}
        </div>
      </div>

      {/* Chevron */}
      <ChevronLeft className="w-4 h-4 text-gray-300 rotate-180 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );

  // ===========================================================================
  // Render: Open State
  // ===========================================================================

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Container with Apple-style shadow and rounded corners */}
      <div className="w-[380px] h-[580px] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 overflow-hidden flex flex-col">

        {/* ===== Header ===== */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-gray-50/80 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            {selectedRecipient ? (
              <>
                <button
                  onClick={() => setSelectedRecipient(null)}
                  className="p-1.5 -ml-1.5 hover:bg-gray-200/60 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-blue-500" />
                </button>
                <div className="flex-1 flex items-center justify-center gap-2">
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarGradient(selectedRecipient.id, selectedRecipient.isPlatformAdmin)} flex items-center justify-center`}>
                    <span className="text-white font-medium text-xs">
                      {getInitials(selectedRecipient.firstName, selectedRecipient.lastName)}
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-900 text-sm leading-tight">
                      {selectedRecipient.firstName} {selectedRecipient.lastName}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {selectedRecipient.isPlatformAdmin ? 'Platform Admin' : selectedRecipient.role}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 text-[15px] leading-tight">Team Chat</h2>
                  <p className="text-[10px] text-gray-500">{users.length} team members</p>
                </div>
              </div>
            )}
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-gray-200/60 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* ===== Content Area ===== */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {selectedRecipient ? (
            // ===== Chat View =====
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gradient-to-b from-gray-50/50 to-white">
                {loading && messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-3" />
                    <p className="text-sm">Loading messages...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                    <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${getAvatarGradient(selectedRecipient.id, selectedRecipient.isPlatformAdmin)} flex items-center justify-center mb-4 opacity-50`}>
                      <span className="text-white font-semibold text-xl">
                        {getInitials(selectedRecipient.firstName, selectedRecipient.lastName)}
                      </span>
                    </div>
                    <p className="font-medium text-gray-600 mb-1">
                      {selectedRecipient.firstName} {selectedRecipient.lastName}
                    </p>
                    <p className="text-sm text-gray-400 text-center max-w-[200px]">
                      Start a conversation with {selectedRecipient.firstName}
                    </p>
                  </div>
                ) : (
                  messages.map((message, index) => {
                    // Use Number() to ensure correct comparison (API might return different types)
                    const isOwn = Number(message.senderId) === Number(currentUserId);
                    const showTimestamp = index === 0 ||
                      new Date(message.createdAt).getTime() - new Date(messages[index - 1].createdAt).getTime() > 300000;

                    return (
                      <div key={message.id}>
                        {showTimestamp && (
                          <p className="text-center text-[10px] text-gray-400 py-2">
                            {formatTime(message.createdAt)}
                          </p>
                        )}
                        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[75%] px-3.5 py-2 rounded-2xl ${
                              isOwn
                                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-br-md'
                                : 'bg-gray-100 text-gray-900 rounded-bl-md'
                            }`}
                          >
                            <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">
                              {message.message}
                            </p>
                            <div className={`flex items-center justify-end gap-1 mt-1 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
                              <span className="text-[10px]">
                                {new Date(message.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              </span>
                              {isOwn && (
                                message.isRead ? (
                                  <CheckCheck className="w-3 h-3" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex-shrink-0 p-3 border-t border-gray-100 bg-white">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="Message..."
                    className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-gray-50 transition-all"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sendingMessage}
                    className="p-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md disabled:shadow-none"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            // ===== Users List View =====
            <>
              {/* Tabs */}
              <div className="flex-shrink-0 px-4 pt-3">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setActiveTab('direct')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
                      activeTab === 'direct'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    Direct
                  </button>
                  <button
                    onClick={() => setActiveTab('channels')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-all ${
                      activeTab === 'channels'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Hash className="w-4 h-4" />
                    Channels
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="flex-shrink-0 px-4 py-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search team members..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-gray-50 transition-all"
                  />
                </div>
              </div>

              {/* Users List */}
              <div className="flex-1 overflow-y-auto px-2">
                {activeTab === 'direct' ? (
                  usersLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                      <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-3" />
                      <p className="text-sm">Loading team...</p>
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                      <Users className="w-12 h-12 mb-3 opacity-30" />
                      <p className="font-medium text-gray-500">No team members found</p>
                      <p className="text-sm text-gray-400 mt-1">Try a different search</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {/* Platform Admins Section */}
                      {platformAdmins.length > 0 && (
                        <div className="mb-2">
                          <div className="flex items-center gap-2 px-3 py-2">
                            <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                            <span className="text-[11px] font-semibold text-violet-600 uppercase tracking-wide">
                              Platform Support
                            </span>
                          </div>
                          {platformAdmins.map(user => (
                            <UserListItem key={user.id} user={user} />
                          ))}
                        </div>
                      )}

                      {/* Regular Users */}
                      {regularUsers.length > 0 && (
                        <div>
                          {platformAdmins.length > 0 && (
                            <div className="flex items-center gap-2 px-3 py-2 mt-2">
                              <Users className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                                Team Members
                              </span>
                            </div>
                          )}
                          {regularUsers.map(user => (
                            <UserListItem key={user.id} user={user} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  // Channels tab - Coming soon
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-4">
                      <Hash className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="font-medium text-gray-500">Channels coming soon</p>
                    <p className="text-sm text-gray-400 mt-1 text-center max-w-[200px]">
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
