'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { format } from 'date-fns';
import BeccaAIButton from './BeccaAIButton';
import BeccaAILoader from './BeccaAILoader';
import { logger } from '@/lib/logger';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  confidence?: number;
  queryType?: string;
}

interface BeccaAIChatProps {
  userEmail: string;
  patientId?: number;
  patientName?: string;
  clinicId?: number;
  className?: string;
  embedded?: boolean;
  customTheme?: {
    backgroundColor?: string;
    textColor?: string;
    borderColor?: string;
  };
}

export default function BeccaAIChat({
  userEmail,
  patientId,
  patientName,
  clinicId,
  className = '',
  embedded = false,
  customTheme,
}: BeccaAIChatProps) {
  const [isOpen, setIsOpen] = useState(embedded);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize with welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        role: 'assistant',
        content: patientName
          ? `Hello! I'm Becca AI, your medical assistant. I can help you find information about ${patientName}. What would you like to know?`
          : "Hello! I'm Becca AI, your medical assistant. I can help you find patient information, prescriptions, tracking numbers, and more. How can I assist you today?",
        createdAt: new Date().toISOString(),
      };
      setMessages([welcomeMessage]);
      
      // Set suggestions based on context
      if (patientName) {
        setSuggestions([
          `What is the date of birth for ${patientName}?`,
          `What was the latest prescription for ${patientName}?`,
          `Show me the tracking information for ${patientName}`,
          `What are the recent SOAP notes for ${patientName}?`,
        ]);
      } else {
        setSuggestions([
          "What are today's pending prescriptions?",
          "Show me recent patient intakes",
          "Find tracking number for Jane Doe",
          "List patients with upcoming appointments",
        ]);
      }
    }
  }, [isOpen, patientName, messages.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load conversation history if session exists
  const loadConversationHistory = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/ai/chat?sessionId=${sessionId}`);
      const data = await response.json();
      
      if (data.ok && data.data.messages) {
        setMessages(data.data.messages);
      }
    } catch (err: any) {
    // @ts-ignore
   
      logger.error('Error loading conversation history:', err);
    }
  };

  // Send message
  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: textToSend,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    setSuggestions([]);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: textToSend,
          userEmail,
          ...(sessionId && { sessionId }),
          ...(patientId && { patientId }),
          ...(clinicId && { clinicId }),
        }),
      });

      const data = await response.json();

      if (data.ok) {
        const assistantMessage: Message = {
          id: data.data.messageId,
          role: 'assistant',
          content: data.data.answer,
          createdAt: new Date().toISOString(),
          confidence: data.data.confidence,
        };
        
        setMessages(prev => [...prev, assistantMessage]);
        setSessionId(data.data.sessionId);
        
        // Generate follow-up suggestions based on response
        generateSuggestions(textToSend, data.data.answer);
      } else {
        setError(data.error);
        const errorMessage: Message = {
          role: 'assistant',
          content: 'I apologize, but I encountered an error. Please try again or rephrase your question.',
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (err: any) {
    // @ts-ignore
   
      logger.error('Error sending message:', err);
      setError('Failed to send message');
      const errorMessage: Message = {
        role: 'assistant',
        content: "I apologize, but I'm having trouble connecting. Please check your connection and try again.",
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Generate follow-up suggestions
  const generateSuggestions = (query: string, response: string) => {
    const queryLower = query.toLowerCase();
    const responseLower = response.toLowerCase();
    
    const newSuggestions: string[] = [];
    
    if (responseLower.includes('prescription') || responseLower.includes('medication')) {
      newSuggestions.push('Show me the prescription history');
      newSuggestions.push('What are the dosage instructions?');
    }
    
    if (responseLower.includes('tracking') || responseLower.includes('shipping')) {
      newSuggestions.push('When was this order placed?');
      newSuggestions.push('Show me all pending shipments');
    }
    
    if (responseLower.includes('patient') && !patientId) {
      newSuggestions.push('Show me more details about this patient');
      newSuggestions.push('What are their recent visits?');
    }
    
    if (newSuggestions.length === 0) {
      // Default suggestions
      newSuggestions.push('Tell me more');
      newSuggestions.push('Show related information');
    }
    
    setSuggestions(newSuggestions.slice(0, 3));
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Clear conversation
  const clearConversation = () => {
    setMessages([]);
    setSessionId(null);
    setSuggestions([]);
    setError(null);
  };

  // Chat UI for floating widget
  const chatContent = (
    <div className={`flex flex-col h-full ${embedded ? '' : 'max-h-[600px]'}`}>
      {/* Header - only shown when not embedded or not using custom theme */}
      {!embedded && !customTheme && (
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-green-600 to-green-700 text-white">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-sm font-bold">AI</span>
            </div>
            <div>
              <h3 className="font-semibold">Becca AI Assistant</h3>
              <p className="text-xs opacity-90">Your medical data assistant</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-white/80 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Messages */}
      <div 
        className="flex-1 overflow-y-auto p-3 space-y-3" 
        style={{ 
          backgroundColor: customTheme?.backgroundColor || 'transparent' 
        }}>
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-[14px] px-3 py-2 ${
                customTheme 
                  ? message.role === 'user'
                    ? 'bg-white/30 text-gray-800 backdrop-blur-md'
                    : 'bg-white/20 text-gray-800 backdrop-blur-md'
                  : message.role === 'user'
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-white border border-gray-200 text-gray-800 shadow-sm'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              {message.createdAt && (
                <p className={`text-xs mt-1 ${
                  customTheme 
                    ? 'text-gray-600'
                    : message.role === 'user' ? 'text-green-100' : 'text-gray-400'
                }`}>
                  {format(new Date(message.createdAt), 'h:mm a')}
                </p>
              )}
              {message.confidence !== undefined && message.confidence < 0.8 && (
                <p className="text-xs text-yellow-600 mt-1">
                  ⚠️ Low confidence response
                </p>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className={`rounded-[14px] p-2 ${
              customTheme 
                ? 'bg-white/20 backdrop-blur-md' 
                : 'bg-white border border-gray-200'
            }`}>
              <BeccaAILoader size="small" text="" />
            </div>
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && !isLoading && (
          <div className="flex flex-wrap gap-2 pt-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => sendMessage(suggestion)}
                className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                  customTheme
                    ? 'bg-[#4fa77e]/10 text-[#4fa77e] hover:bg-[#4fa77e]/20 backdrop-blur-md border border-[#4fa77e]/30'
                    : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error message */}
      {error && (
        <div className={`px-4 py-2 border-t ${
          customTheme 
            ? 'bg-red-100/50 border-red-400/30' 
            : 'bg-red-50 border-red-200'
        }`}>
          <p className={`text-sm ${
            customTheme ? 'text-red-700' : 'text-red-600'
          }`}>{error}</p>
        </div>
      )}

      {/* Input */}
      <div className={`p-3 ${customTheme ? 'bg-transparent border-none' : 'bg-white border-t'}`}>
        <div className="flex items-end space-x-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e: any) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything about patient data..."
            className={`flex-1 px-3 py-2 rounded-[16px] resize-none focus:outline-none ${
              customTheme
                ? 'bg-white/90 backdrop-blur-md text-gray-800 placeholder-gray-500 focus:bg-white/95 border border-white/30'
                : 'border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500'
            }`}
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className={`px-3 py-2 rounded-[16px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              customTheme
                ? 'bg-green-600/80 text-white hover:bg-green-600/90 backdrop-blur-md'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        
        {messages.length > 1 && (
          <div className="flex justify-end mt-2">
            <button
              onClick={clearConversation}
              className={`text-xs ${
                customTheme 
                  ? 'text-gray-600 hover:text-gray-800' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Clear chat
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // For embedded mode, return content directly
  if (embedded) {
    return (
      <div className={`bg-white rounded-lg border h-full ${className}`}>
        {chatContent}
      </div>
    );
  }

  // For floating widget mode
  return (
    <>
      {/* Floating Button with Lottie Animation */}
      {!isOpen && (
        <BeccaAIButton
          onClick={() => setIsOpen(true)}
          size="medium"
          showPulse={true}
          className="fixed bottom-32 left-6 z-40"
        />
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className={`fixed bottom-0 left-6 w-96 h-[600px] bg-white rounded-t-xl shadow-2xl border border-gray-200 z-50 ${className}`}>
          {chatContent}
        </div>
      )}
    </>
  );
}
