/**
 * Twilio Chat Service - Client Side
 * 
 * Handles Twilio Conversations API for real-time messaging
 * This file is safe to import in client components
 */

import { Client as ConversationsClient } from '@twilio/conversations';
import { isChatEnabled, ChatUserType, ChatChannelType, CHAT_CONFIG } from './chatConfig';
import { logger } from '@/lib/logger';

// Chat Client Manager (for client-side)
export class ChatClientManager {
  private client: ConversationsClient | null = null;
  private identity: string;
  private userType: ChatUserType;
  private onMessageCallback?: (message: any) => void;
  private onTypingCallback?: (participant: any, typing: boolean) => void;
  private onPresenceCallback?: (participant: any, status: string) => void;

  constructor(identity: string, userType: ChatUserType = ChatUserType.PATIENT) {
    this.identity = identity;
    this.userType = userType;
  }

  // Initialize chat client
  async initialize(token: string): Promise<void> {
    try {
      // Check if this is a mock token
      if (token.startsWith('mock.')) {
        logger.debug('[CHAT] Mock token detected, skipping real Twilio initialization');
        throw new Error('Mock token provided - use MockChatService instead');
      }

      this.client = new ConversationsClient(token);
      
      // Set up event listeners (no await needed for .on() methods)
      this.client.on('initialized', () => {
        logger.debug('[CHAT] Client initialized');
        this.setupEventListeners();
      });

      this.client.on('connectionStateChanged', (state: any) => {
        logger.debug('[CHAT] Connection state:', { value: state });
      });

      this.client.on('tokenAboutToExpire', async () => {
        logger.debug('[CHAT] Token about to expire, refreshing...');
        // Fetch new token and update
        const newToken = await this.fetchNewToken();
        if (newToken && this.client) {
          await this.client.updateToken(newToken);
        }
      });

      // Wait for client to be initialized with timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Twilio client initialization timeout'));
        }, 10000); // 10 second timeout

        if (this.client?.connectionState === 'connected') {
          clearTimeout(timeout);
          resolve();
        } else {
          this.client?.on('connectionStateChanged', (state: any) => {
            if (state === 'connected') {
              clearTimeout(timeout);
              resolve();
            } else if (state === 'denied' || state === 'error') {
              clearTimeout(timeout);
              reject(new Error(`Twilio connection ${state}`));
            }
          });
        }
      });

    } catch (error: any) {
    // @ts-ignore
   
      logger.error('[CHAT] Initialization error:', error);
      throw error;
    }
  }

  // Setup event listeners
  private setupEventListeners(): void {
    if (!this.client) return;

    // Message events
    this.client.on('messageAdded', (message: any) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(message);
      }
    });

    // Typing indicators
    this.client.on('typingStarted', (participant: any) => {
      if (this.onTypingCallback) {
        this.onTypingCallback(participant, true);
      }
    });

    this.client.on('typingEnded', (participant: any) => {
      if (this.onTypingCallback) {
        this.onTypingCallback(participant, false);
      }
    });

    // User presence
    this.client.on('userUpdated', (user: any) => {
      if (this.onPresenceCallback) {
        const isOnline = user.isOnline || user.online || false;
        this.onPresenceCallback(user, isOnline ? 'online' : 'offline');
      }
    });
  }

  // Fetch new token from server
  private async fetchNewToken(): Promise<string | null> {
    try {
      const response = await fetch('/api/v2/twilio/chat/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: this.identity, userType: this.userType }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.token;
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('[CHAT] Failed to fetch new token:', error);
    }
    return null;
  }

  // Get or create conversation
  async getOrCreateConversation(
    uniqueName: string,
    friendlyName: string,
    attributes?: any
  ): Promise<any> {
    if (!this.client) throw new Error('Chat client not initialized');

    try {
      // Try to get existing conversation
      let conversation = await this.client.getConversationByUniqueName(uniqueName);
      return conversation;
    } catch (error: any) {
    // @ts-ignore
   
      // Create new conversation if doesn't exist
      try {
        const conversation = await this.client.createConversation({
          uniqueName,
          friendlyName,
          attributes: {
            type: ChatChannelType.DIRECT,
            created: new Date().toISOString(),
            ...attributes,
          },
        });

        // Join the conversation
        await conversation.join();
        
        return conversation;
      } catch (createError: any) {
        logger.error('[CHAT] Failed to create conversation:', { value: createError });
        throw createError;
      }
    }
  }

  // Send message
  async sendMessage(conversation: any, text: string, attributes?: any): Promise<void> {
    if (!conversation) throw new Error('No conversation selected');

    try {
      await conversation.sendMessage(text, attributes);
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('[CHAT] Failed to send message:', error);
      throw error;
    }
  }

  // Send file
  async sendFile(conversation: any, file: File): Promise<void> {
    if (!conversation) throw new Error('No conversation selected');

    // Validate file
    if (file.size > CHAT_CONFIG.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds limit of ${CHAT_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    if (!CHAT_CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
      throw new Error('File type not allowed');
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      await conversation.sendMessage(formData);
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('[CHAT] Failed to send file:', error);
      throw error;
    }
  }

  // Mark message as read
  async markAsRead(conversation: any, messageIndex: number): Promise<void> {
    if (!conversation) return;

    try {
      await conversation.updateLastReadMessageIndex(messageIndex);
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('[CHAT] Failed to mark as read:', error);
    }
  }

  // Send typing indicator
  async sendTyping(conversation): Promise<void> {
    if (!conversation || !CHAT_CONFIG.ENABLE_TYPING_INDICATORS) return;

    try {
      await conversation.typing();
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('[CHAT] Failed to send typing indicator:', error);
    }
  }

  // Get conversation history
  async getMessages(conversation: any, limit: number = CHAT_CONFIG.MESSAGE_PAGE_SIZE): Promise<any[]> {
    if (!conversation) return [];

    try {
      const messages = await conversation.getMessages(limit);
      return messages.items;
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('[CHAT] Failed to get messages:', error);
      return [];
    }
  }

  // Get online participants
  async getOnlineParticipants(conversation): Promise<any[]> {
    if (!conversation) return [];

    try {
      const participants = await conversation.getParticipants();
      return participants.filter((p: any) => p.user?.isOnline);
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('[CHAT] Failed to get participants:', error);
      return [];
    }
  }

  // Leave conversation
  async leaveConversation(conversation): Promise<void> {
    if (!conversation) return;

    try {
      await conversation.leave();
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('[CHAT] Failed to leave conversation:', error);
    }
  }

  // Cleanup
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.shutdown();
      this.client = null;
    }
  }

  // Event handlers
  onMessage(callback: (message: any) => void): void {
    this.onMessageCallback = callback;
  }

  onTyping(callback: (participant: any, typing: boolean) => void): void {
    this.onTypingCallback = callback;
  }

  onPresence(callback: (participant: any, status: string) => void): void {
    this.onPresenceCallback = callback;
  }
}

// Mock Chat Service for development
export class MockChatService {
  private messages: any[] = [];
  private conversations: Map<string, any> = new Map();

  async createConversation(uniqueName: string, friendlyName: string): Promise<any> {
    const conversation = {
      sid: `CH${Math.random().toString(36).substring(2, 15)}mock`,
      uniqueName,
      friendlyName,
      messages: [],
      participants: [],
      createdAt: new Date(),
    };

    this.conversations.set(uniqueName, conversation);
    return conversation;
  }

  async sendMessage(conversationId: string, text: string, author: string): Promise<any> {
    const message = {
      sid: `IM${Math.random().toString(36).substring(2, 15)}mock`,
      conversationId,
      body: text,
      author,
      timestamp: new Date(),
      attributes: {},
    };

    this.messages.push(message);
    
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.messages.push(message);
    }

    logger.debug('[MOCK_CHAT] Message sent:', message);
    return message;
  }

  async getMessages(conversationId: string, limit: number = 30): Promise<any[]> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return [];

    return conversation.messages.slice(-limit);
  }

  async getConversation(uniqueName: string): Promise<any> {
    return this.conversations.get(uniqueName);
  }

  // Simulate typing indicator
  async sendTyping(conversationId: string, user: string): Promise<void> {
    logger.debug(`[MOCK_CHAT] ${user} is typing in ${conversationId}`);
    
    // Simulate typing indicator timeout
    setTimeout(() => {
      logger.debug(`[MOCK_CHAT] ${user} stopped typing in ${conversationId}`);
    }, CHAT_CONFIG.TYPING_INDICATOR_TIMEOUT);
  }
}

// Export mock service for testing
export const mockChatService = new MockChatService();
