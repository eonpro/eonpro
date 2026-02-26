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
import { apiFetch } from '@/lib/api/fetch';
import { decodeHtmlEntities } from '@/lib/utils';

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

  const prevMessageCountRef = useRef(0);
  const isInitialLoadRef = useRef(true);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    isInitialLoadRef.current = true;
    loadMessages(true);

    const pollInterval = setInterval(() => {
      loadMessages(false);
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [patient.id]);

  useEffect(() => {
    // Always scroll on initial load; after that only scroll when new messages arrive
    if (isInitialLoadRef.current || messages.length > prevMessageCountRef.current) {
      scrollToBottom();
      isInitialLoadRef.current = false;
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, scrollToBottom]);

  const loadMessages = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);

      const res = await apiFetch(`/api/patient-chat?patientId=${patient.id}&limit=100`);

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

    setMessages((prev) => [...prev, tempMessage]);
    setNewMessage('');
    setSending(true);
    setError(null);

    try {
      const res = await apiFetch('/api/patient-chat', {
        method: 'POST',
        body: JSON.stringify({
          patientId: patient.id,
          message: messageText,
          channel: sendViaSms ? 'SMS' : 'WEB',
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessages((prev) => prev.map((msg) => (msg.id === tempId ? data : msg)));

        if (data.status === 'FAILED' && sendViaSms) {
          setError(`SMS delivery failed: ${data.failureReason || 'Could not send SMS to patient'}`);
        }

        setTimeout(() => loadMessages(false), 1000);
      } else {
        throw new Error(data.error || 'Failed to send message');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to send message', { error: errMsg });

      // Mark message as failed
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempId ? { ...msg, status: 'FAILED' as const } : msg))
      );
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
        hour12: true,
        timeZone: 'America/New_York',
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
        year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
        timeZone: 'America/New_York',
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
  const groupedMessages = messages.reduce(
    (groups, message) => {
      const date = formatDate(message.createdAt);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
      return groups;
    },
    {} as Record<string, ChatMessage[]>
  );

  return (
    <div className="flex h-[600px] flex-col rounded-lg border bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
            <span className="font-semibold text-blue-600">
              {patient.firstName.charAt(0)}
              {patient.lastName.charAt(0)}
            </span>
          </div>
          <div>
            <h3 className="font-semibold">
              {patient.firstName} {patient.lastName}
            </h3>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              {patientPhone && <span>{patientPhone}</span>}
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
                  {unreadCount} new
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => loadMessages(true)}
          className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
          title="Refresh messages"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-6">
        {loading && messages.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="py-8 text-center">
            <MessageCircle className="mx-auto mb-3 h-12 w-12 text-gray-400" />
            <p className="text-gray-600">No messages yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Start the conversation by sending a message
            </p>
          </div>
        ) : (
          <>
            {Object.entries(groupedMessages).map(([date, dateMessages]) => (
              <div key={date}>
                <div className="my-4 text-center">
                  <span className="rounded-full bg-white px-3 py-1 text-xs text-gray-500 shadow-sm">
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
                        className={`min-w-0 max-w-xs overflow-hidden rounded-2xl px-4 py-3 lg:max-w-md ${
                          isOutgoing
                            ? 'rounded-br-md bg-blue-600 text-white'
                            : 'rounded-bl-md border bg-white shadow-sm'
                        }`}
                      >
                        {/* Sender info for incoming messages */}
                        {!isOutgoing && message.senderName && (
                          <p className="mb-1 text-xs font-medium text-blue-600">
                            {message.senderName}
                          </p>
                        )}

                        {/* Reply preview */}
                        {message.replyTo && (
                          <div
                            className={`mb-2 rounded-lg border-l-2 px-3 py-1.5 text-xs ${
                              isOutgoing
                                ? 'border-white/50 bg-white/10'
                                : 'border-gray-300 bg-gray-50'
                            }`}
                          >
                            <p
                              className={`font-medium ${isOutgoing ? 'text-white/80' : 'text-gray-600'}`}
                            >
                              {message.replyTo.senderName}
                            </p>
                            <p
                              className={`line-clamp-1 ${isOutgoing ? 'text-white/60' : 'text-gray-500'}`}
                            >
                              {decodeHtmlEntities(message.replyTo.message)}
                            </p>
                          </div>
                        )}

                        <p className="break-all whitespace-pre-wrap text-sm">
                          {decodeHtmlEntities(message.message)}
                        </p>

                        <div
                          className={`mt-1.5 flex items-center gap-1.5 ${
                            isOutgoing ? 'justify-end text-blue-200' : 'text-gray-400'
                          }`}
                        >
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
          <div className="mb-3 flex items-center justify-between rounded-lg bg-red-50 p-2 text-sm text-red-600">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              ✕
            </button>
          </div>
        )}

        {/* Channel selector */}
        {patientPhone && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">Send via:</span>
            <button
              onClick={() => setSendViaSms(false)}
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
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
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
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
            placeholder={sendViaSms ? 'Type a message to send via SMS...' : 'Type a message...'}
            className="flex-1 rounded-xl border px-4 py-2.5 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          {sendViaSms
            ? `SMS will be sent to ${patientPhone}`
            : "Message will appear in patient's app"}
        </p>
      </div>
    </div>
  );
}
