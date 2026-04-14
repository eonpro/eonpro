'use client';

import { useState, useEffect, useRef } from 'react';
import { decodeHtmlEntities } from '@/lib/utils';
import {
  MessageSquare,
  Send,
  Paperclip,
  Phone,
  Video,
  Star,
  Archive,
  Plus,
  Inbox,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

interface Message {
  id: number;
  patientId: number;
  patientName: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
  priority: 'normal' | 'urgent';
}

interface ChatMessage {
  id: number;
  sender: 'provider' | 'patient';
  content: string;
  timestamp: string;
}

export default function ProviderMessagesPage() {
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'urgent'>('all');
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const providerInputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch conversations from API
  useEffect(() => {
    async function fetchMessages() {
      try {
        setLoading(true);
        setError(null);
        const response = await apiFetch('/api/messages/conversations');

        if (response.ok) {
          const data = await response.json();
          setMessages(data.conversations || []);
        } else {
          setMessages([]);
          if (response.status === 401) {
            setError('Please log in to view messages.');
          } else {
            setError('Failed to load messages. Please try again.');
          }
        }
      } catch (err) {
        process.env.NODE_ENV === 'development' && console.error('Failed to fetch messages:', err);
        setMessages([]);
        setError('Failed to load messages. Please check your connection.');
      } finally {
        setLoading(false);
      }
    }

    fetchMessages();
  }, []);

  // Fetch chat thread when conversation selected
  const selectedPatientId = selectedMessage?.patientId;
  useEffect(() => {
    if (!selectedPatientId) {
      setChatMessages([]);
      return;
    }

    async function fetchThread() {
      try {
        const response = await apiFetch(`/api/messages/conversations/${selectedPatientId}`);

        if (response.ok) {
          const data = await response.json();
          setChatMessages(data.messages || []);
        } else {
          setChatMessages([]);
        }
      } catch (err) {
        process.env.NODE_ENV === 'development' && console.error('Failed to fetch thread:', err);
        setChatMessages([]);
      }
    }

    fetchThread();
  }, [selectedPatientId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const filteredMessages = messages.filter((msg) => {
    const matchesSearch = normalizedIncludes(msg.patientName, searchTerm);
    const matchesFilter =
      filter === 'all' ||
      (filter === 'unread' && msg.unread) ||
      (filter === 'urgent' && msg.priority === 'urgent');
    return matchesSearch && matchesFilter;
  });

  const handleSendMessage = async () => {
    if (!messageContent.trim() || !selectedMessage) return;

    const content = messageContent.trim();
    setMessageContent('');
    if (providerInputRef.current) providerInputRef.current.style.height = 'auto';

    try {
      const response = await apiFetch(`/api/messages/send`, {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedMessage.patientId,
          content,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send message');
      }

      const data = await response.json();

      if (data.message) {
        setChatMessages((prev) => [...prev, data.message]);
      } else {
        // Fallback: refetch the full thread
        const threadRes = await apiFetch(
          `/api/messages/conversations/${selectedMessage.patientId}`
        );
        if (threadRes.ok) {
          const threadData = await threadRes.json();
          setChatMessages(threadData.messages || []);
        }
      }

      // Update the conversation sidebar preview
      setMessages((prev) =>
        prev.map((m) =>
          m.patientId === selectedMessage.patientId
            ? {
                ...m,
                lastMessage: content,
                timestamp: new Date().toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              }
            : m
        )
      );
    } catch (err) {
      setMessageContent(content);
      process.env.NODE_ENV === 'development' && console.error('Failed to send message:', err);
      alert(err instanceof Error ? err.message : 'Failed to send message. Please try again.');
    }
  };

  const unreadCount = messages.filter((m) => m.unread).length;

  return (
    <div className="mx-4 h-[calc(100vh-12rem)] max-w-full overflow-hidden md:mx-6 lg:mx-8">
      <div className="flex h-full min-w-0 rounded-lg bg-white shadow">
        {/* Messages List */}
        <div className="flex w-1/3 min-w-0 flex-col border-r">
          <div className="border-b p-4">
            <h2 className="mb-3 text-lg font-semibold">Messages</h2>
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="Search patients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border py-2 pl-4 pr-4 focus:ring-2 focus:ring-[var(--brand-primary)]"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`rounded px-3 py-1 text-sm ${
                  filter === 'all'
                    ? 'bg-[var(--brand-primary)] text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`rounded px-3 py-1 text-sm ${
                  filter === 'unread'
                    ? 'bg-[var(--brand-primary)] text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                Unread ({unreadCount})
              </button>
              <button
                onClick={() => setFilter('urgent')}
                className={`rounded px-3 py-1 text-sm ${
                  filter === 'urgent'
                    ? 'bg-[var(--brand-primary)] text-white'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                Urgent
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="animate-pulse space-y-1 p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg p-3">
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-200" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-4 w-28 rounded bg-gray-200" />
                        <div className="h-3 w-12 rounded bg-gray-100" />
                      </div>
                      <div className="h-3 w-3/4 rounded bg-gray-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                <p className="mb-1 font-medium">Error</p>
                <p className="text-sm">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-3 rounded bg-red-100 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-red-200"
                >
                  Try Again
                </button>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <Inbox className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <h3 className="mb-1 text-sm font-medium text-gray-900">No messages</h3>
                <p className="text-sm text-gray-500">
                  {searchTerm
                    ? 'No messages match your search.'
                    : 'Patient messages will appear here.'}
                </p>
              </div>
            ) : (
              filteredMessages.map((message) => (
                <div
                  key={message.id}
                  onClick={() => setSelectedMessage(message)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSelectedMessage(message);
                  }}
                  tabIndex={0}
                  role="button"
                  className={`cursor-pointer border-b p-4 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--brand-primary)] ${
                    selectedMessage?.id === message.id ? 'bg-[var(--brand-primary-light)]' : ''
                  } ${message.unread ? 'bg-blue-50' : ''}`}
                >
                  <div className="mb-1 flex items-start justify-between">
                    <span className="font-medium">{message.patientName}</span>
                    <span className="text-xs text-gray-500">{message.timestamp}</span>
                  </div>
                  <div className="truncate text-sm text-gray-600">
                    {decodeHtmlEntities(message.lastMessage)}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {message.unread && <span className="h-2 w-2 rounded-full bg-blue-600"></span>}
                    {message.priority === 'urgent' && (
                      <span className="rounded bg-red-100 px-2 py-1 text-xs text-red-700">
                        Urgent
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex min-w-0 flex-1 flex-col">
          {selectedMessage ? (
            <>
              {/* Thread Header */}
              <div className="flex items-center justify-between border-b p-4">
                <div>
                  <h3 className="font-semibold">{selectedMessage.patientName}</h3>
                  <p className="text-sm text-gray-500">Patient ID: #{selectedMessage.patientId}</p>
                </div>
                <div className="flex gap-2">
                  <button className="rounded p-2 text-gray-600 hover:bg-gray-100">
                    <Phone className="h-5 w-5" />
                  </button>
                  <button className="rounded p-2 text-gray-600 hover:bg-gray-100">
                    <Video className="h-5 w-5" />
                  </button>
                  <button className="rounded p-2 text-gray-600 hover:bg-gray-100">
                    <Star className="h-5 w-5" />
                  </button>
                  <button className="rounded p-2 text-gray-600 hover:bg-gray-100">
                    <Archive className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
                {chatMessages.length === 0 ? (
                  <div className="py-12 text-center text-gray-500">
                    <MessageSquare className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                    <p className="text-sm">No messages in this conversation yet.</p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`mb-4 flex ${
                        msg.sender === 'provider' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[70%] break-words rounded-lg p-3 ${
                          msg.sender === 'provider'
                            ? 'bg-[var(--brand-primary)] text-white'
                            : 'bg-gray-100 text-gray-900'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {decodeHtmlEntities(msg.content)}
                        </p>
                        <p
                          className={`mt-1 text-xs ${
                            msg.sender === 'provider'
                              ? 'text-[var(--brand-primary)]'
                              : 'text-gray-500'
                          }`}
                        >
                          {msg.timestamp}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="min-w-0 border-t p-4">
                <div className="flex min-w-0 items-end gap-2">
                  <button className="rounded p-2 text-gray-600 hover:bg-gray-100">
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <textarea
                    ref={providerInputRef}
                    value={messageContent}
                    onChange={(e) => {
                      setMessageContent(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Type a message..."
                    rows={1}
                    className="min-w-0 flex-1 resize-none rounded-lg border px-4 py-2 focus:ring-2 focus:ring-[var(--brand-primary)]"
                  />
                  <button
                    onClick={handleSendMessage}
                    className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-white hover:brightness-90"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-400">Shift + Enter for new line</span>
                  <span className="text-gray-300">·</span>
                  <button className="text-sm text-[var(--brand-primary)] hover:text-[var(--brand-primary)]">
                    Quick Reply
                  </button>
                  <button className="text-sm text-[var(--brand-primary)] hover:text-[var(--brand-primary)]">
                    Templates
                  </button>
                  <button className="text-sm text-[var(--brand-primary)] hover:text-[var(--brand-primary)]">
                    Schedule Message
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-gray-500">
              <div className="text-center">
                <MessageSquare className="mx-auto mb-2 h-12 w-12 text-gray-300" />
                <p>Select a message to view conversation</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
