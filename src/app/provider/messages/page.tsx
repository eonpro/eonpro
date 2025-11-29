"use client";

import { useState } from "react";
import { MessageSquare, Search, Send, Paperclip, Phone, Video, Star, Archive } from "lucide-react";

interface Message {
  id: string;
  patientName: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
  priority: "normal" | "urgent";
  avatar?: string;
}

interface MessageThread {
  id: string;
  messages: {
    id: string;
    sender: "provider" | "patient";
    content: string;
    timestamp: string;
  }[];
}

export default function ProviderMessagesPage() {
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "urgent">("all");

  // Mock messages
  const messages: Message[] = [
    {
      id: "1",
      patientName: "Sarah Johnson",
      lastMessage: "Thank you for the prescription refill, Doctor.",
      timestamp: "10 min ago",
      unread: true,
      priority: "normal"
    },
    {
      id: "2",
      patientName: "Michael Chen",
      lastMessage: "I'm experiencing chest pain again. Should I come in?",
      timestamp: "1 hour ago",
      unread: true,
      priority: "urgent"
    },
    {
      id: "3",
      patientName: "Emily Davis",
      lastMessage: "The new anxiety medication is working well.",
      timestamp: "3 hours ago",
      unread: false,
      priority: "normal"
    },
    {
      id: "4",
      patientName: "James Wilson",
      lastMessage: "Can we schedule a follow-up for my diabetes?",
      timestamp: "Yesterday",
      unread: false,
      priority: "normal"
    },
    {
      id: "5",
      patientName: "Lisa Anderson",
      lastMessage: "Lab results received. Everything looks good!",
      timestamp: "2 days ago",
      unread: false,
      priority: "normal"
    }
  ];

  // Mock thread for selected message
  const messageThreads: { [key: string]: MessageThread } = {
    "1": {
      id: "1",
      messages: [
        { id: "1-1", sender: "patient", content: "Hi Doctor, my prescription is running low.", timestamp: "2 hours ago" },
        { id: "1-2", sender: "provider", content: "I'll send a refill to your pharmacy right away.", timestamp: "1 hour ago" },
        { id: "1-3", sender: "patient", content: "Thank you for the prescription refill, Doctor.", timestamp: "10 min ago" }
      ]
    },
    "2": {
      id: "2",
      messages: [
        { id: "2-1", sender: "patient", content: "I'm experiencing chest pain again. Should I come in?", timestamp: "1 hour ago" }
      ]
    }
  };

  const filteredMessages = messages.filter(msg => {
    const matchesSearch = msg.patientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = 
      filter === "all" || 
      (filter === "unread" && msg.unread) ||
      (filter === "urgent" && msg.priority === "urgent");
    return matchesSearch && matchesFilter;
  });

  const handleSendMessage = () => {
    if (messageContent.trim()) {
      // Handle sending message
      setMessageContent("");
    }
  };

  return (
    <div className="h-[calc(100vh-12rem)]">
      <div className="bg-white rounded-lg shadow h-full flex">
        {/* Messages List */}
        <div className="w-1/3 border-r flex flex-col">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold mb-3">Messages</h2>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search patients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-1 text-sm rounded ${
                  filter === "all" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter("unread")}
                className={`px-3 py-1 text-sm rounded ${
                  filter === "unread" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                Unread ({messages.filter(m => m.unread).length})
              </button>
              <button
                onClick={() => setFilter("urgent")}
                className={`px-3 py-1 text-sm rounded ${
                  filter === "urgent" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                Urgent
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredMessages.map((message) => (
              <div
                key={message.id}
                onClick={() => setSelectedMessage(message)}
                className={`p-4 border-b hover:bg-gray-50 cursor-pointer ${
                  selectedMessage?.id === message.id ? "bg-indigo-50" : ""
                } ${message.unread ? "bg-blue-50" : ""}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium">{message.patientName}</span>
                  <span className="text-xs text-gray-500">{message.timestamp}</span>
                </div>
                <div className="text-sm text-gray-600 truncate">{message.lastMessage}</div>
                <div className="flex items-center gap-2 mt-2">
                  {message.unread && (
                    <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                  )}
                  {message.priority === "urgent" && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">Urgent</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 flex flex-col">
          {selectedMessage ? (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b flex justify-between items-center">
                <div>
                  <h3 className="font-semibold">{selectedMessage.patientName}</h3>
                  <p className="text-sm text-gray-500">Patient ID: #12345</p>
                </div>
                <div className="flex gap-2">
                  <button className="p-2 text-gray-600 hover:bg-gray-100 rounded">
                    <Phone className="h-5 w-5" />
                  </button>
                  <button className="p-2 text-gray-600 hover:bg-gray-100 rounded">
                    <Video className="h-5 w-5" />
                  </button>
                  <button className="p-2 text-gray-600 hover:bg-gray-100 rounded">
                    <Star className="h-5 w-5" />
                  </button>
                  <button className="p-2 text-gray-600 hover:bg-gray-100 rounded">
                    <Archive className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 p-4 overflow-y-auto">
                {messageThreads[selectedMessage.id]?.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`mb-4 flex ${
                      msg.sender === "provider" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[70%] p-3 rounded-lg ${
                        msg.sender === "provider"
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                    >
                      <p>{msg.content}</p>
                      <p className={`text-xs mt-1 ${
                        msg.sender === "provider" ? "text-indigo-200" : "text-gray-500"
                      }`}>
                        {msg.timestamp}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Message Input */}
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <button className="p-2 text-gray-600 hover:bg-gray-100 rounded">
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <input
                    type="text"
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleSendMessage}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  <button className="text-sm text-indigo-600 hover:text-indigo-700">
                    Quick Reply
                  </button>
                  <button className="text-sm text-indigo-600 hover:text-indigo-700">
                    Templates
                  </button>
                  <button className="text-sm text-indigo-600 hover:text-indigo-700">
                    Schedule Message
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>Select a message to view conversation</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
