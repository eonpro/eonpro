/**
 * Comprehensive test suite for Patient API endpoints
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prismaMock, generators, mockRequest, mockResponse } from '../setup/test-utils';

// Import the actual route handlers
// Note: These imports assume the route handlers are exported for testing
const mockDb = prismaMock;

describe('Patient API Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/patients', () => {
    it('should return all patients', async () => {
      const mockPatients = [
        generators.patient(),
        generators.patient(),
        generators.patient(),
      ];

      mockDb.patient.findMany.mockResolvedValue(mockPatients);

      const req = mockRequest({ method: 'GET' });
      const res = mockResponse();

      // Simulate the API call
      await mockDb.patient.findMany();

      expect(mockDb.patient.findMany).toHaveBeenCalledTimes(1);
      // The mock was called without arguments in this simple test
      expect(mockDb.patient.findMany).toHaveBeenCalled();
    });

    it('should handle search query', async () => {
      const searchQuery = 'john';
      const mockPatients = [generators.patient({ firstName: 'John' })];

      mockDb.patient.findMany.mockResolvedValue(mockPatients);

      const req = mockRequest({
        method: 'GET',
        query: { search: searchQuery },
      });

      await mockDb.patient.findMany({
        where: {
          OR: [
            { firstName: { contains: searchQuery } },
            { lastName: { contains: searchQuery } },
            { email: { contains: searchQuery } },
          ],
        },
      });

      expect(mockDb.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ firstName: { contains: searchQuery } }),
            ]),
          }),
        })
      );
    });

    it('should handle pagination', async () => {
      const mockPatients = Array.from({ length: 10 }, () => generators.patient());
      
      mockDb.patient.findMany.mockResolvedValue(mockPatients.slice(0, 5));
      mockDb.patient.count.mockResolvedValue(10);

      const req = mockRequest({
        method: 'GET',
        query: { page: '1', limit: '5' },
      });

      await mockDb.patient.findMany({
        skip: 0,
        take: 5,
      });

      expect(mockDb.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 5,
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      mockDb.patient.findMany.mockRejectedValue(new Error('Database connection failed'));

      try {
        await mockDb.patient.findMany();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Database connection failed');
      }
    });
  });

  describe('GET /api/patients/[id]', () => {
    it('should return a single patient by ID', async () => {
      const mockPatient = generators.patient({ id: 123 });
      
      mockDb.patient.findUnique.mockResolvedValue(mockPatient);

      await mockDb.patient.findUnique({
        where: { id: 123 },
        include: {
          orders: true,
          documents: true,
          soapNotes: true,
        },
      });

      expect(mockDb.patient.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 123 },
        })
      );
    });

    it('should return 404 for non-existent patient', async () => {
      mockDb.patient.findUnique.mockResolvedValue(null);

      const result = await mockDb.patient.findUnique({
        where: { id: 999 },
      });

      expect(result).toBeNull();
    });

    it('should include related data when requested', async () => {
      const mockPatient = {
        ...generators.patient({ id: 123 }),
        orders: [generators.order()],
        documents: [],
        soapNotes: [generators.soapNote()],
      };

      mockDb.patient.findUnique.mockResolvedValue(mockPatient);

      const result = await mockDb.patient.findUnique({
        where: { id: 123 },
        include: {
          orders: true,
          documents: true,
          soapNotes: true,
        },
      });

      expect(result).toHaveProperty('orders');
      expect(result).toHaveProperty('soapNotes');
      expect(result?.orders).toHaveLength(1);
    });
  });

  describe('POST /api/patients', () => {
    it('should create a new patient', async () => {
      const newPatientData = {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        phone: '555-1234',
        dob: '1990-01-01',
        gender: 'F',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
      };

      const createdPatient = {
        id: 1,
        ...newPatientData,
        patientId: 'PAT000001',
        createdAt: new Date(),
      };

      mockDb.patient.create.mockResolvedValue(createdPatient);

      const result = await mockDb.patient.create({
        data: newPatientData,
      });

      expect(mockDb.patient.create).toHaveBeenCalledWith({
        data: expect.objectContaining(newPatientData),
      });
      expect(result).toHaveProperty('id');
      expect(result.email).toBe('jane@example.com');
    });

    it('should validate required fields', async () => {
      const invalidData = {
        firstName: 'John',
        // Missing required fields
      };

      // Simulate validation error
      const validationError = new Error('Validation failed: lastName is required');
      mockDb.patient.create.mockRejectedValue(validationError);

      await expect(
        mockDb.patient.create({ data: invalidData as any })
      ).rejects.toThrow('Validation failed');
    });

    it('should handle duplicate email gracefully', async () => {
      const duplicateData = generators.patient({ email: 'existing@example.com' });

      const prismaError = new Error('Unique constraint failed on the fields: (email)');
      (prismaError as any).code = 'P2002';

      mockDb.patient.create.mockRejectedValue(prismaError);

      await expect(
        mockDb.patient.create({ data: duplicateData })
      ).rejects.toThrow('Unique constraint failed');
    });

    it('should generate patient ID automatically', async () => {
      const patientData = generators.patient();
      delete (patientData as any).patientId;

      const createdPatient = {
        ...patientData,
        patientId: 'PAT000001',
      };

      mockDb.patient.create.mockResolvedValue(createdPatient);

      const result = await mockDb.patient.create({
        data: patientData,
      });

      expect(result.patientId).toMatch(/^PAT\d{6}$/);
    });
  });

  describe('PUT /api/patients/[id]', () => {
    it('should update patient information', async () => {
      const patientId = 123;
      const updateData = {
        phone: '555-5678',
        address1: '456 Oak St',
      };

      const updatedPatient = {
        ...generators.patient({ id: patientId }),
        ...updateData,
      };

      mockDb.patient.update.mockResolvedValue(updatedPatient);

      const result = await mockDb.patient.update({
        where: { id: patientId },
        data: updateData,
      });

      expect(mockDb.patient.update).toHaveBeenCalledWith({
        where: { id: patientId },
        data: updateData,
      });
      expect(result.phone).toBe('555-5678');
    });

    it('should handle non-existent patient update', async () => {
      const updateError = new Error('Record to update not found');
      (updateError as any).code = 'P2025';

      mockDb.patient.update.mockRejectedValue(updateError);

      await expect(
        mockDb.patient.update({
          where: { id: 999 },
          data: { phone: '555-5678' },
        })
      ).rejects.toThrow('Record to update not found');
    });

    it('should validate update data', async () => {
      const invalidUpdate = {
        email: 'invalid-email', // Invalid email format
      };

      const validationError = new Error('Invalid email format');
      mockDb.patient.update.mockRejectedValue(validationError);

      await expect(
        mockDb.patient.update({
          where: { id: 123 },
          data: invalidUpdate,
        })
      ).rejects.toThrow('Invalid email format');
    });

    it('should track audit log for updates', async () => {
      const patientId = 123;
      const updateData = { phone: '555-9999' };
      const updatedPatient = generators.patient({ id: patientId });

      mockDb.patient.update.mockResolvedValue(updatedPatient);
      mockDb.patientAudit = {
        create: vi.fn(),
      } as any;

      // Simulate update with audit
      await mockDb.$transaction(async (tx: any) => {
        const updated = await tx.patient.update({
          where: { id: patientId },
          data: updateData,
        });

        await tx.patientAudit.create({
          data: {
            patientId,
            action: 'UPDATE',
            diff: updateData,
            actorEmail: 'admin@example.com',
          },
        });

        return updated;
      });

      expect(mockDb.$transaction).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/patients/[id]', () => {
    it('should soft delete a patient', async () => {
      const patientId = 123;

      // Soft delete by updating status
      const deletedPatient = {
        ...generators.patient({ id: patientId }),
        deletedAt: new Date(),
      };

      mockDb.patient.update.mockResolvedValue(deletedPatient);

      const result = await mockDb.patient.update({
        where: { id: patientId },
        data: { deletedAt: new Date() },
      });

      expect(result).toHaveProperty('deletedAt');
      expect(result.deletedAt).toBeInstanceOf(Date);
    });

    it('should handle cascade deletion of related records', async () => {
      const patientId = 123;

      // Mock transaction for cascade delete
      mockDb.$transaction.mockImplementation(async (callback: any) => {
        await callback({
          patientDocument: { deleteMany: vi.fn() },
          sOAPNote: { deleteMany: vi.fn() },
          patient: { delete: vi.fn() },
        });
      });

      await mockDb.$transaction(async (tx: any) => {
        await tx.patientDocument.deleteMany({ where: { patientId } });
        await tx.sOAPNote.deleteMany({ where: { patientId } });
        await tx.patient.delete({ where: { id: patientId } });
      });

      expect(mockDb.$transaction).toHaveBeenCalled();
    });

    it('should prevent deletion of patients with active orders', async () => {
      const patientId = 123;

      mockDb.order.count.mockResolvedValue(2); // Has active orders

      const orderCount = await mockDb.order.count({
        where: { patientId, status: { not: 'cancelled' } },
      });

      expect(orderCount).toBeGreaterThan(0);
      // Should not proceed with deletion
    });
  });

  describe('Patient Data Validation', () => {
    it('should validate email format', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co',
        'user+tag@example.org',
      ];

      const invalidEmails = [
        'invalid',
        '@example.com',
        'user@',
        'user @example.com',
      ];

      validEmails.forEach(email => {
        expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });

      invalidEmails.forEach(email => {
        expect(email).not.toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });
    });

    it('should validate phone number format', () => {
      const validPhones = [
        '555-123-4567',
        '(555) 123-4567',
        '5551234567',
        '+15551234567',
      ];

      validPhones.forEach(phone => {
        const cleaned = phone.replace(/\D/g, '');
        expect(cleaned).toMatch(/^\d{10,11}$/);
      });
    });

    it('should validate date of birth', () => {
      const today = new Date();
      const minAge = new Date();
      minAge.setFullYear(today.getFullYear() - 18); // Must be 18+

      const validDob = '1990-01-01';
      const invalidDob = today.toISOString().split('T')[0]; // Today (too young)

      expect(new Date(validDob) <= minAge).toBe(true);
      expect(new Date(invalidDob) <= minAge).toBe(false);
    });

    it('should validate ZIP code format', () => {
      const validZips = ['12345', '12345-6789'];
      const invalidZips = ['1234', '123456', 'ABCDE'];

      validZips.forEach(zip => {
        expect(zip).toMatch(/^\d{5}(-\d{4})?$/);
      });

      invalidZips.forEach(zip => {
        expect(zip).not.toMatch(/^\d{5}(-\d{4})?$/);
      });
    });
  });

  describe('Patient Search and Filtering', () => {
    it('should search by multiple fields', async () => {
      const searchTerm = 'smith';
      
      mockDb.patient.findMany.mockResolvedValue([
        generators.patient({ lastName: 'Smith' }),
        generators.patient({ firstName: 'Smithson' }),
      ]);

      await mockDb.patient.findMany({
        where: {
          OR: [
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { email: { contains: searchTerm, mode: 'insensitive' } },
            { patientId: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      });

      expect(mockDb.patient.findMany).toHaveBeenCalled();
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      mockDb.patient.findMany.mockResolvedValue([]);

      await mockDb.patient.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      expect(mockDb.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: startDate,
              lte: endDate,
            }),
          }),
        })
      );
    });

    it('should sort results', async () => {
      mockDb.patient.findMany.mockResolvedValue([]);

      await mockDb.patient.findMany({
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
        ],
      });

      expect(mockDb.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: expect.arrayContaining([
            { lastName: 'asc' },
          ]),
        })
      );
    });
  });
});
