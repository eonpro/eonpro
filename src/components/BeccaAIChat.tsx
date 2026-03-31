'use client';

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiFetch } from '@/lib/api/fetch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  id?: number;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  createdAt?: string;
  isStreaming?: boolean;
  toolCalls?: ToolCallEvent[];
}

interface ToolCallEvent {
  name: string;
  description: string;
  status: 'running' | 'done';
  summary?: string;
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

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function ToolCallIndicator({ tc }: { tc: ToolCallEvent }) {
  return (
    <div className="my-1 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
      {tc.status === 'running' ? (
        <svg className="h-3.5 w-3.5 animate-spin text-[#17aa7b]" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5 text-[#17aa7b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
      <span>{tc.status === 'running' ? tc.description : tc.summary || tc.description}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute -right-1 top-1 rounded-md p-1 text-gray-400 opacity-0 transition-all hover:bg-gray-200 hover:text-gray-600 group-hover/msg:opacity-100"
      title="Copy to clipboard"
    >
      {copied ? (
        <svg className="h-3.5 w-3.5 text-[#17aa7b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

function MessageBubble({ message, isLast }: { message: Message; isLast: boolean }) {
  const isUser = message.role === 'user';
  const showCopy = !isUser && !message.isStreaming && message.content.length > 0;

  return (
    <div className={`group/msg relative flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`relative max-w-[85%] px-4 py-2.5 ${
          isUser
            ? 'rounded-[20px] rounded-br-[4px] bg-[#17aa7b] text-white'
            : 'rounded-[20px] rounded-bl-[4px] bg-[#f0f0f0] text-gray-900'
        } ${isLast && !isUser ? 'animate-fadeIn' : ''}`}
      >
        {/* Tool call indicators */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2">
            {message.toolCalls.map((tc, i) => (
              <ToolCallIndicator key={i} tc={tc} />
            ))}
          </div>
        )}

        {/* Content */}
        {message.isStreaming && !message.content ? (
          <div className="flex items-center gap-1 px-1">
            <div className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
            </div>
          </div>
        ) : (
          <div className="becca-prose text-[15px] leading-relaxed">
            {isUser ? (
              <span>{message.content}</span>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => {
                    const isInternal = href?.startsWith('/');
                    return (
                      <a
                        href={href}
                        className="font-medium text-[#17aa7b] underline decoration-[#17aa7b]/30 underline-offset-2 hover:decoration-[#17aa7b]"
                        {...(isInternal ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        )}

        {/* Copy button */}
        {showCopy && <CopyButton text={message.content} />}
      </div>
    </div>
  );
}

function QuickAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm transition-all duration-200 hover:border-[#17aa7b]/30 hover:bg-[#17aa7b]/5 hover:text-[#17aa7b]"
    >
      <span className="max-w-[220px] truncate">{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// SSE Parser
// ---------------------------------------------------------------------------

function parseSSELine(line: string): { event: string; data: unknown } | null {
  if (!line.startsWith('event:') && !line.startsWith('data:')) return null;
  return null; // handled by buffered parser below
}

async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: {
    onTextDelta: (content: string) => void;
    onToolCallStart: (name: string, description: string) => void;
    onToolCallResult: (name: string, summary: string) => void;
    onSuggestions: (suggestions: string[]) => void;
    onDone: (data: { sessionId: string; messageId: number }) => void;
    onError: (message: string) => void;
  },
) {
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const raw = line.slice(6);
        try {
          const data = JSON.parse(raw);
          switch (currentEvent) {
            case 'text_delta':
              handlers.onTextDelta(data.content ?? '');
              break;
            case 'tool_call_start':
              handlers.onToolCallStart(data.name, data.description);
              break;
            case 'tool_call_result':
              handlers.onToolCallResult(data.name, data.summary);
              break;
            case 'suggestions':
              handlers.onSuggestions(data.suggestions ?? []);
              break;
            case 'done':
              handlers.onDone(data);
              break;
            case 'error':
              handlers.onError(data.message ?? 'Unknown error');
              break;
          }
        } catch {
          // Ignore malformed JSON lines
        }
        currentEvent = '';
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Initialize welcome message
  useEffect(() => {
    if (messages.length === 0) {
      const welcome: Message = {
        role: 'assistant',
        content: patientName
          ? `Hi! I can help you with information about **${patientName}** — orders, prescriptions, SOAP notes, tracking, and clinical questions.\n\nWhat would you like to know?`
          : `Hi! I'm Becca, your clinical assistant. I can help with:\n\n- **Patient lookups** — search by name, DOB, or email\n- **Orders & tracking** — status, shipping, prescriptions\n- **Clinical guidance** — GLP-1 dosing, SIG templates, SOAP notes\n- **Clinic stats** — patient counts, pending items\n\nHow can I help?`,
        createdAt: new Date().toISOString(),
      };
      setMessages([welcome]);

      if (patientName) {
        setSuggestions([`Show ${patientName}'s recent orders`, `What prescriptions does ${patientName} have?`]);
      } else {
        setSuggestions(['How many patients do we have?', 'What is the semaglutide titration schedule?']);
      }
    }
  }, [patientName, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (embedded) inputRef.current?.focus();
  }, [embedded]);

  const sendMessageRef = useRef<(text?: string) => void>();

  const sendMessage = useCallback(
    async (messageText?: string) => {
      const text = (messageText || input).trim();
      if (!text || isLoading) return;

      const userMsg: Message = { role: 'user', content: text, createdAt: new Date().toISOString() };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);
      setSuggestions([]);

      // Create streaming placeholder
      const streamingMsg: Message = { role: 'assistant', content: '', isStreaming: true, toolCalls: [] };
      setMessages((prev) => [...prev, streamingMsg]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        let effectiveClinicId = clinicId;
        if (!effectiveClinicId && typeof document !== 'undefined') {
          const match = document.cookie.match(/(?:^|;\s*)selected-clinic=(\d+)/);
          if (match) effectiveClinicId = parseInt(match[1], 10) || undefined;
        }

        const res = await fetch('/api/ai/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: text,
            userEmail,
            sessionId: sessionId || undefined,
            patientId: patientId || undefined,
            clinicId: effectiveClinicId || undefined,
          }),
          signal: controller.signal,
          credentials: 'include',
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();

        await consumeSSEStream(reader, {
          onTextDelta(content) {
            setMessages((prev) => {
              const arr = [...prev];
              const last = arr[arr.length - 1];
              if (last?.isStreaming) {
                arr[arr.length - 1] = { ...last, content: last.content + content };
              }
              return arr;
            });
          },
          onToolCallStart(name, description) {
            setMessages((prev) => {
              const arr = [...prev];
              const last = arr[arr.length - 1];
              if (last?.isStreaming) {
                const toolCalls = [...(last.toolCalls || []), { name, description, status: 'running' as const }];
                arr[arr.length - 1] = { ...last, toolCalls };
              }
              return arr;
            });
          },
          onToolCallResult(name, summary) {
            setMessages((prev) => {
              const arr = [...prev];
              const last = arr[arr.length - 1];
              if (last?.isStreaming) {
                const toolCalls = (last.toolCalls || []).map((tc) =>
                  tc.name === name && tc.status === 'running'
                    ? { ...tc, status: 'done' as const, summary }
                    : tc,
                );
                arr[arr.length - 1] = { ...last, toolCalls };
              }
              return arr;
            });
          },
          onSuggestions(newSuggestions) {
            setSuggestions(newSuggestions);
          },
          onDone(data) {
            setSessionId(data.sessionId);
            setMessages((prev) => {
              const arr = [...prev];
              const last = arr[arr.length - 1];
              if (last?.isStreaming) {
                arr[arr.length - 1] = { ...last, id: data.messageId, isStreaming: false };
              }
              return arr;
            });
          },
          onError(message) {
            setMessages((prev) => {
              const arr = [...prev];
              const last = arr[arr.length - 1];
              if (last?.isStreaming) {
                arr[arr.length - 1] = {
                  ...last,
                  content: `I'm sorry, something went wrong. ${message}`,
                  isStreaming: false,
                };
              }
              return arr;
            });
          },
        });
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') return;
        setMessages((prev) => {
          const arr = [...prev];
          const last = arr[arr.length - 1];
          if (last?.isStreaming) {
            arr[arr.length - 1] = {
              ...last,
              content: "I'm having trouble connecting. Please check your connection and try again.",
              isStreaming: false,
            };
          }
          return arr;
        });
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [input, isLoading, clinicId, userEmail, sessionId, patientId],
  );

  // Keep ref current for event listener
  sendMessageRef.current = sendMessage;

  // Listen for quick-action chip events from the parent panel
  useEffect(() => {
    const handler = (e: Event) => {
      const query = (e as CustomEvent).detail;
      if (typeof query === 'string' && query.trim()) {
        sendMessageRef.current?.(query);
      }
    };
    window.addEventListener('becca-send', handler);
    return () => window.removeEventListener('becca-send', handler);
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const clearChat = () => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setSessionId(null);
    setSuggestions([]);
  };

  return (
    <div className={`flex h-full flex-col bg-white ${className}`}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} isLast={i === messages.length - 1} />
        ))}

        {suggestions.length > 0 && !isLoading && (
          <div className="mb-2 mt-2 flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <QuickAction key={i} label={s} onClick={() => sendMessage(s)} />
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              data-becca-input
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={patientName ? `Ask about ${patientName}...` : 'Message Becca...'}
              className="max-h-[120px] w-full resize-none rounded-[20px] bg-[#f0f0f0] px-4 py-2.5 text-[15px] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#17aa7b]/30"
              rows={1}
              disabled={isLoading}
            />
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className={`rounded-full p-2.5 transition-all duration-200 ${
              input.trim() && !isLoading
                ? 'bg-[#17aa7b] text-white shadow-sm hover:bg-[#148f68]'
                : 'cursor-not-allowed bg-gray-200 text-gray-400'
            }`}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {messages.length > 1 && (
          <div className="mt-2 flex justify-center">
            <button onClick={clearChat} className="text-xs text-gray-400 transition-colors hover:text-gray-600">
              Clear conversation
            </button>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }

        .becca-prose p { margin: 0.25em 0; }
        .becca-prose ul, .becca-prose ol { margin: 0.25em 0; padding-left: 1.25em; }
        .becca-prose li { margin: 0.1em 0; }
        .becca-prose strong { font-weight: 600; }
        .becca-prose table { width: 100%; border-collapse: collapse; margin: 0.5em 0; font-size: 0.85em; }
        .becca-prose th, .becca-prose td { border: 1px solid #e5e7eb; padding: 4px 8px; text-align: left; }
        .becca-prose th { background: #f9fafb; font-weight: 600; }
        .becca-prose code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
        .becca-prose pre { background: #f3f4f6; padding: 8px 12px; border-radius: 6px; overflow-x: auto; margin: 0.5em 0; }
        .becca-prose pre code { background: none; padding: 0; }
        .becca-prose hr { border: none; border-top: 1px solid #e5e7eb; margin: 0.75em 0; }
        .becca-prose blockquote { border-left: 3px solid #17aa7b; padding-left: 12px; margin: 0.5em 0; color: #6b7280; }
      `}</style>
    </div>
  );
}
