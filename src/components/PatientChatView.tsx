'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { logger } from '@/lib/logger';
import {
  Send,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  MessageCircle,
  Phone,
  Mail,
  RefreshCw,
} from 'lucide-react';

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string | null;
  phone?: string;
}

interface ChatMessage {
  id: number | string;
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

interface PatientChatViewProps {
  patient: Patient;
}

export default function PatientChatView({ patient }: PatientChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [sendViaSms, setSendViaSms] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const patientPhone = patient.phoneNumber || patient.phone;

  useEffect(() => {
    setMounted(true);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    loadMessages(true);

    // Poll for new messages every 10 seconds
    const pollInterval = setInterval(() => {
      loadMessages(false);
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [patient.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const loadMessages = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);

      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');

      const res = await fetch(`/api/patient-chat?patientId=${patient.id}&limit=100`, {
        credentials: 'include',
        headers: {
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(data.data || []);
        setUnreadCount(data.meta?.unreadCount || 0);
        setError(null);
      } else {
        const errorData = await res.json().catch(() => ({}));
        if (showLoading) {
          setError(errorData.error || `Failed to load messages (${res.status})`);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to load messages', { error: errMsg });
      if (showLoading) {
        setError('Failed to connect to message service');
      }
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    const messageText = newMessage.trim();
    const tempId = `temp-${Date.now()}`;

    // Optimistic update
    const tempMessage: ChatMessage = {
      id: tempId,
      createdAt: new Date().toISOString(),
      message: messageText,
      direction: 'OUTBOUND',
      channel: sendViaSms ? 'SMS' : 'WEB',
      senderType: 'STAFF',
      senderName: 'You',
      status: 'PENDING',
      readAt: null,
    };

    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');
    setSending(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth-token') || localStorage.getItem('token');

      const res = await fetch('/api/patient-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        credentials: 'include',
        body: JSON.stringify({
          patientId: patient.id,
          message: messageText,
          channel: sendViaSms ? 'SMS' : 'WEB',
        })
      });

      const data = await res.json();

      if (res.ok) {
        // Replace temp message with actual message
        setMessages(prev => prev.map(msg =>
          msg.id === tempId ? data : msg
        ));

        // Reload messages to sync
        setTimeout(() => loadMessages(false), 1000);
      } else {
        throw new Error(data.error || 'Failed to send message');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to send message', { error: errMsg });

      // Mark message as failed
      setMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? { ...msg, status: 'FAILED' as const }
          : msg
      ));
      setError(`Failed to send: ${errMsg}`);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString: string) => {
    if (!mounted) return '—';
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).format(date);
    } catch {
      return '—';
    }
  };

  const formatDate = (dateString: string) => {
    if (!mounted) return '—';
    try {
      const today = new Date();
      const messageDate = new Date(dateString);

      if (messageDate.toDateString() === today.toDateString()) {
        return 'Today';
      }

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (messageDate.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
      }

      return messageDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    } catch {
      return '—';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="h-3 w-3" />;
      case 'SENT':
        return <Check className="h-3 w-3" />;
      case 'DELIVERED':
        return <CheckCheck className="h-3 w-3" />;
      case 'READ':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case 'FAILED':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return null;
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'SMS':
        return <Phone className="h-3 w-3" />;
      case 'EMAIL':
        return <Mail className="h-3 w-3" />;
      default:
        return <MessageCircle className="h-3 w-3" />;
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

  return (
    <div className="bg-white rounded-lg border flex flex-col h-[600px]">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-blue-600 font-semibold">
              {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
            </span>
          </div>
          <div>
            <h3 className="font-semibold">{patient.firstName} {patient.lastName}</h3>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              {patientPhone && <span>{patientPhone}</span>}
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => loadMessages(true)}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
          title="Refresh messages"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
        {loading && messages.length === 0 ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">No messages yet</p>
            <p className="text-sm text-gray-500 mt-1">Start the conversation by sending a message</p>
          </div>
        ) : (
          <>
            {Object.entries(groupedMessages).map(([date, dateMessages]) => (
              <div key={date}>
                <div className="text-center my-4">
                  <span className="text-xs text-gray-500 bg-white px-3 py-1 rounded-full shadow-sm">
                    {date}
                  </span>
                </div>

                {dateMessages.map((message) => {
                  const isOutgoing = message.direction === 'OUTBOUND';

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} mb-3`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${
                          isOutgoing
                            ? 'bg-blue-600 text-white rounded-br-md'
                            : 'bg-white border shadow-sm rounded-bl-md'
                        }`}
                      >
                        {/* Sender info for incoming messages */}
                        {!isOutgoing && message.senderName && (
                          <p className="text-xs font-medium text-blue-600 mb-1">
                            {message.senderName}
                          </p>
                        )}

                        {/* Reply preview */}
                        {message.replyTo && (
                          <div
                            className={`mb-2 px-3 py-1.5 rounded-lg text-xs border-l-2 ${
                              isOutgoing
                                ? 'bg-white/10 border-white/50'
                                : 'bg-gray-50 border-gray-300'
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

                        <p className="text-sm whitespace-pre-wrap">{message.message}</p>

                        <div className={`flex items-center gap-1.5 mt-1.5 ${
                          isOutgoing ? 'text-blue-200 justify-end' : 'text-gray-400'
                        }`}>
                          <span className="text-xs">{formatTime(message.createdAt)}</span>
                          {getChannelIcon(message.channel)}
                          {isOutgoing && getStatusIcon(message.status)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t px-6 py-4">
        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-2 rounded-lg mb-3 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        {/* Channel selector */}
        {patientPhone && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-gray-500">Send via:</span>
            <button
              onClick={() => setSendViaSms(false)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition ${
                !sendViaSms
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <MessageCircle className="h-3 w-3" />
              Web
            </button>
            <button
              onClick={() => setSendViaSms(true)}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition ${
                sendViaSms
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Phone className="h-3 w-3" />
              SMS
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder={sendViaSms ? "Type a message to send via SMS..." : "Type a message..."}
            className="flex-1 px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {sending ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-2">
          {sendViaSms
            ? `SMS will be sent to ${patientPhone}`
            : "Message will appear in patient's app"
          }
        </p>
      </div>
    </div>
  );
}
