'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Inbox,
  MessagesSquare,
  MessageCircle,
  Phone,
  ArrowUpRight,
  Users,
  Mail as MailIcon,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';
import PatientChatView from '@/components/PatientChatView';
import Link from 'next/link';

interface Conversation {
  id: number;
  patientId: number;
  patientName: string;
  lastMessage: string;
  lastMessageAt: string | null;
  timestamp: string;
  direction: 'INBOUND' | 'OUTBOUND' | null;
  channel: 'WEB' | 'SMS' | 'EMAIL';
  senderType: string | null;
  unread: boolean;
  unreadCount: number;
  totalMessages: number;
  needsResponse: boolean;
}

interface Stats {
  totalConversations: number;
  totalUnread: number;
  activeToday: number;
}

interface SelectedPatient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

type FilterType = 'all' | 'unread' | 'needs_response';

const POLL_INTERVAL = 15_000;

export default function AdminMessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedPatient, setSelectedPatient] = useState<SelectedPatient | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchConversations = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) setLoading(true);

        const params = new URLSearchParams({ filter, limit: '100' });
        if (searchTerm.trim()) params.set('search', searchTerm.trim());

        const res = await apiFetch(`/api/admin/messages/conversations?${params}`);
        if (res.ok) {
          const data = await res.json();
          setConversations(data.conversations || []);
          setStats(data.stats || null);
          setError(null);
        } else if (res.status === 401) {
          setError('Please log in to view messages.');
        } else {
          setError('Failed to load conversations.');
        }
      } catch {
        setError('Failed to load conversations. Please check your connection.');
      } finally {
        setLoading(false);
      }
    },
    [filter, searchTerm],
  );

  useEffect(() => {
    fetchConversations(true);
  }, [fetchConversations]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => fetchConversations(false), POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchConversations]);

  const handleSelectConversation = (conv: Conversation) => {
    const nameParts = conv.patientName.split(' ');
    setSelectedPatient({
      id: conv.patientId,
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      email: '',
    });
    setSelectedConvId(conv.id);
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'SMS':
        return <Phone className="h-3.5 w-3.5 text-green-500" />;
      case 'EMAIL':
        return <MailIcon className="h-3.5 w-3.5 text-orange-500" />;
      default:
        return <MessageCircle className="h-3.5 w-3.5 text-blue-500" />;
    }
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const filteredConversations = conversations.filter((c) =>
    normalizedIncludes(c.patientName, searchTerm),
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Stats Bar */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
              <MessagesSquare className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Patient Messages</h1>
              <p className="text-sm text-gray-500">All patient portal conversations</p>
            </div>
          </div>
          {stats && (
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-xl font-bold text-gray-900">{stats.totalConversations}</p>
                <p className="text-xs text-gray-500">Conversations</p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div className="text-center">
                <p className="text-xl font-bold text-red-600">{stats.totalUnread}</p>
                <p className="text-xs text-gray-500">Unread</p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div className="text-center">
                <p className="text-xl font-bold text-green-600">{stats.activeToday}</p>
                <p className="text-xs text-gray-500">Active Today</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex min-h-0 flex-1">
        {/* Conversation List */}
        <div className="flex w-[380px] flex-shrink-0 flex-col border-r border-gray-200 bg-white">
          {/* Search & Filters */}
          <div className="border-b border-gray-100 p-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search patients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-4 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex gap-1.5">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'unread', label: 'Unread' },
                  { key: 'needs_response', label: 'Needs Reply' },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                  {key === 'unread' && stats && stats.totalUnread > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {stats.totalUnread}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                <p className="mt-3 text-sm text-gray-500">Loading conversations...</p>
              </div>
            ) : error ? (
              <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-700">{error}</p>
                <button
                  onClick={() => fetchConversations(true)}
                  className="mt-2 rounded bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200"
                >
                  Retry
                </button>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-12">
                <Inbox className="mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm font-medium text-gray-700">No conversations</p>
                <p className="mt-1 text-center text-xs text-gray-500">
                  {searchTerm
                    ? 'No patients match your search.'
                    : 'Patient messages will appear here when they reach out.'}
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={conv.patientId}
                  onClick={() => handleSelectConversation(conv)}
                  className={`w-full border-b border-gray-50 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 ${
                    selectedConvId === conv.id ? 'bg-blue-50' : ''
                  } ${conv.unread ? 'bg-blue-50/40' : ''}`}
                >
                  <div className="flex gap-3">
                    <div className="relative flex-shrink-0">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
                          conv.unread
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {getInitials(conv.patientName)}
                      </div>
                      {conv.needsResponse && (
                        <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-orange-500" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span
                          className={`truncate text-sm ${
                            conv.unread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
                          }`}
                        >
                          {conv.patientName}
                        </span>
                        <span className="ml-2 flex-shrink-0 text-xs text-gray-400">
                          {conv.timestamp}
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center gap-1.5">
                        {conv.direction === 'OUTBOUND' && (
                          <span className="flex-shrink-0 text-xs text-gray-400">You:</span>
                        )}
                        <p
                          className={`truncate text-xs ${
                            conv.unread ? 'font-medium text-gray-800' : 'text-gray-500'
                          }`}
                        >
                          {conv.lastMessage}
                        </p>
                      </div>

                      <div className="mt-1.5 flex items-center gap-2">
                        {getChannelIcon(conv.channel)}
                        <span className="text-[10px] text-gray-400">
                          {conv.totalMessages} msg{conv.totalMessages !== 1 ? 's' : ''}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat Thread Panel */}
        <div className="flex min-w-0 flex-1 flex-col bg-white">
          {selectedPatient ? (
            <>
              {/* Patient header with link to profile */}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                    {selectedPatient.firstName.charAt(0)}
                    {selectedPatient.lastName.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">
                      {selectedPatient.firstName} {selectedPatient.lastName}
                    </h2>
                    <p className="text-xs text-gray-500">Patient #{selectedPatient.id}</p>
                  </div>
                </div>
                <Link
                  href={`/admin/patients/${selectedPatient.id}`}
                  className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200"
                >
                  <Users className="h-3.5 w-3.5" />
                  View Profile
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="min-h-0 flex-1">
                <PatientChatView patient={selectedPatient} />
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
                <MessageSquare className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-700">Select a conversation</h3>
              <p className="mt-1 max-w-xs text-sm text-gray-500">
                Choose a patient from the list to view their messages and reply.
              </p>
              {stats && (
                <div className="mt-6 flex gap-4">
                  <div className="rounded-xl border border-gray-200 px-4 py-3 text-center">
                    <p className="text-lg font-bold text-gray-900">{stats.totalConversations}</p>
                    <p className="text-xs text-gray-500">Total</p>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center">
                    <p className="text-lg font-bold text-red-600">{stats.totalUnread}</p>
                    <p className="text-xs text-red-500">Unread</p>
                  </div>
                  <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-center">
                    <p className="text-lg font-bold text-green-600">{stats.activeToday}</p>
                    <p className="text-xs text-green-500">Active Today</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
