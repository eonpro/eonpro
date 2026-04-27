'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { usePatientId } from '@/hooks/usePatientId';
import { decodeHtmlEntities } from '@/lib/utils';
import { linkifyText } from '@/lib/utils/linkify';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';
import { logger } from '@/lib/logger';
import { useWebSocket, EventType } from '@/hooks/useWebSocket';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import {
  uploadChatAttachment,
  classifyChatAttachmentFile,
  CHAT_ATTACHMENT_ACCEPT_ATTR,
  CHAT_ATTACHMENT_MAX_PER_MESSAGE,
  CHAT_ATTACHMENT_MAX_BYTES,
  type ChatAttachmentSendable,
} from '@/lib/chat-attachments/client';
import type { ChatAttachmentResolved } from '@/lib/chat-attachments';
import {
  Send,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  MessageCircle,
  Smile,
  Paperclip,
  MoreVertical,
  X as XIcon,
  FileText,
  Loader2,
} from 'lucide-react';

interface ChatMessage {
  id: number;
  createdAt: string;
  message: string;
  direction: 'INBOUND' | 'OUTBOUND';
  channel: 'WEB' | 'SMS' | 'EMAIL';
  senderType: 'PATIENT' | 'STAFF' | 'PROVIDER' | 'SYSTEM';
  senderName: string | null;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  readAt: string | null;
  replyTo?: {
    id: number;
    message: string;
    senderName: string;
  } | null;
  attachments?: ChatAttachmentResolved[] | null;
}

interface PendingAttachment {
  /** Local-only id; replaced by server-issued uuid once sent. */
  localId: string;
  file: File;
  name: string;
  size: number;
  mime: string;
  /** 0..1 */
  progress: number;
  /** Set once the file has finished uploading to S3. */
  sendable?: ChatAttachmentSendable;
  error?: string;
}

export default function PatientChatPage() {
  const router = useRouter();
  const { branding } = useClinicBranding();
  const { t } = usePatientPortalLanguage();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const { patientId, loading: patientIdLoading } = usePatientId();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!patientIdLoading && !patientId) {
      setLoading(false);
      setError('Unable to load your profile. Please log out and log back in.');
    }
  }, [patientIdLoading, patientId]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasMessagesRef = useRef(false);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // --- WebSocket for real-time messages ---
  const { subscribe, isConnected: wsConnected } = useWebSocket({
    autoConnect: true,
    events: [EventType.DATA_UPDATE],
  });

  // Track polling interval with exponential backoff
  const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(5000); // Start at 5s
  const MAX_BACKOFF = 30000;
  const lastMessageCountRef = useRef(0);

  // Stable fetchMessages wrapped in useCallback
  const fetchMessages = useCallback(async () => {
    if (!patientId) return;

    try {
      const response = await portalFetch(`/api/patient-chat?patientId=${patientId}&limit=100`);
      if (response.ok) {
        const result = await safeParseJson(response);
        const list =
          result !== null && typeof result === 'object' && 'data' in result
            ? (result as { data?: ChatMessage[] }).data
            : undefined;
        const newMessages = Array.isArray(list) ? list : [];

        // Reset backoff if new messages arrived
        if (newMessages.length !== lastMessageCountRef.current) {
          backoffRef.current = 5000;
          lastMessageCountRef.current = newMessages.length;
        } else {
          // Exponential backoff when no new messages
          backoffRef.current = Math.min(backoffRef.current * 1.5, MAX_BACKOFF);
        }

        setMessages(newMessages);
        hasMessagesRef.current = newMessages.length > 0;
        setError('');
      } else if (response.status === 401) {
        setError(t('chatSessionExpired'));
        setTimeout(() => {
          window.location.href = `/patient-login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/chat`)}&reason=session_expired`;
        }, 2000);
      } else if (response.status === 403) {
        setError(t('chatAccessDenied'));
      }
    } catch (err) {
      logger.error('Failed to fetch messages', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      setError(t('chatConnectionError'));
    } finally {
      setLoading(false);
    }
  }, [patientId, router, t]);

  // WebSocket subscription for real-time messages
  useEffect(() => {
    if (!patientId || !wsConnected) return;

    const unsub = subscribe(EventType.DATA_UPDATE, (data: unknown) => {
      const evt = data as { entity?: string; patientId?: number } | null;
      if (evt?.entity === 'chat_message' && (!evt.patientId || evt.patientId === patientId)) {
        fetchMessages();
      }
    });

    return unsub;
  }, [patientId, wsConnected, subscribe, fetchMessages]);

  // Fallback polling with visibility-aware backoff (only when WS disconnected)
  useEffect(() => {
    if (!patientId) return;

    // Initial fetch
    fetchMessages();

    // Don't poll when WebSocket is connected
    if (wsConnected) return;

    const schedulePoll = () => {
      pollIntervalRef.current = setTimeout(() => {
        if (document.visibilityState === 'visible') {
          fetchMessages().then(schedulePoll);
        } else {
          // When hidden, check again after max backoff
          pollIntervalRef.current = setTimeout(schedulePoll, MAX_BACKOFF);
        }
      }, backoffRef.current);
    };

    schedulePoll();

    // Reset backoff and fetch on visibility change
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        backoffRef.current = 5000;
        fetchMessages();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (pollIntervalRef.current) clearTimeout(pollIntervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [patientId, wsConnected, fetchMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ------------------------------------------------------------------
  // Attachment upload pipeline.
  // Uploads kick off as soon as files are picked so the user can keep
  // typing. Send button stays disabled while any upload is in-flight.
  // ------------------------------------------------------------------
  const isUploading = pendingAttachments.some((a) => !a.sendable && !a.error);
  const readyAttachments = pendingAttachments.filter((a) => a.sendable);

  const removePendingAttachment = useCallback((localId: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.localId !== localId));
  }, []);

  const handleAttachClick = useCallback(() => {
    if (sending) return;
    fileInputRef.current?.click();
  }, [sending]);

  const handleFilesSelected = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !patientId) return;
      setError('');

      // Cap total selected to CHAT_ATTACHMENT_MAX_PER_MESSAGE
      const remaining = CHAT_ATTACHMENT_MAX_PER_MESSAGE - pendingAttachments.length;
      const incoming = Array.from(files).slice(0, Math.max(0, remaining));
      if (Array.from(files).length > remaining) {
        setError(`You can attach up to ${CHAT_ATTACHMENT_MAX_PER_MESSAGE} files per message.`);
      }

      const queued: PendingAttachment[] = [];
      for (const file of incoming) {
        const cls = classifyChatAttachmentFile(file);
        if (!cls.ok) {
          setError(cls.reason);
          continue;
        }
        queued.push({
          localId: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          file,
          name: file.name,
          size: file.size,
          mime: cls.mime,
          progress: 0,
        });
      }
      if (queued.length === 0) return;

      setPendingAttachments((prev) => [...prev, ...queued]);

      // Kick off uploads in parallel; update progress per-file.
      await Promise.all(
        queued.map(async (entry) => {
          try {
            const sendable = await uploadChatAttachment(entry.file, {
              onProgress: (loaded, total) => {
                if (!total) return;
                const pct = Math.min(1, loaded / total);
                setPendingAttachments((prev) =>
                  prev.map((a) => (a.localId === entry.localId ? { ...a, progress: pct } : a))
                );
              },
            });
            setPendingAttachments((prev) =>
              prev.map((a) => (a.localId === entry.localId ? { ...a, progress: 1, sendable } : a))
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            logger.error('Chat attachment upload failed', { error: message });
            setPendingAttachments((prev) =>
              prev.map((a) => (a.localId === entry.localId ? { ...a, error: message } : a))
            );
          }
        })
      );
    },
    [patientId, pendingAttachments.length]
  );

  const handleSendMessage = async () => {
    if (!patientId || sending || isUploading) return;
    const messageText = newMessage.trim();
    if (messageText.length === 0 && readyAttachments.length === 0) return;

    setNewMessage('');
    const sendingAttachments = [...readyAttachments];
    setPendingAttachments((prev) => prev.filter((a) => !a.sendable)); // keep failed ones for retry
    setSending(true);
    setError('');

    // Optimistic update
    const tempMessage: ChatMessage = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      message: messageText,
      direction: 'INBOUND',
      channel: 'WEB',
      senderType: 'PATIENT',
      senderName: 'You',
      status: 'PENDING',
      readAt: null,
      attachments: sendingAttachments.map((p) => ({
        id: p.localId,
        name: p.name,
        mime: p.mime as ChatAttachmentResolved['mime'],
        size: p.size,
        uploadedAt: new Date().toISOString(),
        // No URL yet — server will return signed URL on next refresh.
      })),
    };
    setMessages((prev) => [...prev, tempMessage]);

    try {
      const response = await portalFetch('/api/patient-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          message: messageText,
          channel: 'WEB',
          ...(sendingAttachments.length > 0
            ? { attachments: sendingAttachments.map((a) => a.sendable!) }
            : {}),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const parsed = await safeParseJson(response);
      const sentMessage =
        parsed !== null && typeof parsed === 'object' ? (parsed as ChatMessage) : null;

      if (sentMessage) {
        setMessages((prev) => prev.map((m) => (m.id === tempMessage.id ? sentMessage : m)));
      }
      // Pull a fresh page so signed URLs for the new attachments come back.
      if (sendingAttachments.length > 0) fetchMessages();
    } catch (err) {
      setError(t('chatSendFailed'));
      setMessages((prev) =>
        prev.map((m) => (m.id === tempMessage.id ? { ...m, status: 'FAILED' as const } : m))
      );
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = useCallback((dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }, []);

  const formatDate = useCallback(
    (dateString: string) => {
      const date = new Date(dateString);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return t('chatToday');
      } else if (date.toDateString() === yesterday.toDateString()) {
        return t('chatYesterday');
      } else {
        return date.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        });
      }
    },
    [t]
  );

  const groupedMessages = useMemo(
    () =>
      messages.reduce(
        (groups, message) => {
          const date = formatDate(message.createdAt);
          if (!groups[date]) {
            groups[date] = [];
          }
          groups[date].push(message);
          return groups;
        },
        {} as Record<string, ChatMessage[]>
      ),
    [messages, formatDate]
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="h-3 w-3 text-gray-400" />;
      case 'SENT':
        return <Check className="h-3 w-3 text-gray-400" />;
      case 'DELIVERED':
        return <CheckCheck className="h-3 w-3 text-gray-400" />;
      case 'READ':
        return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case 'FAILED':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex h-[100dvh] animate-pulse flex-col bg-gray-50">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-3">
          <div className="h-12 w-12 rounded-full bg-gray-200" />
          <div className="flex flex-1 items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-200" />
            <div className="space-y-1.5">
              <div className="h-4 w-28 rounded bg-gray-200" />
              <div className="h-3 w-36 rounded bg-gray-100" />
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-gray-100" />
        </div>
        {/* Message area */}
        <div className="flex-1 space-y-4 overflow-hidden px-4 py-4">
          <div className="flex justify-center">
            <div className="h-5 w-20 rounded-full bg-gray-200" />
          </div>
          <div className="flex justify-start">
            <div className="h-16 w-3/5 rounded-2xl rounded-bl-md bg-white shadow-sm" />
          </div>
          <div className="flex justify-end">
            <div className="h-12 w-2/5 rounded-2xl rounded-br-md bg-gray-200" />
          </div>
          <div className="flex justify-start">
            <div className="h-20 w-1/2 rounded-2xl rounded-bl-md bg-white shadow-sm" />
          </div>
          <div className="flex justify-end">
            <div className="h-10 w-1/3 rounded-2xl rounded-br-md bg-gray-200" />
          </div>
          <div className="flex justify-start">
            <div className="h-14 w-3/5 rounded-2xl rounded-bl-md bg-white shadow-sm" />
          </div>
        </div>
        {/* Input bar */}
        <div className="border-t border-gray-200 bg-white p-4">
          <div className="flex items-end gap-3">
            <div className="h-10 w-10 rounded-full bg-gray-100" />
            <div className="h-12 flex-1 rounded-2xl bg-gray-100" />
            <div className="h-10 w-10 rounded-full bg-gray-200" />
          </div>
        </div>
      </div>
    );
  }

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      window.location.href = PATIENT_PORTAL_PATH;
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-3">
        <button
          onClick={handleBack}
          aria-label="Go back"
          className="flex h-12 w-12 items-center justify-center rounded-full text-gray-600 active:bg-gray-100"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div className="flex flex-1 items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: primaryColor }}
          >
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-semibold text-gray-900">{t('chatCareTeam')}</h1>
            <p className="text-xs text-gray-500">{t('chatUsuallyReplies')}</p>
          </div>
        </div>
        <button
          aria-label="More options"
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-600 active:bg-gray-100"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: `${primaryColor}15` }}
            >
              <MessageCircle className="h-8 w-8" style={{ color: primaryColor }} />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">
              {t('chatStartConversation')}
            </h2>
            <p className="max-w-[280px] text-sm text-gray-500">{t('chatStartDesc')}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedMessages).map(([date, dateMessages]) => (
              <div key={date}>
                {/* Date Divider */}
                <div className="mb-4 flex items-center justify-center">
                  <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
                    {date}
                  </span>
                </div>

                {/* Messages for this date */}
                <div className="space-y-3">
                  {dateMessages.map((message) => {
                    const isOutgoing = message.direction === 'INBOUND'; // Patient's messages are INBOUND to the system

                    return (
                      <div
                        key={message.id}
                        className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                            isOutgoing
                              ? 'rounded-br-md bg-gray-900 text-white'
                              : 'rounded-bl-md bg-white text-gray-900 shadow-sm'
                          }`}
                          style={isOutgoing ? { backgroundColor: primaryColor } : {}}
                        >
                          {/* Reply Preview */}
                          {message.replyTo && (
                            <div
                              className={`mb-2 rounded-lg border-l-2 px-3 py-1.5 text-xs ${
                                isOutgoing
                                  ? 'border-white/50 bg-white/10'
                                  : 'border-gray-300 bg-gray-50'
                              }`}
                            >
                              <p
                                className={`font-medium ${isOutgoing ? 'text-white/80' : 'text-gray-600'}`}
                              >
                                {message.replyTo.senderName}
                              </p>
                              <p
                                className={`line-clamp-1 ${isOutgoing ? 'text-white/60' : 'text-gray-500'}`}
                              >
                                {decodeHtmlEntities(message.replyTo.message)}
                              </p>
                            </div>
                          )}

                          {/* Sender Name (for incoming messages) */}
                          {!isOutgoing && message.senderName && (
                            <p className="mb-1 text-xs font-medium" style={{ color: primaryColor }}>
                              {message.senderName}
                            </p>
                          )}

                          {/* Message Content */}
                          {message.message && message.message.length > 0 && (
                            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                              {linkifyText(decodeHtmlEntities(message.message), {
                                className: `underline break-all ${isOutgoing ? 'text-white/90 hover:text-white' : 'text-blue-600 hover:text-blue-800'}`,
                              })}
                            </p>
                          )}

                          {/* Attachments */}
                          {message.attachments && message.attachments.length > 0 && (
                            <div
                              className={`flex flex-wrap gap-2 ${
                                message.message && message.message.length > 0 ? 'mt-2' : ''
                              }`}
                            >
                              {message.attachments.map((att) => {
                                const isImage = att.mime.startsWith('image/');
                                if (isImage && att.url) {
                                  return (
                                    <a
                                      key={att.id}
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block overflow-hidden rounded-lg"
                                      style={{ maxWidth: 220 }}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={att.url}
                                        alt={att.name}
                                        className="block max-h-60 w-full rounded-lg object-cover"
                                      />
                                    </a>
                                  );
                                }
                                return (
                                  <a
                                    key={att.id}
                                    href={att.url || '#'}
                                    target={att.url ? '_blank' : undefined}
                                    rel="noopener noreferrer"
                                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
                                      isOutgoing
                                        ? 'bg-white/15 text-white'
                                        : 'bg-gray-100 text-gray-700'
                                    } ${!att.url ? 'pointer-events-none opacity-70' : ''}`}
                                  >
                                    <FileText className="h-4 w-4" />
                                    <span className="line-clamp-1 max-w-[160px] font-medium">
                                      {att.name}
                                    </span>
                                  </a>
                                );
                              })}
                            </div>
                          )}

                          {/* Time and Status */}
                          <div
                            className={`mt-1.5 flex items-center gap-1.5 ${
                              isOutgoing ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <span
                              className={`text-[11px] ${
                                isOutgoing ? 'text-white/60' : 'text-gray-400'
                              }`}
                            >
                              {formatTime(message.createdAt)}
                            </span>
                            {isOutgoing && (
                              <span className="text-white/60">{getStatusIcon(message.status)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mb-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>
      )}

      {/* Input Area */}
      <div className="border-t border-gray-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        {/* Pending attachment chips */}
        {pendingAttachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pendingAttachments.map((att) => (
              <div
                key={att.localId}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                  att.error
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : att.sendable
                      ? 'border-gray-200 bg-gray-50 text-gray-700'
                      : 'border-gray-200 bg-white text-gray-500'
                }`}
              >
                {att.mime.startsWith('image/') ? (
                  <span className="font-medium">{att.name}</span>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">{att.name}</span>
                  </>
                )}
                {!att.sendable && !att.error && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {Math.round(att.progress * 100)}%
                  </span>
                )}
                {att.error && <span className="text-red-700">— {att.error}</span>}
                <button
                  type="button"
                  aria-label={`Remove ${att.name}`}
                  className="ml-1 flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  onClick={() => removePendingAttachment(att.localId)}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-3">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={CHAT_ATTACHMENT_ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              if (e.target) e.target.value = '';
            }}
          />

          {/* Attachment Button */}
          <button
            aria-label="Attach file"
            type="button"
            onClick={handleAttachClick}
            disabled={sending || pendingAttachments.length >= CHAT_ATTACHMENT_MAX_PER_MESSAGE}
            title={`Up to ${CHAT_ATTACHMENT_MAX_PER_MESSAGE} files, ${CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024}MB each`}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-gray-500 active:bg-gray-100 disabled:opacity-50"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          {/* Text Input */}
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chatTypePlaceholder')}
              rows={1}
              className="chat-textarea w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pr-12 text-[15px] outline-none transition-colors focus:border-gray-300 focus:bg-white"
            />
            <button
              aria-label="Emoji"
              className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
              disabled
            >
              <Smile className="h-5 w-5" />
            </button>
          </div>

          {/* Send Button */}
          <button
            onClick={handleSendMessage}
            disabled={
              sending || isUploading || (!newMessage.trim() && readyAttachments.length === 0)
            }
            aria-label="Send message"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white transition-all disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}
          >
            {sending ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
