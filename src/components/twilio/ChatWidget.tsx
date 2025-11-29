"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { isFeatureEnabled } from "@/lib/features";
import { ChatClientManager, mockChatService } from "@/lib/integrations/twilio/chatService";
import { logger } from '@/lib/logger';
import {
  CHAT_CONFIG, 
  SYSTEM_MESSAGES, 
  PROVIDER_QUICK_RESPONSES,
  PATIENT_QUICK_RESPONSES,
  ChatUserType 
} from "@/lib/integrations/twilio/chatConfig";
import { Patient, Provider, Order } from '@/types/models';
import { 
  MessageCircle, 
  Send, 
  Paperclip, 
  X, 
  ChevronDown,
  Circle,
  CheckCheck,
  Image,
  File,
  Clock
} from "lucide-react";

interface ChatWidgetProps {
  userId: string;
  userName: string;
  userType?: ChatUserType;
  recipientId?: string;
  recipientName?: string;
  conversationId?: string;
}

interface Message {
  id: string;
  text: string;
  author: string;
  authorName: string;
  timestamp: Date;
  isOwn: boolean;
  type: 'text' | 'file' | 'image' | 'system';
  read?: boolean;
  fileUrl?: string;
  fileName?: string;
}

export default function ChatWidget({
  userId,
  userName,
  userType = ChatUserType.PATIENT,
  recipientId,
  recipientName = "Healthcare Provider",
  conversationId,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [recipientTyping, setRecipientTyping] = useState(false);
  const [recipientOnline, setRecipientOnline] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showQuickResponses, setShowQuickResponses] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatManagerRef = useRef<ChatClientManager | null>(null);
  const conversationRef = useRef<any>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if feature is enabled
  const isEnabled = isFeatureEnabled("TWILIO_CHAT");
  const useMock = !isEnabled || process.env.TWILIO_USE_MOCK === 'true';

  // Initialize chat
  useEffect(() => {
    if (!isOpen || !isEnabled) return;

    initializeChat();

    return () => {
      if (chatManagerRef.current) {
        chatManagerRef.current.disconnect();
      }
    };
  }, [isOpen, isEnabled]);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const initializeChat = async () => {
    setIsConnecting(true);

    try {
      if (useMock) {
        // Use mock service
        logger.debug('[CHAT] Using mock service');
        
        // Create mock conversation
        const mockConversation = await mockChatService.createConversation(
          conversationId || `${userId}-${recipientId}`, `Chat with ${recipientName}`);
        
        conversationRef.current = mockConversation;
        
        // Add welcome message
        const welcomeMsg: Message = {
          id: 'welcome',
          text: SYSTEM_MESSAGES.WELCOME(userName),
          author: 'system',
          authorName: 'System',
          timestamp: new Date(),
          isOwn: false,
          type: 'system',
        };
        setMessages([welcomeMsg]);
      } else {
        // Check if we should use mock based on token response
        const tokenResponse = await fetchChatToken();
        if (!tokenResponse) throw new Error('Failed to get chat token');

        if (tokenResponse.mock || tokenResponse.token?.startsWith('mock.')) {
          // Use mock service even if feature is enabled (configuration incomplete)
          logger.debug('[CHAT] Using mock service (configuration incomplete)');
          
          // Create mock conversation
          const mockConversation = await mockChatService.createConversation(
            conversationId || `${userId}-${recipientId}`, `Chat with ${recipientName}`);
          
          conversationRef.current = mockConversation;
          
          // Add welcome message
          const welcomeMsg: Message = {
            id: 'welcome',
            text: SYSTEM_MESSAGES.WELCOME(userName),
            author: 'system',
            authorName: 'System',
            timestamp: new Date(),
            isOwn: false,
            type: 'system',
          };
          setMessages([welcomeMsg]);
        } else {
          // Initialize real Twilio chat
          const chatManager = new ChatClientManager(userId, userType);
          await chatManager.initialize(tokenResponse.token);
          
          const conversation = await chatManager.getOrCreateConversation(
            conversationId || `${userId}-${recipientId}`,
            `Chat with ${recipientName}`,
            { userType, recipientId }
          );

          chatManagerRef.current = chatManager;
          conversationRef.current = conversation;

          // Load message history
          const history = await chatManager.getMessages(conversation);
          const formattedMessages = history.map((msg: any) => ({
            id: msg.sid,
            text: msg.body,
            author: msg.author,
            authorName: msg.author === userId ? userName : recipientName,
            timestamp: msg.dateCreated,
            isOwn: msg.author === userId,
            type: msg.attributes?.type || 'text',
            read: msg.index <= conversation.lastReadMessageIndex,
          }));
          setMessages(formattedMessages);

          // Setup event listeners
          chatManager.onMessage((message: any) => {
            const newMessage: Message = {
              id: message.sid,
              text: message.body,
              author: message.author,
              authorName: message.author === userId ? userName : recipientName,
              timestamp: message.dateCreated,
              isOwn: message.author === userId,
              type: message.attributes?.type || 'text',
            };
            setMessages(prev => [...prev, newMessage]);
          });

          chatManager.onTyping((participant: any, typing: boolean) => {
            if (participant.identity !== userId) {
              setRecipientTyping(typing);
            }
          });

          chatManager.onPresence((participant: any, status: string) => {
            if (participant.identity === recipientId) {
              setRecipientOnline(status === 'online');
            }
          });
        }
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('[CHAT] Initialization failed:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const fetchChatToken = async (): Promise<any> => {
    try {
      const response = await fetch('/api/v2/twilio/chat/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          identity: userId, 
          userType 
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return data; // Return full response object
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('[CHAT] Failed to fetch token:', error);
    }
    return null;
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const messageText = inputText;
    setInputText("");

    try {
      if (useMock) {
        // Send via mock service
        const mockMessage = await mockChatService.sendMessage(
          conversationRef.current?.uniqueName || '',
          messageText,
          userId
        );

        const newMessage: Message = {
          id: mockMessage.sid,
          text: mockMessage.body,
          author: userId,
          authorName: userName,
          timestamp: mockMessage.timestamp,
          isOwn: true,
          type: 'text',
        };
        setMessages(prev => [...prev, newMessage]);
      } else {
        // Send via Twilio
        if (chatManagerRef.current && conversationRef.current) {
          await chatManagerRef.current.sendMessage(
            conversationRef.current,
            messageText,
            { type: 'text', timestamp: new Date().toISOString() }
          );
        }
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('[CHAT] Failed to send message:', error);
      setInputText(messageText); // Restore message on error
    }
  };

  const handleTyping = () => {
    if (!CHAT_CONFIG.ENABLE_TYPING_INDICATORS) return;

    if (!isTyping) {
      setIsTyping(true);
      if (chatManagerRef.current && conversationRef.current) {
        chatManagerRef.current.sendTyping(conversationRef.current);
      }
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, CHAT_CONFIG.TYPING_INDICATOR_TIMEOUT);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    if (file.size > CHAT_CONFIG.MAX_FILE_SIZE) {
      alert(`File size exceeds ${CHAT_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB limit`);
      return;
    }

    if (!CHAT_CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
      alert('File type not allowed');
      return;
    }

    try {
      if (chatManagerRef.current && conversationRef.current) {
        await chatManagerRef.current.sendFile(conversationRef.current, file);
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('[CHAT] Failed to send file:', error);
    }
  };

  const quickResponses = userType === ChatUserType.PROVIDER 
    ? PROVIDER_QUICK_RESPONSES 
    : PATIENT_QUICK_RESPONSES;

  if (!isEnabled) {
    return null; // Don't show widget if feature is disabled
  }

  return (
    <>
      {/* Chat Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 transition-all z-40"
        >
          <MessageCircle className="h-6 w-6" />
          {messages.filter((m: any) => !m.read && !m.isOwn).length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {messages.filter((m: any) => !m.read && !m.isOwn).length}
            </span>
          )}
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 w-96 h-[600px] bg-white rounded-lg shadow-2xl flex flex-col z-50">
          {/* Header */}
          <div className="bg-blue-600 text-white p-4 rounded-t-lg flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 bg-white text-blue-600 rounded-full flex items-center justify-center font-semibold">
                  {recipientName.charAt(0).toUpperCase()}
                </div>
                {recipientOnline && (
                  <Circle className="absolute bottom-0 right-0 h-3 w-3 text-green-400 fill-green-400" />
                )}
              </div>
              <div>
                <h3 className="font-semibold">{recipientName}</h3>
                <p className="text-xs opacity-90">
                  {recipientTyping ? 'Typing...' : recipientOnline ? 'Online' : 'Offline'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="hover:bg-blue-700 rounded p-1 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {isConnecting ? (
              <div className="text-center text-gray-500 py-8">
                Connecting to chat...
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No messages yet. Start the conversation!
              </div>
            ) : (
              messages.map((message: any) => (
                <div
                  key={message.id}
                  className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  {message.type === 'system' ? (
                    <div className="text-center text-xs text-gray-500 italic py-2 px-4">
                      {message.text}
                    </div>
                  ) : (
                    <div
                      className={`max-w-[70%] rounded-lg px-4 py-2 ${
                        message.isOwn
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-200'
                      }`}
                    >
                      {message.type === 'image' && message.fileUrl && (
                        <img 
                          src={message.fileUrl} 
                          alt={message.fileName} 
                          className="max-w-full rounded mb-2"
                        />
                      )}
                      {message.type === 'file' && (
                        <div className="flex items-center gap-2 mb-2">
                          <File className="h-4 w-4" />
                          <span className="text-sm underline">{message.fileName}</span>
                        </div>
                      )}
                      <p className="text-sm">{message.text}</p>
                      <div className={`flex items-center gap-1 mt-1 text-xs ${
                        message.isOwn ? 'text-blue-100' : 'text-gray-500'
                      }`}>
                        <Clock className="h-3 w-3" />
                        {new Date(message.timestamp).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                        {message.isOwn && message.read && (
                          <CheckCheck className="h-3 w-3 ml-1" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            {recipientTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-300 rounded-lg px-4 py-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce delay-100" />
                    <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Responses */}
          {showQuickResponses && (
            <div className="border-t bg-white p-2">
              <div className="flex flex-wrap gap-2">
                {quickResponses.slice(0, 3).map((response, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setInputText(response);
                      setShowQuickResponses(false);
                    }}
                    className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full transition-colors"
                  >
                    {response}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t bg-white p-4 rounded-b-lg">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowQuickResponses(!showQuickResponses)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Quick responses"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                title="Attach file"
              >
                <Paperclip className="h-5 w-5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                accept={CHAT_CONFIG.ALLOWED_FILE_TYPES.join(',')}
                className="hidden"
              />
              <input
                type="text"
                value={inputText}
                onChange={(e: any) => {
                  setInputText(e.target.value);
                  handleTyping();
                }}
                onKeyDown={(e: any) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={CHAT_CONFIG.MAX_MESSAGE_LENGTH}
              />
              <button
                onClick={sendMessage}
                disabled={!inputText.trim()}
                className={`p-2 rounded-lg transition-colors ${
                  inputText.trim()
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            <div className="text-xs text-gray-500 mt-2 flex justify-between">
              <span>
                {useMock && '(Mock Mode) '}
                {CHAT_CONFIG.MAX_MESSAGE_LENGTH - inputText.length} characters remaining
              </span>
              {isTyping && <span>You are typing...</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
