"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Search, Send, Paperclip, Phone, Video, Star, Archive, Plus, Inbox } from "lucide-react";

interface Message {
  id: number;
  patientId: number;
  patientName: string;
  lastMessage: string;
  timestamp: string;
  unread: boolean;
  priority: "normal" | "urgent";
}

interface ChatMessage {
  id: number;
  sender: "provider" | "patient";
  content: string;
  timestamp: string;
}

export default function ProviderMessagesPage() {
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "urgent">("all");
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch conversations from API
  useEffect(() => {
    async function fetchMessages() {
      try {
        setLoading(true);
        const token = localStorage.getItem('token') || 
                      localStorage.getItem('auth-token') || 
                      localStorage.getItem('provider-token');
        
        const response = await fetch('/api/messages/conversations', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          setMessages(data.conversations || []);
        } else {
          setMessages([]);
        }
      } catch (err) {
        console.error('Failed to fetch messages:', err);
        setMessages([]);
      } finally {
        setLoading(false);
      }
    }
    
    fetchMessages();
  }, []);

  // Fetch chat thread when conversation selected
  useEffect(() => {
    if (!selectedMessage) {
      setChatMessages([]);
      return;
    }

    async function fetchThread() {
      try {
        const token = localStorage.getItem('token') || 
                      localStorage.getItem('auth-token') || 
                      localStorage.getItem('provider-token');
        
        const response = await fetch(`/api/messages/conversations/${selectedMessage?.patientId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          setChatMessages(data.messages || []);
        } else {
          setChatMessages([]);
        }
      } catch (err) {
        console.error('Failed to fetch thread:', err);
        setChatMessages([]);
      }
    }
    
    fetchThread();
  }, [selectedMessage]);

  const filteredMessages = messages.filter(msg => {
    const matchesSearch = msg.patientName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = 
      filter === "all" || 
      (filter === "unread" && msg.unread) ||
      (filter === "urgent" && msg.priority === "urgent");
    return matchesSearch && matchesFilter;
  });

  const handleSendMessage = async () => {
    if (!messageContent.trim() || !selectedMessage) return;
    
    try {
      const token = localStorage.getItem('token') || 
                    localStorage.getItem('auth-token') || 
                    localStorage.getItem('provider-token');
      
      await fetch(`/api/messages/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          patientId: selectedMessage.patientId,
          content: messageContent,
        }),
      });
      
      setMessageContent("");
      // Refresh thread
      // ... would refetch here
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  const unreadCount = messages.filter(m => m.unread).length;

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
                Unread ({unreadCount})
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
            {loading ? (
              <div className="text-center py-8 text-gray-500">
                <div className="animate-spin h-6 w-6 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-2"></div>
                Loading messages...
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="text-center py-12 px-4">
                <Inbox className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <h3 className="text-sm font-medium text-gray-900 mb-1">No messages</h3>
                <p className="text-sm text-gray-500">
                  {searchTerm ? "No messages match your search." : "Patient messages will appear here."}
                </p>
              </div>
            ) : (
              filteredMessages.map((message) => (
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
              ))
            )}
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
                  <p className="text-sm text-gray-500">Patient ID: #{selectedMessage.patientId}</p>
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
                {chatMessages.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No messages in this conversation yet.</p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
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
                  ))
                )}
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
