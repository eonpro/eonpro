'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { getAuthHeaders } from '@/lib/utils/auth-token';
import {
  Send,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  MessageCircle,
  Smile,
  Paperclip,
  MoreVertical,
} from 'lucide-react';

interface ChatMessage {
  id: number;
  createdAt: string;
  message: string;
  direction: 'INBOUND' | 'OUTBOUND';
  channel: 'WEB' | 'SMS' | 'EMAIL';
  senderType: 'PATIENT' | 'STAFF' | 'PROVIDER' | 'SYSTEM';
  senderName: string | null;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  readAt: string | null;
  replyTo?: {
    id: number;
    message: string;
    senderName: string;
  } | null;
}

export default function PatientChatPage() {
  const router = useRouter();
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [patientId, setPatientId] = useState<number | null>(null);
  const [error, setError] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      const userData = JSON.parse(user);
      setPatientId(userData.patientId || userData.id);
    }
  }, []);

  useEffect(() => {
    if (!patientId) return;

    fetchMessages();
    // Poll more frequently for real-time feel: 5 seconds
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [patientId]);

  // Refresh messages when window regains focus
  useEffect(() => {
    const handleFocus = () => {
      if (patientId) fetchMessages();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [patientId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const fetchMessages = async () => {
    if (!patientId) return;
    
    try {
      const response = await fetch(`/api/patient-chat?patientId=${patientId}&limit=100`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (response.ok) {
        const result = await response.json();
        setMessages(result.data || []);
        setError(''); // Clear any previous errors on success
      } else if (response.status === 401) {
        // Session expired - redirect to login
        setError('Session expired. Please log in again.');
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else if (response.status === 403) {
        setError('Access denied. Please contact support.');
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      // Only show error if we haven't loaded messages yet
      if (messages.length === 0) {
        setError('Unable to load messages. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !patientId || sending) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    setSending(true);
    setError('');

    // Optimistic update
    const tempMessage: ChatMessage = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      message: messageText,
      direction: 'INBOUND',
      channel: 'WEB',
      senderType: 'PATIENT',
      senderName: 'You',
      status: 'PENDING',
      readAt: null,
    };
    setMessages(prev => [...prev, tempMessage]);

    try {
      const response = await fetch('/api/patient-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          patientId,
          message: messageText,
          channel: 'WEB',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const sentMessage = await response.json();
      
      // Replace temp message with real one
      setMessages(prev => prev.map(m => 
        m.id === tempMessage.id ? sentMessage : m
      ));
    } catch (err) {
      setError('Failed to send message. Please try again.');
      // Mark temp message as failed
      setMessages(prev => prev.map(m => 
        m.id === tempMessage.id ? { ...m, status: 'FAILED' as const } : m
      ));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  // Group messages by date
  const groupedMessages = messages.reduce((groups, message) => {
    const date = formatDate(message.createdAt);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {} as Record<string, ChatMessage[]>);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="h-3 w-3 text-gray-400" />;
      case 'SENT':
        return <Check className="h-3 w-3 text-gray-400" />;
      case 'DELIVERED':
        return <CheckCheck className="h-3 w-3 text-gray-400" />;
      case 'READ':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case 'FAILED':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <div
          className="h-10 w-10 animate-spin rounded-full border-[3px] border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-3">
        <button
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 active:bg-gray-100"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div className="flex flex-1 items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">Care Team</h1>
            <p className="text-xs text-gray-500">Usually replies within a few hours</p>
          </div>
        </div>
        <button className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 active:bg-gray-100">
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: `${primaryColor}15` }}
            >
              <MessageCircle className="h-8 w-8" style={{ color: primaryColor }} />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Start a Conversation</h2>
            <p className="max-w-[280px] text-sm text-gray-500">
              Send a message to your care team. They'll respond as soon as possible.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedMessages).map(([date, dateMessages]) => (
              <div key={date}>
                {/* Date Divider */}
                <div className="mb-4 flex items-center justify-center">
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
                    {date}
                  </span>
                </div>

                {/* Messages for this date */}
                <div className="space-y-3">
                  {dateMessages.map((message) => {
                    const isOutgoing = message.direction === 'INBOUND'; // Patient's messages are INBOUND to the system
                    
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                            isOutgoing
                              ? 'rounded-br-md bg-gray-900 text-white'
                              : 'rounded-bl-md bg-white text-gray-900 shadow-sm'
                          }`}
                          style={isOutgoing ? { backgroundColor: primaryColor } : {}}
                        >
                          {/* Reply Preview */}
                          {message.replyTo && (
                            <div
                              className={`mb-2 rounded-lg border-l-2 px-3 py-1.5 text-xs ${
                                isOutgoing
                                  ? 'border-white/50 bg-white/10'
                                  : 'border-gray-300 bg-gray-50'
                              }`}
                            >
                              <p className={`font-medium ${isOutgoing ? 'text-white/80' : 'text-gray-600'}`}>
                                {message.replyTo.senderName}
                              </p>
                              <p className={`line-clamp-1 ${isOutgoing ? 'text-white/60' : 'text-gray-500'}`}>
                                {message.replyTo.message}
                              </p>
                            </div>
                          )}

                          {/* Sender Name (for incoming messages) */}
                          {!isOutgoing && message.senderName && (
                            <p className="mb-1 text-xs font-medium" style={{ color: primaryColor }}>
                              {message.senderName}
                            </p>
                          )}

                          {/* Message Content */}
                          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                            {message.message}
                          </p>

                          {/* Time and Status */}
                          <div
                            className={`mt-1.5 flex items-center gap-1.5 ${
                              isOutgoing ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <span
                              className={`text-[11px] ${
                                isOutgoing ? 'text-white/60' : 'text-gray-400'
                              }`}
                            >
                              {formatTime(message.createdAt)}
                            </span>
                            {isOutgoing && (
                              <span className="text-white/60">
                                {getStatusIcon(message.status)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mb-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-gray-200 bg-white p-4 pb-safe">
        <div className="flex items-end gap-3">
          {/* Attachment Button */}
          <button
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
            disabled
          >
            <Paperclip className="h-5 w-5" />
          </button>

          {/* Text Input */}
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pr-12 text-[15px] outline-none transition-all focus:border-gray-300 focus:bg-white"
              style={{ maxHeight: '120px' }}
            />
            <button
              className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
              disabled
            >
              <Smile className="h-5 w-5" />
            </button>
          </div>

          {/* Send Button */}
          <button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || sending}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white transition-all disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {sending ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
