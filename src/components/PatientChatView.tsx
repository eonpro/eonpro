'use client';

import React, { useState, useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string | null;
  phone?: string;
}

interface Message {
  id: string;
  text: string;
  sender: 'provider' | 'patient';
  timestamp: Date;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
}

interface PatientChatViewProps {
  patient: Patient;
}

export default function PatientChatView({ patient }: PatientChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const patientPhone = patient.phoneNumber || patient.phone;

  useEffect(() => {
    if (patientPhone) {
      loadMessageHistory();
      initializeTwilioConnection();
    } else {
      // No phone number, but still allow the chat UI to show "connected"
      // (the no-phone-number message will be shown instead)
      setConnected(true);
    }
  }, [patient.id, patientPhone]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessageHistory = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/twilio/messages/${patient.id}`, {
        credentials: 'include', // Include cookies for authentication
      });

      if (res.ok) {
        const data = await res.json();
        const formattedMessages: Message[] = (data.messages || []).map((msg: any) => ({
          id: msg.sid || msg.id,
          text: msg.body || msg.text,
          sender: msg.direction === 'inbound' ? 'patient' : 'provider',
          timestamp: new Date(msg.dateCreated || msg.timestamp),
          status: msg.status
        }));
        setMessages(formattedMessages);
      } else {
        // If message history fails, just start with empty messages
        logger.warn('Failed to load message history, starting fresh');
        setMessages([]);
      }
    } catch (error: any) {
      // @ts-ignore
      logger.error('Failed to load message history', error);
      // Don't show error, just start with empty messages
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const initializeTwilioConnection = async () => {
    // Set a timeout to force connection status after 5 seconds
    const timeout = setTimeout(() => {
      logger.warn('Twilio connection timed out, enabling chat anyway');
      setConnected(true);
    }, 5000);

    try {
      const res = await fetch('/api/twilio/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify({ patientId: patient.id })
      });

      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        // Here you would initialize Twilio Conversations SDK
        // For now, we'll just mark as connected (works for both real and demo mode)
        setConnected(true);
        setError(null);
      } else {
        // Even if Twilio token fails, allow SMS sending via the send endpoint
        // which will work in demo mode
        const errorData = await res.json().catch(() => ({}));
        logger.warn('Twilio token request failed', { status: res.status, error: errorData });
        setConnected(true);
        setError(null);
      }
    } catch (error: any) {
      clearTimeout(timeout);
      // @ts-ignore
      logger.error('Failed to initialize Twilio', error);
      // Still allow the chat to work - SMS sending can work without real-time connection
      setConnected(true);
      setError(null);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !patientPhone) return;

    const tempMessage: Message = {
      id: `temp-${Date.now()}`,
      text: newMessage,
      sender: 'provider',
      timestamp: new Date(),
      status: 'sent'
    };

    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');

    try {
      const res = await fetch('/api/twilio/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify({
          to: patientPhone,
          message: newMessage,
          patientId: patient.id
        })
      });

      if (res.ok) {
        const data = await res.json();
        // Update message with actual ID and status
        setMessages(prev => prev.map((msg: any) => 
          msg.id === tempMessage.id 
            ? { ...msg, id: data.messageSid, status: 'delivered' }
            : msg
        ));
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('Failed to send message', error);
      // Mark message as failed
      setMessages(prev => prev.map((msg: any) => 
        msg.id === tempMessage.id 
          ? { ...msg, status: "FAILED" as any }
          : msg
      ));
      setError('Failed to send message');
    }
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const messageDate = new Date(date);
    
    if (messageDate.toDateString() === today.toDateString()) {
      return 'Today';
    }
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (messageDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    
    return messageDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: messageDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  };

  if (!patientPhone) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <h3 className="text-lg font-semibold mb-2">No Phone Number Available</h3>
        <p className="text-gray-600">This patient doesn't have a phone number on file.</p>
        <p className="text-gray-600 mt-2">Please add a phone number to enable messaging.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border flex flex-col h-[600px]">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-blue-600 font-semibold">
              {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
            </span>
          </div>
          <div>
            <h3 className="font-semibold">{patient.firstName} {patient.lastName}</h3>
            <p className="text-sm text-gray-600">{patientPhone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="flex items-center gap-1 text-green-600 text-sm">
              <span className="w-2 h-2 bg-green-600 rounded-full"></span>
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-gray-400 text-sm">
              <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
              Connecting...
            </span>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-2">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-gray-600">No messages yet</p>
            <p className="text-sm text-gray-500 mt-1">Start the conversation by sending a message</p>
          </div>
        ) : (
          <>
            {/* Group messages by date */}
            {messages.reduce((groups: any[], message, index) => {
              const messageDate = formatDate(message.timestamp);
              const prevMessage = messages[index - 1];
              const prevDate = prevMessage  ? formatDate(prevMessage.timestamp)  : undefined;
              
              if (messageDate !== prevDate) {
                groups.push(
                  <div key={`date-${messageDate}`} className="text-center my-4">
                    <span className="text-xs text-gray-500 bg-white px-3 py-1 rounded-full">
                      {messageDate}
                    </span>
                  </div>
                );
              }
              
              groups.push(
                <div
                  key={message.id}
                  className={`flex ${message.sender === 'provider' ? 'justify-end' : 'justify-start'} mb-2`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.sender === 'provider'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white border'
                    }`}
                  >
                    <p className="text-sm">{message.text}</p>
                    <div className={`flex items-center gap-1 mt-1 ${
                      message.sender === 'provider' ? 'text-blue-200' : 'text-gray-400'
                    }`}>
                      <span className="text-xs">{formatTime(message.timestamp)}</span>
                      {message.sender === 'provider' && message.status && (
                        <>
                          {message.status === 'sent' && (
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {message.status === 'delivered' && (
                            <>
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              <svg className="w-3 h-3 -ml-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </>
                          )}
                          {message.status === 'failed' && (
                            <svg className="w-3 h-3 text-red-300" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
              
              return groups;
            }, [])}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t px-6 py-4">
        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-2 rounded mb-3">
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e: any) => setNewMessage(e.target.value)}
            onKeyPress={(e: any) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={!connected}
          />
          <button
            onClick={sendMessage}
            disabled={!connected || !newMessage.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Messages are sent via SMS to the patient's phone number
        </p>
      </div>
    </div>
  );
}
