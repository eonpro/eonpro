/**
 * Twilio Chat/Conversations Configuration
 * 
 * Handles Twilio Conversations API setup for real-time messaging
 */

import { isFeatureEnabled } from '@/lib/features';

// Twilio Chat Configuration
export interface TwilioChatConfig {
  accountSid: string;
  apiKey: string;
  apiSecret: string;
  chatServiceSid: string;
  pushCredentialSid?: string;
}

// Load configuration from environment
export const twilioChatConfig: TwilioChatConfig = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || '',
  apiKey: process.env.TWILIO_API_KEY || '',
  apiSecret: process.env.TWILIO_API_SECRET || '',
  chatServiceSid: process.env.TWILIO_CHAT_SERVICE_SID || '',
  pushCredentialSid: process.env.TWILIO_PUSH_CREDENTIAL_SID || '',
};

// Validate Chat configuration (check for real credentials, not mock)
export function isTwilioChatConfigured(): boolean {
  return !!(
    twilioChatConfig.accountSid && 
    twilioChatConfig.apiKey && 
    twilioChatConfig.apiSecret &&
    twilioChatConfig.chatServiceSid &&
    // Check that these are not mock values
    !twilioChatConfig.accountSid.includes('mock') &&
    !twilioChatConfig.apiKey.includes('mock') &&
    !twilioChatConfig.apiSecret.includes('mock') &&
    !twilioChatConfig.chatServiceSid.includes('mock')
  );
}

// Check if chat is enabled and configured
export function isChatEnabled(): boolean {
  return isFeatureEnabled('TWILIO_CHAT') && isTwilioChatConfigured();
}

// Chat User Types
export enum ChatUserType {
  PATIENT = 'patient',
  PROVIDER = 'provider',
  ADMIN = 'admin',
  SUPPORT = 'support'
}

// Chat Channel Types
export enum ChatChannelType {
  DIRECT = 'direct',          // 1-on-1 conversation
  GROUP = 'group',            // Group chat
  SUPPORT = 'support',        // Support ticket
  CONSULTATION = 'consultation', // Medical consultation
}

// Chat Message Types
export enum ChatMessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
  SYSTEM = 'system',
  PRESCRIPTION = 'prescription',
  APPOINTMENT = 'appointment'
}

// Chat Configuration
export const CHAT_CONFIG = {
  // Message limits
  MAX_MESSAGE_LENGTH: 1000,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
  
  // UI Configuration
  MESSAGE_PAGE_SIZE: 30,
  TYPING_INDICATOR_TIMEOUT: 1000,
  ONLINE_THRESHOLD: 5 * 60 * 1000, // 5 minutes
  
  // Notifications
  ENABLE_PUSH: true,
  ENABLE_EMAIL: true,
  ENABLE_SMS: false, // Use dedicated SMS service
  
  // Features
  ENABLE_TYPING_INDICATORS: true,
  ENABLE_READ_RECEIPTS: true,
  ENABLE_PRESENCE: true,
  ENABLE_FILE_SHARING: true,
  ENABLE_MESSAGE_REACTIONS: false,
};

// System Messages
export const SYSTEM_MESSAGES = {
  WELCOME: (userName: string) => 
    `Welcome to Lifefile Chat, ${userName}! A healthcare professional will be with you shortly.`,
  
  PROVIDER_JOINED: (providerName: string) => 
    `${providerName} has joined the conversation.`,
  
  PROVIDER_LEFT: (providerName: string) => 
    `${providerName} has left the conversation.`,
  
  CONSULTATION_STARTED: 'Your consultation has started.',
  
  CONSULTATION_ENDED: 'Your consultation has ended. You can still view the chat history.',
  
  FILE_SHARED: (fileName: string, userName: string) => 
    `${userName} shared a file: ${fileName}`,
  
  PRESCRIPTION_SENT: 'A prescription has been sent to your pharmacy.',
  
  APPOINTMENT_SCHEDULED: (date: string) => 
    `An appointment has been scheduled for ${date}.`,
  
  OFFLINE_MESSAGE: 'The recipient is currently offline. They will receive your message when they return.',
};

// Quick Responses for Providers
export const PROVIDER_QUICK_RESPONSES = [
  "Hello! How can I help you today?",
  "I'll review your information and get back to you shortly.",
  "Can you describe your symptoms in more detail?",
  "Have you taken any medications for this condition?",
  "I'm sending a prescription to your pharmacy.",
  "Please schedule a follow-up appointment if symptoms persist.",
  "Do you have any questions about your treatment plan?",
  "Thank you for using Lifefile. Take care!",
];

// Patient Quick Responses
export const PATIENT_QUICK_RESPONSES = [
  "Thank you, doctor.",
  "I understand.",
  "Can you explain that in simpler terms?",
  "How long should I take this medication?",
  "What are the side effects?",
  "When should I follow up?",
  "Is this covered by insurance?",
  "Thank you for your help.",
];
