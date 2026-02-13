'use client';

import { useState, useEffect } from 'react';
import ChatWidget from '@/components/twilio/ChatWidget';
import { Feature } from '@/components/Feature';
import { MessageCircle, Users, Search, Filter, Circle, Star } from 'lucide-react';
import { ChatUserType } from '@/lib/integrations/twilio/chatConfig';

// Sample data for demo - using static dates to avoid hydration issues
const baseTime = new Date('2024-11-25T10:00:00Z');
const sampleConversations = [
  {
    id: 'conv-001',
    patientId: 'pat-001',
    patientName: 'John Doe',
    lastMessage: 'Thank you for the prescription, doctor.',
    lastMessageTime: new Date(baseTime.getTime() - 1000 * 60 * 5), // 5 minutes ago
    unreadCount: 0,
    online: true,
    priority: false,
  },
  {
    id: 'conv-002',
    patientId: 'pat-002',
    patientName: 'Jane Smith',
    lastMessage: 'When should I take the medication?',
    lastMessageTime: new Date(baseTime.getTime() - 1000 * 60 * 30), // 30 minutes ago
    unreadCount: 2,
    online: true,
    priority: true,
  },
  {
    id: 'conv-003',
    patientId: 'pat-003',
    patientName: 'Robert Johnson',
    lastMessage: 'My symptoms have improved, thanks!',
    lastMessageTime: new Date(baseTime.getTime() - 1000 * 60 * 60 * 2), // 2 hours ago
    unreadCount: 0,
    online: false,
    priority: false,
  },
  {
    id: 'conv-004',
    patientId: 'pat-004',
    patientName: 'Emily Davis',
    lastMessage: 'Is it normal to feel dizzy?',
    lastMessageTime: new Date(baseTime.getTime() - 1000 * 60 * 60 * 24), // 1 day ago
    unreadCount: 1,
    online: false,
    priority: true,
  },
];

export default function ChatManagementPage() {
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPriority, setFilterPriority] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);

  // Filter conversations based on search and filters
  const filteredConversations = sampleConversations.filter((conv: any) => {
    const matchesSearch =
      conv.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.lastMessage.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = !filterPriority || conv.priority;
    const matchesUnread = !filterUnread || conv.unreadCount > 0;

    return matchesSearch && matchesPriority && matchesUnread;
  });

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const totalUnread = sampleConversations.reduce((sum, conv) => sum + conv.unreadCount, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 rounded-lg bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageCircle className="h-8 w-8 text-blue-600" />
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Chat Management Center</h1>
                  <p className="mt-1 text-gray-600">
                    Real-time messaging with patients and healthcare providers
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Circle className="h-3 w-3 fill-green-500 text-green-500" />
                  <span>Online</span>
                </div>
                <div className="rounded-full bg-red-100 px-3 py-1 text-red-700">
                  {totalUnread} unread
                </div>
              </div>
            </div>
          </div>

          <Feature
            feature="TWILIO_CHAT"
            fallback={
              <div className="rounded-lg bg-white p-12 text-center shadow-sm">
                <MessageCircle className="mx-auto mb-4 h-16 w-16 text-gray-400" />
                <h2 className="mb-2 text-2xl font-semibold">Chat Coming Soon</h2>
                <p className="mx-auto mb-8 max-w-md text-gray-600">
                  Real-time messaging between patients and providers will be available soon.
                </p>

                <div className="mx-auto mt-8 grid max-w-3xl gap-6 text-left md:grid-cols-3">
                  <div className="rounded-lg border p-4">
                    <h3 className="mb-2 font-semibold">Instant Messaging</h3>
                    <p className="text-sm text-gray-600">
                      Real-time chat with typing indicators and read receipts
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <h3 className="mb-2 font-semibold">📎 File Sharing</h3>
                    <p className="text-sm text-gray-600">
                      Share medical documents, images, and prescriptions
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <h3 className="mb-2 font-semibold">🔔 Smart Notifications</h3>
                    <p className="text-sm text-gray-600">Push notifications for urgent messages</p>
                  </div>
                </div>
              </div>
            }
          >
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Conversations List */}
              <div className="rounded-lg bg-white shadow-sm lg:col-span-1">
                <div className="border-b p-4">
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e: any) => setSearchTerm(e.target.value)}
                      placeholder="Search conversations..."
                      className="w-full rounded-lg border py-2 pl-10 pr-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFilterPriority(!filterPriority)}
                      className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-sm transition-colors ${
                        filterPriority
                          ? 'border border-yellow-300 bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <Star className="h-3 w-3" />
                      Priority
                    </button>
                    <button
                      onClick={() => setFilterUnread(!filterUnread)}
                      className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-sm transition-colors ${
                        filterUnread
                          ? 'border border-blue-300 bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <Filter className="h-3 w-3" />
                      Unread
                    </button>
                  </div>
                </div>

                <div className="max-h-[600px] overflow-y-auto">
                  {filteredConversations.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No conversations found</div>
                  ) : (
                    filteredConversations.map((conv: any) => (
                      <div
                        key={conv.id}
                        onClick={() => setSelectedConversation(conv)}
                        className={`cursor-pointer border-b p-4 transition-colors hover:bg-gray-50 ${
                          selectedConversation?.id === conv.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600">
                                {conv.patientName
                                  .split(' ')
                                  .map((n: any) => n[0])
                                  .join('')}
                              </div>
                              {conv.online && (
                                <Circle className="absolute bottom-0 right-0 h-3 w-3 fill-green-400 text-green-400" />
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className="flex items-center gap-2 font-medium">
                                {conv.patientName}
                                {conv.priority && (
                                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                )}
                              </h4>
                              <p className="line-clamp-1 text-sm text-gray-600">
                                {conv.lastMessage}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{formatTime(conv.lastMessageTime)}</span>
                          {conv.unreadCount > 0 && (
                            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-white">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Chat Area */}
              <div className="lg:col-span-2">
                {selectedConversation ? (
                  <div className="rounded-lg bg-white p-6 shadow-sm">
                    <div className="mb-4">
                      <h2 className="text-xl font-semibold">
                        Chat with {selectedConversation.patientName}
                      </h2>
                      <p className="text-sm text-gray-600">
                        Patient ID: {selectedConversation.patientId}
                      </p>
                    </div>

                    {/* Embedded Chat Widget */}
                    <div className="rounded-lg border bg-gray-50 p-4">
                      <ChatWidget
                        userId="provider-001"
                        userName="Dr. Smith"
                        userType={ChatUserType.PROVIDER}
                        recipientId={selectedConversation.patientId}
                        recipientName={selectedConversation.patientName}
                        conversationId={selectedConversation.id}
                      />

                      <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                        <p className="text-sm text-yellow-800">
                          <strong>Demo Mode:</strong> This is a demonstration of the chat interface.
                          In production, this would connect to real Twilio Conversations.
                        </p>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="mt-6 grid grid-cols-3 gap-4">
                      <button className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700 transition-colors hover:bg-blue-100">
                        📋 View Patient Record
                      </button>
                      <button className="rounded-lg bg-green-50 p-3 text-sm text-green-700 transition-colors hover:bg-green-100">
                        💊 Send Prescription
                      </button>
                      <button className="rounded-lg bg-purple-50 p-3 text-sm text-purple-700 transition-colors hover:bg-purple-100">
                        📅 Schedule Appointment
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[600px] items-center justify-center rounded-lg bg-white shadow-sm">
                    <div className="text-center text-gray-500">
                      <MessageCircle className="mx-auto mb-4 h-16 w-16 text-gray-300" />
                      <p className="text-lg">Select a conversation to start chatting</p>
                      <p className="mt-2 text-sm">Choose from the list on the left</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Statistics */}
            <div className="mt-6 grid grid-cols-4 gap-4">
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <div className="text-2xl font-bold text-blue-600">247</div>
                <div className="text-sm text-gray-600">Total Conversations</div>
              </div>
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <div className="text-2xl font-bold text-green-600">12</div>
                <div className="text-sm text-gray-600">Active Now</div>
              </div>
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <div className="text-2xl font-bold text-yellow-600">3.2min</div>
                <div className="text-sm text-gray-600">Avg Response Time</div>
              </div>
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <div className="text-2xl font-bold text-purple-600">98%</div>
                <div className="text-sm text-gray-600">Satisfaction Rate</div>
              </div>
            </div>
          </Feature>
        </div>
      </div>
    </div>
  );
}
