'use client';

import { useState } from 'react';
import {
  MessageSquare,
  Send,
  Paperclip,
  MoreVertical,
  Phone,
  Video,
  Search,
  Circle,
} from 'lucide-react';
import { normalizedIncludes } from '@/lib/utils/search';

interface Chat {
  id: string;
  customer: {
    name: string;
    email: string;
    status: 'online' | 'offline' | 'away';
  };
  lastMessage: string;
  timestamp: string;
  unread: number;
  priority: 'low' | 'medium' | 'high';
}

interface Message {
  id: string;
  sender: 'customer' | 'support';
  content: string;
  timestamp: string;
}

const mockChats: Chat[] = [
  {
    id: '1',
    customer: {
      name: 'John Smith',
      email: 'john.smith@example.com',
      status: 'online',
    },
    lastMessage: 'I need help with my appointment',
    timestamp: '5 mins ago',
    unread: 2,
    priority: 'high',
  },
  {
    id: '2',
    customer: {
      name: 'Sarah Johnson',
      email: 'sarah.j@example.com',
      status: 'away',
    },
    lastMessage: 'Thank you for your help!',
    timestamp: '15 mins ago',
    unread: 0,
    priority: 'low',
  },
  {
    id: '3',
    customer: {
      name: 'Michael Brown',
      email: 'mbrown@example.com',
      status: 'offline',
    },
    lastMessage: 'When will my prescription be ready?',
    timestamp: '1 hour ago',
    unread: 1,
    priority: 'medium',
  },
];

const mockMessages: Message[] = [
  {
    id: '1',
    sender: 'customer',
    content: 'Hi, I need help with scheduling an appointment',
    timestamp: '10:30 AM',
  },
  {
    id: '2',
    sender: 'support',
    content:
      "Hello! I'd be happy to help you schedule an appointment. What type of appointment are you looking for?",
    timestamp: '10:32 AM',
  },
  {
    id: '3',
    sender: 'customer',
    content: 'I need to see a general practitioner for my annual check-up',
    timestamp: '10:33 AM',
  },
  {
    id: '4',
    sender: 'support',
    content:
      'Perfect! I can see we have several slots available this week. Would you prefer morning or afternoon appointments?',
    timestamp: '10:34 AM',
  },
  {
    id: '5',
    sender: 'customer',
    content: 'Morning would be better for me, preferably before 11 AM',
    timestamp: '10:35 AM',
  },
];

export default function SupportChatPage() {
  const [selectedChat, setSelectedChat] = useState<Chat | null>(mockChats[0]);
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChats = mockChats.filter(
    (chat) =>
      normalizedIncludes(chat.customer.name || '', searchQuery) ||
      normalizedIncludes(chat.customer.email || '', searchQuery)
  );

  const handleSendMessage = () => {
    if (newMessage.trim() && selectedChat) {
      const message: Message = {
        id: String(messages.length + 1),
        sender: 'support',
        content: newMessage,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([...messages, message]);
      setNewMessage('');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-500';
      case 'away':
        return 'text-yellow-500';
      case 'offline':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex h-[calc(100vh-200px)] gap-6">
      {/* Chat List */}
      <div className="flex w-1/3 flex-col rounded-lg bg-white shadow">
        <div className="border-b p-4">
          <h2 className="mb-4 text-lg font-semibold">Support Chats</h2>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => setSelectedChat(chat)}
              className={`w-full border-b p-4 text-left transition-colors hover:bg-gray-50 ${
                selectedChat?.id === chat.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="mb-2 flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-900">{chat.customer.name}</h3>
                  <Circle
                    className={`h-2 w-2 fill-current ${getStatusColor(chat.customer.status)}`}
                  />
                </div>
                {chat.unread > 0 && (
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                    {chat.unread}
                  </span>
                )}
              </div>
              <p className="mb-1 truncate text-sm text-gray-600">{chat.lastMessage}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{chat.timestamp}</span>
                <span className={`rounded px-2 py-0.5 text-xs ${getPriorityColor(chat.priority)}`}>
                  {chat.priority}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Window */}
      {selectedChat ? (
        <div className="flex flex-1 flex-col rounded-lg bg-white shadow">
          {/* Chat Header */}
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <h2 className="font-semibold text-gray-900">{selectedChat.customer.name}</h2>
              <p className="text-sm text-gray-600">{selectedChat.customer.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-lg p-2 transition-colors hover:bg-gray-100">
                <Phone className="h-5 w-5 text-gray-600" />
              </button>
              <button className="rounded-lg p-2 transition-colors hover:bg-gray-100">
                <Video className="h-5 w-5 text-gray-600" />
              </button>
              <button className="rounded-lg p-2 transition-colors hover:bg-gray-100">
                <MoreVertical className="h-5 w-5 text-gray-600" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'support' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs rounded-lg px-4 py-2 md:max-w-md ${
                    message.sender === 'support'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  <p
                    className={`mt-1 text-xs ${
                      message.sender === 'support' ? 'text-blue-100' : 'text-gray-500'
                    }`}
                  >
                    {message.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Message Input */}
          <div className="border-t p-4">
            <div className="flex items-center gap-2">
              <button className="rounded-lg p-2 transition-colors hover:bg-gray-100">
                <Paperclip className="h-5 w-5 text-gray-600" />
              </button>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type a message..."
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSendMessage}
                className="rounded-lg bg-blue-600 p-2 text-white transition-colors hover:bg-blue-700"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-lg bg-white shadow">
          <div className="text-center">
            <MessageSquare className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <p className="text-gray-500">Select a chat to start messaging</p>
          </div>
        </div>
      )}
    </div>
  );
}
