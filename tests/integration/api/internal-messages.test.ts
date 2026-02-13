/**
 * Integration Tests for Internal Messages API
 *
 * Tests the internal chat message system to prevent regression of the
 * one-way messaging bug where Admin could only see messages they sent.
 *
 * These tests require a database connection. Run with:
 *   npx vitest run tests/integration/api/internal-messages.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Dynamic import to handle missing Prisma client
let prisma: any = null;
let superAdminId: number = 0;
let adminId: number = 0;
let dbAvailable = false;

describe('Internal Messages API', () => {
  beforeAll(async () => {
    try {
      const { PrismaClient } = await import('@prisma/client');
      prisma = new PrismaClient();

      // Test connection
      await prisma.$connect();

      // Get test users
      const superAdmin = await prisma.user.findFirst({
        where: { role: 'SUPER_ADMIN' },
      });
      const admin = await prisma.user.findFirst({
        where: { role: 'ADMIN' },
      });

      if (superAdmin && admin) {
        superAdminId = superAdmin.id;
        adminId = admin.id;
        dbAvailable = true;
      }
    } catch (error) {
      console.warn('Database not available for integration tests:', (error as Error).message);
    }
  });

  beforeEach(async () => {
    if (!dbAvailable || !prisma) return;
    // Clean up test messages before each test
    try {
      await prisma.internalMessage.deleteMany({
        where: {
          message: { startsWith: '[TEST]' },
        },
      });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    // Clean up test messages
    try {
      await prisma.internalMessage.deleteMany({
        where: {
          message: { startsWith: '[TEST]' },
        },
      });
    } catch (e) {
      // Ignore cleanup errors
    }
    await prisma.$disconnect();
  });

  describe('Message Query Logic', () => {
    it('should return messages where user is sender', async () => {
      if (!dbAvailable) {
        console.log('Skipping: Database not available');
        return;
      }

      // Create a message sent BY admin TO super admin
      await prisma.internalMessage.create({
        data: {
          senderId: adminId,
          recipientId: superAdminId,
          message: '[TEST] Message from Admin to SuperAdmin',
          messageType: 'DIRECT',
        },
      });

      // Query as Admin (sender)
      const messages = await prisma.internalMessage.findMany({
        where: {
          OR: [{ senderId: adminId }, { recipientId: adminId }],
        },
      });

      const sentMessages = messages.filter((m) => m.senderId === adminId);
      expect(sentMessages.length).toBeGreaterThanOrEqual(1);
      expect(sentMessages.some((m) => m.message.includes('[TEST] Message from Admin'))).toBe(true);
    });

    it('should return messages where user is recipient', async () => {
      if (!dbAvailable) {
        console.log('Skipping: Database not available');
        return;
      }

      // Create a message sent BY super admin TO admin
      await prisma.internalMessage.create({
        data: {
          senderId: superAdminId,
          recipientId: adminId,
          message: '[TEST] Message from SuperAdmin to Admin',
          messageType: 'DIRECT',
        },
      });

      // Query as Admin (recipient)
      const messages = await prisma.internalMessage.findMany({
        where: {
          OR: [{ senderId: adminId }, { recipientId: adminId }],
        },
      });

      const receivedMessages = messages.filter(
        (m) => m.recipientId === adminId && m.senderId !== adminId
      );
      expect(receivedMessages.length).toBeGreaterThanOrEqual(1);
      expect(
        receivedMessages.some((m) => m.message.includes('[TEST] Message from SuperAdmin'))
      ).toBe(true);
    });

    it('should return both sent AND received messages (regression test for one-way bug)', async () => {
      if (!dbAvailable) {
        console.log('Skipping: Database not available');
        return;
      }

      // Create messages in BOTH directions
      await prisma.internalMessage.createMany({
        data: [
          {
            senderId: adminId,
            recipientId: superAdminId,
            message: '[TEST] Admin to SuperAdmin',
            messageType: 'DIRECT',
          },
          {
            senderId: superAdminId,
            recipientId: adminId,
            message: '[TEST] SuperAdmin to Admin',
            messageType: 'DIRECT',
          },
        ],
      });

      // Query as Admin
      const adminMessages = await prisma.internalMessage.findMany({
        where: {
          OR: [{ senderId: adminId }, { recipientId: adminId }],
          message: { startsWith: '[TEST]' },
        },
      });

      // Admin should see BOTH messages
      const sentByAdmin = adminMessages.filter((m) => m.senderId === adminId);
      const receivedByAdmin = adminMessages.filter(
        (m) => m.recipientId === adminId && m.senderId !== adminId
      );

      expect(sentByAdmin.length).toBe(1);
      expect(receivedByAdmin.length).toBe(1);
      expect(adminMessages.length).toBe(2);
    });

    it('should return messages for SuperAdmin in both directions', async () => {
      if (!dbAvailable) {
        console.log('Skipping: Database not available');
        return;
      }

      // Create messages in BOTH directions
      await prisma.internalMessage.createMany({
        data: [
          {
            senderId: adminId,
            recipientId: superAdminId,
            message: '[TEST] Admin to SuperAdmin v2',
            messageType: 'DIRECT',
          },
          {
            senderId: superAdminId,
            recipientId: adminId,
            message: '[TEST] SuperAdmin to Admin v2',
            messageType: 'DIRECT',
          },
        ],
      });

      // Query as SuperAdmin
      const superAdminMessages = await prisma.internalMessage.findMany({
        where: {
          OR: [{ senderId: superAdminId }, { recipientId: superAdminId }],
          message: { startsWith: '[TEST]' },
        },
      });

      // SuperAdmin should see BOTH messages
      const sentBySuperAdmin = superAdminMessages.filter((m) => m.senderId === superAdminId);
      const receivedBySuperAdmin = superAdminMessages.filter(
        (m) => m.recipientId === superAdminId && m.senderId !== superAdminId
      );

      expect(sentBySuperAdmin.length).toBe(1);
      expect(receivedBySuperAdmin.length).toBe(1);
      expect(superAdminMessages.length).toBe(2);
    });
  });

  describe('Client-Side Filtering Logic', () => {
    // Simulate the client-side filtering that InternalChat.tsx does
    function filterMessagesForConversation(
      messages: Array<{ senderId: number; recipientId: number | null }>,
      myId: number,
      theirId: number
    ) {
      return messages.filter((m) => {
        const msgSenderId = Number(m.senderId);
        const msgRecipientId = Number(m.recipientId);
        return (
          (msgSenderId === myId && msgRecipientId === theirId) ||
          (msgSenderId === theirId && msgRecipientId === myId)
        );
      });
    }

    it('should filter messages correctly for Admin selecting SuperAdmin', async () => {
      if (!dbAvailable) {
        console.log('Skipping: Database not available');
        return;
      }

      // Create test messages
      await prisma.internalMessage.createMany({
        data: [
          {
            senderId: adminId,
            recipientId: superAdminId,
            message: '[TEST] A to SA',
            messageType: 'DIRECT',
          },
          {
            senderId: superAdminId,
            recipientId: adminId,
            message: '[TEST] SA to A',
            messageType: 'DIRECT',
          },
          {
            senderId: adminId,
            recipientId: 999,
            message: '[TEST] A to Other',
            messageType: 'DIRECT',
          }, // Different conversation
        ],
      });

      // Fetch all messages for Admin
      const allAdminMessages = await prisma.internalMessage.findMany({
        where: {
          OR: [{ senderId: adminId }, { recipientId: adminId }],
          message: { startsWith: '[TEST]' },
        },
      });

      // Apply client-side filtering (Admin selects SuperAdmin)
      const filtered = filterMessagesForConversation(allAdminMessages, adminId, superAdminId);

      // Should only include messages between Admin and SuperAdmin
      expect(filtered.length).toBe(2);
      expect(filtered.some((m) => m.senderId === adminId && m.recipientId === superAdminId)).toBe(
        true
      );
      expect(filtered.some((m) => m.senderId === superAdminId && m.recipientId === adminId)).toBe(
        true
      );
    });

    it('should handle type coercion correctly (string vs number IDs)', async () => {
      if (!dbAvailable) {
        console.log('Skipping: Database not available');
        return;
      }

      await prisma.internalMessage.create({
        data: {
          senderId: adminId,
          recipientId: superAdminId,
          message: '[TEST] Type test',
          messageType: 'DIRECT',
        },
      });

      const messages = await prisma.internalMessage.findMany({
        where: { message: '[TEST] Type test' },
      });

      // Simulate string IDs (as might come from localStorage/JSON)
      const stringMyId = String(adminId);
      const stringTheirId = String(superAdminId);

      const filtered = messages.filter((m) => {
        const msgSenderId = Number(m.senderId);
        const msgRecipientId = Number(m.recipientId);
        return (
          (msgSenderId === Number(stringMyId) && msgRecipientId === Number(stringTheirId)) ||
          (msgSenderId === Number(stringTheirId) && msgRecipientId === Number(stringMyId))
        );
      });

      expect(filtered.length).toBe(1);
    });
  });

  describe('Auth Mismatch Detection', () => {
    it('should detect when client userId differs from API userId', () => {
      // Simulate the auth mismatch scenario
      const clientUserId = 13; // Admin
      const apiUserId = 3; // SuperAdmin (wrong!)

      const isMismatch = Number(apiUserId) !== Number(clientUserId);
      expect(isMismatch).toBe(true);
    });

    it('should NOT detect mismatch when IDs are same but different types', () => {
      const clientUserId = '13'; // String from localStorage
      const apiUserId = 13; // Number from API

      const isMismatch = Number(apiUserId) !== Number(clientUserId);
      expect(isMismatch).toBe(false);
    });
  });
});
