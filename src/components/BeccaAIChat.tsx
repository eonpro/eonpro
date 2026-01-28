'use client';

import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { logger } from '@/lib/logger';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  confidence?: number;
  queryType?: string;
  isStreaming?: boolean;
}

interface BeccaAIChatProps {
  userEmail: string;
  patientId?: number;
  patientName?: string;
  clinicId?: number;
  className?: string;
  embedded?: boolean;
  onClose?: () => void;
}

// Typing indicator component - ChatGPT style
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
      </div>
    </div>
  );
}

// Thinking state component
function ThinkingState({ stage }: { stage: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-500 text-sm">
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      <span className="animate-pulse">{stage}</span>
    </div>
  );
}

// Message bubble component
function MessageBubble({
  message,
  isLast,
}: {
  message: Message;
  isLast: boolean;
}) {
  const isUser = message.role === 'user';

  // Parse markdown-style formatting in the message
  const formatContent = (content: string) => {
    // Handle the medical disclaimer specially
    if (content.includes('---\n*For educational')) {
      const [mainContent, disclaimer] = content.split('---\n');
      return (
        <>
          <div className="whitespace-pre-wrap">{mainContent.trim()}</div>
          <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500 italic">
            {disclaimer?.replace(/\*/g, '').trim()}
          </div>
        </>
      );
    }
    return <div className="whitespace-pre-wrap">{content}</div>;
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] px-4 py-2.5 ${
          isUser
            ? 'bg-[#17aa7b] text-white rounded-[20px] rounded-br-[4px]'
            : 'bg-[#f0f0f0] text-gray-900 rounded-[20px] rounded-bl-[4px]'
        } ${isLast && !isUser ? 'animate-fadeIn' : ''}`}
      >
        <div className="text-[15px] leading-relaxed">
          {message.isStreaming ? (
            <TypingIndicator />
          ) : (
            formatContent(message.content)
          )}
        </div>
      </div>
    </div>
  );
}

// Quick action chip
function QuickAction({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-sm"
    >
      {icon}
      <span className="truncate max-w-[200px]">{label}</span>
    </button>
  );
}

export default function BeccaAIChat({
  userEmail,
  patientId,
  patientName,
  clinicId,
  className = '',
  embedded = false,
  onClose,
}: BeccaAIChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingStage, setThinkingStage] = useState<string>('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize with welcome message
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage: Message = {
        role: 'assistant',
        content: patientName
          ? `Hi! I'm Becca, your AI assistant. I can help you with information about ${patientName}, clinical questions, prescriptions, and more.\n\nWhat would you like to know?`
          : `Hi! I'm Becca, your AI assistant. I can help you with:\n\n• Patient information & records\n• Clinical questions about GLP-1 medications\n• Prescription directions (SIGs)\n• SOAP note guidance\n• Platform workflows\n\nHow can I help you today?`,
        createdAt: new Date().toISOString(),
      };
      setMessages([welcomeMessage]);

      // Set initial suggestions
      if (patientName) {
        setSuggestions([
          `Show ${patientName}'s recent orders`,
          `What prescriptions does ${patientName} have?`,
        ]);
      } else {
        setSuggestions([
          'What is the semaglutide titration schedule?',
          'Help me write a prescription SIG',
          'How many patients are in the system?',
        ]);
      }
    }
  }, [patientName, messages.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    if (embedded) {
      inputRef.current?.focus();
    }
  }, [embedded]);

  // Simulate thinking stages
  const simulateThinking = async () => {
    const stages = [
      'Understanding your question...',
      'Searching knowledge base...',
      'Generating response...',
    ];

    for (const stage of stages) {
      setThinkingStage(stage);
      await new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 400));
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

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setSuggestions([]);

    // Add streaming placeholder
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', isStreaming: true },
    ]);

    // Start thinking animation
    const thinkingPromise = simulateThinking();

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

      // Wait for thinking animation to complete
      await thinkingPromise;

      const data = await response.json();

      // Remove streaming placeholder and add real message
      setMessages((prev) => {
        const filtered = prev.filter((m) => !m.isStreaming);
        if (data.ok) {
          return [
            ...filtered,
            {
              id: data.data.messageId,
              role: 'assistant',
              content: data.data.answer,
              createdAt: new Date().toISOString(),
              confidence: data.data.confidence,
            },
          ];
        } else {
          return [
            ...filtered,
            {
              role: 'assistant',
              content:
                "I'm sorry, I encountered an error processing your request. Please try again.",
              createdAt: new Date().toISOString(),
            },
          ];
        }
      });

      if (data.ok) {
        setSessionId(data.data.sessionId);
        generateSuggestions(textToSend, data.data.answer);
      }
    } catch (err: any) {
      logger.error('Error sending message:', err);
      setMessages((prev) => {
        const filtered = prev.filter((m) => !m.isStreaming);
        return [
          ...filtered,
          {
            role: 'assistant',
            content:
              "I'm having trouble connecting right now. Please check your connection and try again.",
            createdAt: new Date().toISOString(),
          },
        ];
      });
    } finally {
      setIsLoading(false);
      setThinkingStage('');
    }
  };

  // Generate contextual suggestions
  const generateSuggestions = (query: string, response: string) => {
    const responseLower = response.toLowerCase();
    const newSuggestions: string[] = [];

    if (responseLower.includes('semaglutide') || responseLower.includes('tirzepatide')) {
      newSuggestions.push('What are the common side effects?');
      newSuggestions.push('Show me the titration protocol');
    } else if (responseLower.includes('prescription') || responseLower.includes('sig')) {
      newSuggestions.push('Generate a different SIG');
      newSuggestions.push('What quantity should I prescribe?');
    } else if (responseLower.includes('patient')) {
      newSuggestions.push('Show more details');
      newSuggestions.push('Any recent orders?');
    } else {
      newSuggestions.push('Tell me more');
    }

    setSuggestions(newSuggestions.slice(0, 2));
  };

  // Handle keyboard
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  // Clear chat
  const clearChat = () => {
    setMessages([]);
    setSessionId(null);
    setSuggestions([]);
  };

  return (
    <div className={`flex flex-col h-full bg-white ${className}`}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((message, index) => (
          <MessageBubble
            key={index}
            message={message}
            isLast={index === messages.length - 1}
          />
        ))}

        {/* Thinking indicator */}
        {isLoading && thinkingStage && (
          <div className="flex justify-start mb-3">
            <div className="bg-[#f0f0f0] text-gray-900 rounded-[20px] rounded-bl-[4px] px-4 py-3">
              <ThinkingState stage={thinkingStage} />
            </div>
          </div>
        )}

        {/* Quick suggestions */}
        {suggestions.length > 0 && !isLoading && (
          <div className="flex flex-wrap gap-2 mt-2 mb-2">
            {suggestions.map((suggestion, index) => (
              <QuickAction
                key={index}
                label={suggestion}
                onClick={() => sendMessage(suggestion)}
              />
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area - iMessage style */}
      <div className="border-t border-gray-100 px-4 py-3 bg-white">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message Becca..."
              className="w-full px-4 py-2.5 text-[15px] bg-[#f0f0f0] rounded-[20px] resize-none focus:outline-none focus:ring-2 focus:ring-[#17aa7b]/30 placeholder-gray-500 max-h-[120px]"
              rows={1}
              disabled={isLoading}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className={`p-2.5 rounded-full transition-all duration-200 ${
              input.trim() && !isLoading
                ? 'bg-[#17aa7b] text-white hover:bg-[#148f68] shadow-sm'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 12h14M12 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>

        {/* Footer actions */}
        {messages.length > 1 && (
          <div className="flex justify-center mt-2">
            <button
              onClick={clearChat}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear conversation
            </button>
          </div>
        )}
      </div>

      {/* Custom styles for animations */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
