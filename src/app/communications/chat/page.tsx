"use client";

import { useState, useEffect } from "react";
import ChatWidget from "@/components/twilio/ChatWidget";
import { Feature } from "@/components/Feature";
import { MessageCircle, Users, Search, Filter, Circle, Star } from "lucide-react";
import { ChatUserType } from "@/lib/integrations/twilio/chatConfig";

// Sample data for demo - using static dates to avoid hydration issues
const baseTime = new Date("2024-11-25T10:00:00Z");
const sampleConversations = [
  {
    id: "conv-001",
    patientId: "pat-001",
    patientName: "John Doe",
    lastMessage: "Thank you for the prescription, doctor.",
    lastMessageTime: new Date(baseTime.getTime() - 1000 * 60 * 5), // 5 minutes ago
    unreadCount: 0,
    online: true,
    priority: false,
  },
  {
    id: "conv-002", 
    patientId: "pat-002",
    patientName: "Jane Smith",
    lastMessage: "When should I take the medication?",
    lastMessageTime: new Date(baseTime.getTime() - 1000 * 60 * 30), // 30 minutes ago
    unreadCount: 2,
    online: true,
    priority: true,
  },
  {
    id: "conv-003",
    patientId: "pat-003",
    patientName: "Robert Johnson",
    lastMessage: "My symptoms have improved, thanks!",
    lastMessageTime: new Date(baseTime.getTime() - 1000 * 60 * 60 * 2), // 2 hours ago
    unreadCount: 0,
    online: false,
    priority: false,
  },
  {
    id: "conv-004",
    patientId: "pat-004",
    patientName: "Emily Davis",
    lastMessage: "Is it normal to feel dizzy?",
    lastMessageTime: new Date(baseTime.getTime() - 1000 * 60 * 60 * 24), // 1 day ago
    unreadCount: 1,
    online: false,
    priority: true,
  },
];

export default function ChatManagementPage() {
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPriority, setFilterPriority] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);

  // Filter conversations based on search and filters
  const filteredConversations = sampleConversations.filter((conv: any) => {
    const matchesSearch = conv.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageCircle className="h-8 w-8 text-blue-600" />
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Chat Management Center</h1>
                  <p className="text-gray-600 mt-1">
                    Real-time messaging with patients and healthcare providers
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Circle className="h-3 w-3 text-green-500 fill-green-500" />
                  <span>Online</span>
                </div>
                <div className="bg-red-100 text-red-700 px-3 py-1 rounded-full">
                  {totalUnread} unread
                </div>
              </div>
            </div>
          </div>

          <Feature
            feature="TWILIO_CHAT"
            fallback={
              <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                <MessageCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h2 className="text-2xl font-semibold mb-2">Chat Coming Soon</h2>
                <p className="text-gray-600 mb-8 max-w-md mx-auto">
                  Real-time messaging between patients and providers will be available soon.
                </p>
                
                <div className="grid md:grid-cols-3 gap-6 text-left max-w-3xl mx-auto mt-8">
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-2">Instant Messaging</h3>
                    <p className="text-sm text-gray-600">
                      Real-time chat with typing indicators and read receipts
                    </p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-2">📎 File Sharing</h3>
                    <p className="text-sm text-gray-600">
                      Share medical documents, images, and prescriptions
                    </p>
                  </div>
                  <div className="border rounded-lg p-4">
                    <h3 className="font-semibold mb-2">🔔 Smart Notifications</h3>
                    <p className="text-sm text-gray-600">
                      Push notifications for urgent messages
                    </p>
                  </div>
                </div>
              </div>
            }
          >
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Conversations List */}
              <div className="lg:col-span-1 bg-white rounded-lg shadow-sm">
                <div className="p-4 border-b">
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e: any) => setSearchTerm(e.target.value)}
                      placeholder="Search conversations..."
                      className="w-full pl-10 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFilterPriority(!filterPriority)}
                      className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-sm transition-colors ${
                        filterPriority 
                          ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      <Star className="h-3 w-3" />
                      Priority
                    </button>
                    <button
                      onClick={() => setFilterUnread(!filterUnread)}
                      className={`flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded text-sm transition-colors ${
                        filterUnread
                          ? 'bg-blue-100 text-blue-700 border border-blue-300'
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
                    <div className="p-8 text-center text-gray-500">
                      No conversations found
                    </div>
                  ) : (
                    filteredConversations.map((conv: any) => (
                      <div
                        key={conv.id}
                        onClick={() => setSelectedConversation(conv)}
                        className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                          selectedConversation?.id === conv.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="relative">
                              <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold">
                                {conv.patientName.split(' ').map((n: any) => n[0]).join('')}
                              </div>
                              {conv.online && (
                                <Circle className="absolute bottom-0 right-0 h-3 w-3 text-green-400 fill-green-400" />
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium flex items-center gap-2">
                                {conv.patientName}
                                {conv.priority && (
                                  <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                                )}
                              </h4>
                              <p className="text-sm text-gray-600 line-clamp-1">
                                {conv.lastMessage}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{formatTime(conv.lastMessageTime)}</span>
                          {conv.unreadCount > 0 && (
                            <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full">
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
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="mb-4">
                      <h2 className="text-xl font-semibold">
                        Chat with {selectedConversation.patientName}
                      </h2>
                      <p className="text-sm text-gray-600">
                        Patient ID: {selectedConversation.patientId}
                      </p>
                    </div>
                    
                    {/* Embedded Chat Widget */}
                    <div className="border rounded-lg p-4 bg-gray-50">
                      <ChatWidget
                        userId="provider-001"
                        userName="Dr. Smith"
                        userType={ChatUserType.PROVIDER}
                        recipientId={selectedConversation.patientId}
                        recipientName={selectedConversation.patientName}
                        conversationId={selectedConversation.id}
                      />
                      
                      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          <strong>Demo Mode:</strong> This is a demonstration of the chat interface. 
                          In production, this would connect to real Twilio Conversations.
                        </p>
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="mt-6 grid grid-cols-3 gap-4">
                      <button className="p-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm">
                        📋 View Patient Record
                      </button>
                      <button className="p-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm">
                        💊 Send Prescription
                      </button>
                      <button className="p-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-sm">
                        📅 Schedule Appointment
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow-sm h-full min-h-[600px] flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <MessageCircle className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg">Select a conversation to start chatting</p>
                      <p className="text-sm mt-2">Choose from the list on the left</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Statistics */}
            <div className="mt-6 grid grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="text-2xl font-bold text-blue-600">247</div>
                <div className="text-sm text-gray-600">Total Conversations</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="text-2xl font-bold text-green-600">12</div>
                <div className="text-sm text-gray-600">Active Now</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-4">
                <div className="text-2xl font-bold text-yellow-600">3.2min</div>
                <div className="text-sm text-gray-600">Avg Response Time</div>
              </div>
              <div className="bg-white rounded-lg shadow-sm p-4">
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
