"use client";

import { useState, useEffect, useRef } from 'react';
import { logger } from '../lib/logger';

import { 
  Send, 
  MessageCircle, 
  X, 
  Users, 
  Search,
  Paperclip,
  Clock,
  Check,
  CheckCheck,
  ChevronDown,
  Hash,
  Bell
} from 'lucide-react';

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
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

export default function InternalChat({ currentUserId, currentUserRole }: InternalChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'direct' | 'channels'>('direct');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Fetch users for chat
  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      fetchUnreadCount();
    }
  }, [isOpen]);

  // Fetch messages when recipient changes
  useEffect(() => {
    if (selectedRecipient) {
      fetchMessages();
    }
  }, [selectedRecipient]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Poll for new messages
  useEffect(() => {
    if (isOpen && selectedRecipient) {
      const interval = setInterval(() => {
        fetchMessages();
        fetchUnreadCount();
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(interval);
    }
  }, [isOpen, selectedRecipient]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchUsers = async () => {
    try {
      // For now, mock users - in production, fetch from API
      const mockUsers: User[] = [
        { id: 1, firstName: 'Admin', lastName: 'User', email: 'admin@example.com', role: 'admin' },
        { id: 2, firstName: 'Dr. John', lastName: 'Smith', email: 'doctor@example.com', role: 'provider' },
        { id: 3, firstName: 'Support', lastName: 'Team', email: 'support@example.com', role: 'admin' },
      ].filter(u => u.id !== currentUserId);
      
      setUsers(mockUsers);
    } catch (error) {
      logger.error('Error fetching users:', error);
    }
  };

  const fetchMessages = async () => {
    if (!selectedRecipient) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/internal/messages?userId=${currentUserId}`);
      if (response.ok) {
        const data = await response.json();
        // Filter messages for selected conversation
        const filteredMessages = data.filter((m: Message) => 
          (m.senderId === currentUserId && m.recipientId === selectedRecipient.id) ||
          (m.senderId === selectedRecipient.id && m.recipientId === currentUserId)
        );
        setMessages(filteredMessages);
      }
    } catch (error) {
      logger.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const response = await fetch(`/api/internal/messages?userId=${currentUserId}&unreadOnly=true`);
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.length);
      }
    } catch (error) {
      logger.error('Error fetching unread count:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedRecipient) return;

    try {
      const response = await fetch('/api/internal/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUserId,
          recipientId: selectedRecipient.id,
          message: newMessage,
          messageType: 'DIRECT'
        })
      });

      if (response.ok) {
        const sentMessage = await response.json();
        setMessages([...messages, sentMessage]);
        setNewMessage('');
      }
    } catch (error) {
      logger.error('Error sending message:', error);
    }
  };

  const filteredUsers = users.filter(user => 
    `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'provider': return 'bg-blue-100 text-blue-800';
      case 'influencer': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 transition-colors z-50"
        title="Open Internal Chat"
      >
        <MessageCircle className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div 
      ref={chatContainerRef}
      className={`fixed bottom-6 right-6 bg-white rounded-lg shadow-2xl z-50 transition-all ${
        isMinimized ? 'h-14 w-80' : 'h-[600px] w-[400px]'
      }`}
    >
      {/* Header */}
      <div className="bg-blue-600 text-white p-3 rounded-t-lg flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <MessageCircle className="h-5 w-5" />
          <span className="font-semibold">Internal Chat</span>
          {selectedRecipient && (
            <span className="text-sm opacity-90">
              - {selectedRecipient.firstName} {selectedRecipient.lastName}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="hover:bg-blue-700 p-1 rounded"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${isMinimized ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={() => {
              setIsOpen(false);
              setSelectedRecipient(null);
              setMessages([]);
            }}
            className="hover:bg-blue-700 p-1 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="flex h-[calc(100%-56px)]">
          {/* Users List */}
          <div className={`${selectedRecipient ? 'w-0 overflow-hidden' : 'w-full'} transition-all border-r bg-gray-50`}>
            {/* Tabs */}
            <div className="flex border-b bg-white">
              <button
                onClick={() => setActiveTab('direct')}
                className={`flex-1 py-2 px-4 text-sm font-medium ${
                  activeTab === 'direct' 
                    ? 'text-blue-600 border-b-2 border-blue-600' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Users className="h-4 w-4 inline mr-1" />
                Direct
              </button>
              <button
                onClick={() => setActiveTab('channels')}
                className={`flex-1 py-2 px-4 text-sm font-medium ${
                  activeTab === 'channels' 
                    ? 'text-blue-600 border-b-2 border-blue-600' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Hash className="h-4 w-4 inline mr-1" />
                Channels
              </button>
            </div>

            {/* Search */}
            <div className="p-3 bg-white border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Users List */}
            <div className="overflow-y-auto h-[calc(100%-108px)]">
              {activeTab === 'direct' ? (
                filteredUsers.map(user => (
                  <button
                    key={user.id}
                    onClick={() => setSelectedRecipient(user)}
                    className="w-full p-3 hover:bg-white border-b transition-colors flex items-center space-x-3 text-left"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-600 font-semibold">
                        {user.firstName[0]}{user.lastName[0]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-gray-900 truncate">
                          {user.firstName} {user.lastName}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getRoleColor(user.role)}`}>
                          {user.role}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{user.email}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-gray-500">
                  <Hash className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No channels available</p>
                  <p className="text-xs mt-1">Channels coming soon!</p>
                </div>
              )}
            </div>
          </div>

          {/* Chat Area */}
          {selectedRecipient && (
            <div className="flex-1 flex flex-col">
              {/* Chat Header */}
              <div className="p-3 border-b bg-white flex items-center space-x-3">
                <button
                  onClick={() => setSelectedRecipient(null)}
                  className="lg:hidden hover:bg-gray-100 p-1 rounded"
                >
                  <ChevronDown className="h-5 w-5 rotate-90" />
                </button>
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-semibold text-sm">
                    {selectedRecipient.firstName[0]}{selectedRecipient.lastName[0]}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {selectedRecipient.firstName} {selectedRecipient.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{selectedRecipient.role}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                {loading && messages.length === 0 ? (
                  <div className="text-center text-gray-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-sm">Loading messages...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-gray-500">
                    <MessageCircle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No messages yet</p>
                    <p className="text-xs mt-1">Start the conversation!</p>
                  </div>
                ) : (
                  messages.map(message => (
                    <div
                      key={message.id}
                      className={`flex ${message.senderId === currentUserId ? 'justify-end' : 'justify-start'}`}
                    >
                      <div 
                        className={`max-w-[70%] rounded-lg p-3 ${
                          message.senderId === currentUserId 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-white text-gray-900'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                        <div className={`flex items-center space-x-1 mt-1 ${
                          message.senderId === currentUserId ? 'text-blue-100' : 'text-gray-500'
                        }`}>
                          <span className="text-xs">{formatTime(message.createdAt)}</span>
                          {message.senderId === currentUserId && (
                            message.isRead ? (
                              <CheckCheck className="h-3 w-3" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-3 border-t bg-white">
                <div className="flex items-center space-x-2">
                  <button className="text-gray-400 hover:text-gray-600">
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
