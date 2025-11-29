/**
 * Twilio Mock Service for Testing
 * 
 * Provides mock functionality for testing without real Twilio credentials
 */

import { SMSMessage, SMSResponse } from './smsService';
import { logger } from '@/lib/logger';

// Mock message storage (in-memory for testing)
const mockMessages: Array<{
  id: string;
  to: string;
  from: string;
  body: string;
  status: string;
  timestamp: Date;
}> = [];

// Generate mock message ID
function generateMockMessageId(): string {
  return `SM${Math.random().toString(36).substring(2, 15)}mock`;
}

// Mock SMS send function
export async function mockSendSMS(message: SMSMessage): Promise<SMSResponse> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Simulate validation
  if (!message.to || !message.body) {
    return {
      success: false,
      error: 'Missing required fields',
    };
  }
  
  // Simulate phone number validation
  if (!message.to.match(/^\+?[1-9]\d{1,14}$/)) {
    return {
      success: false,
      error: 'Invalid phone number format',
    };
  }
  
  // Simulate random failures (5% failure rate for testing)
  if (Math.random() < 0.05) {
    return {
      success: false,
      error: 'Mock delivery failure - network error',
    };
  }
  
  // Create mock message
  const mockMessageId = generateMockMessageId();
  const mockMessage = {
    id: mockMessageId,
    to: message.to,
    from: message.from || '+15551234567',
    body: message.body,
    status: 'delivered',
    timestamp: new Date(),
  };
  
  // Store in mock storage
  mockMessages.push(mockMessage);
  
  // Log to console for testing
  logger.debug('[MOCK_SMS] Message sent:', {
    id: mockMessageId,
    to: message.to,
    body: message.body.substring(0, 50) + '...',
  });
  
  return {
    success: true,
    messageId: mockMessageId,
    details: {
      status: 'delivered',
      dateCreated: new Date(),
      price: '0.0075',
      priceUnit: 'USD',
      mock: true,
    },
  };
}

// Mock incoming SMS processor
export async function mockProcessIncomingSMS(
  from: string,
  body: string,
  messageSid: string
): Promise<string> {
  logger.debug('[MOCK_INCOMING_SMS]', { from, body, messageSid });
  
  const messageBody = body.toLowerCase().trim();
  
  // Simulate keyword responses
  if (messageBody.includes('confirm')) {
    return 'Thank you for confirming your appointment! (MOCK)';
  }
  
  if (messageBody.includes('cancel')) {
    return 'Your appointment has been cancelled. Please call us to reschedule. (MOCK)';
  }
  
  if (messageBody.includes('help')) {
    return 'Reply CONFIRM to confirm, CANCEL to cancel, or call (555) 123-4567. (MOCK)';
  }
  
  return 'Thank you for your message. A staff member will respond soon. (MOCK)';
}

// Get mock messages (for testing dashboard)
export function getMockMessages() {
  return mockMessages;
}

// Clear mock messages
export function clearMockMessages() {
  mockMessages.length = 0;
}

// Generate mock statistics
export function getMockStatistics() {
  const total = mockMessages.length;
  const delivered = Math.floor(total * 0.95);
  const failed = total - delivered;
  const responses = Math.floor(delivered * 0.75);
  
  return {
    sentToday: total,
    delivered,
    responses,
    failed,
    deliveryRate: total > 0 ? (delivered / total * 100).toFixed(1) : '0',
    responseRate: delivered > 0 ? (responses / delivered * 100).toFixed(1) : '0',
  };
}

// Mock Twilio client for testing
export const mockTwilioClient = {
  messages: {
    create: async (options: any) => {
      const result = await mockSendSMS({
        to: options.to,
        body: options.body,
        from: options.from,
      });
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      return {
        sid: result.messageId,
        status: 'delivered',
        from: options.from,
        to: options.to,
        body: options.body,
        dateCreated: new Date(),
        price: '0.0075',
        priceUnit: 'USD',
      };
    },
  },
  
  // Mock message status fetch
  async fetch(messageId: string) {
    const message = mockMessages.find((m: any) => m.id === messageId);
    if (!message) {
      throw new Error('Message not found');
    }
    
    return {
      status: message.status,
      errorCode: null,
      errorMessage: null,
      dateSent: message.timestamp,
      dateUpdated: message.timestamp,
    };
  },
};
