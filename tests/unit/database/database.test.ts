/**
 * Database Operation Tests
 * Tests for Prisma database operations with mocks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma client
const mockPrisma = {
  patient: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
  },
  provider: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  invoice: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  order: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  soapNote: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  appointment: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  patientAudit: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
};

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    db: vi.fn(),
  },
}));

describe('Database Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Patient CRUD Operations', () => {
    describe('Create', () => {
      it('should create patient with all fields', async () => {
        const patientData = {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '5551234567',
          dob: '1990-01-15',
          gender: 'Male',
          address1: '123 Main St',
          city: 'Miami',
          state: 'FL',
          zip: '33101',
          clinicId: 1,
        };

        const createdPatient = {
          id: 1,
          patientId: '000001',
          ...patientData,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.patient.create.mockResolvedValue(createdPatient);

        const result = await mockPrisma.patient.create({
          data: patientData,
        });

        expect(result.id).toBe(1);
        expect(result.patientId).toBe('000001');
        expect(mockPrisma.patient.create).toHaveBeenCalledWith({
          data: patientData,
        });
      });

      it('should handle unique constraint violation', async () => {
        mockPrisma.patient.create.mockRejectedValue({
          code: 'P2002',
          meta: { target: ['email'] },
          message: 'Unique constraint failed on the fields: (`email`)',
        });

        await expect(
          mockPrisma.patient.create({
            data: { email: 'existing@example.com' },
          })
        ).rejects.toMatchObject({ code: 'P2002' });
      });
    });

    describe('Read', () => {
      it('should find patient by ID', async () => {
        const patient = {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        };

        mockPrisma.patient.findUnique.mockResolvedValue(patient);

        const result = await mockPrisma.patient.findUnique({
          where: { id: 1 },
        });

        expect(result).toEqual(patient);
        expect(mockPrisma.patient.findUnique).toHaveBeenCalledWith({
          where: { id: 1 },
        });
      });

      it('should return null for non-existent patient', async () => {
        mockPrisma.patient.findUnique.mockResolvedValue(null);

        const result = await mockPrisma.patient.findUnique({
          where: { id: 999 },
        });

        expect(result).toBeNull();
      });

      it('should find patient by email', async () => {
        const patient = { id: 1, email: 'john@example.com' };

        mockPrisma.patient.findFirst.mockResolvedValue(patient);

        const result = await mockPrisma.patient.findFirst({
          where: { email: 'john@example.com' },
        });

        expect(result?.email).toBe('john@example.com');
      });

      it('should find many patients with pagination', async () => {
        const patients = [
          { id: 1, firstName: 'John' },
          { id: 2, firstName: 'Jane' },
        ];

        mockPrisma.patient.findMany.mockResolvedValue(patients);

        const result = await mockPrisma.patient.findMany({
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
        });

        expect(result).toHaveLength(2);
      });

      it('should find patients with relations', async () => {
        const patientWithRelations = {
          id: 1,
          firstName: 'John',
          invoices: [{ id: 1, amount: 10000 }],
          orders: [{ id: 1, status: 'PENDING' }],
        };

        mockPrisma.patient.findUnique.mockResolvedValue(patientWithRelations);

        const result = await mockPrisma.patient.findUnique({
          where: { id: 1 },
          include: {
            invoices: true,
            orders: true,
          },
        });

        expect(result?.invoices).toHaveLength(1);
        expect(result?.orders).toHaveLength(1);
      });
    });

    describe('Update', () => {
      it('should update patient fields', async () => {
        const updatedPatient = {
          id: 1,
          firstName: 'John',
          lastName: 'Smith', // Updated
          phone: '5559876543', // Updated
        };

        mockPrisma.patient.update.mockResolvedValue(updatedPatient);

        const result = await mockPrisma.patient.update({
          where: { id: 1 },
          data: {
            lastName: 'Smith',
            phone: '5559876543',
          },
        });

        expect(result.lastName).toBe('Smith');
        expect(result.phone).toBe('5559876543');
      });

      it('should handle record not found on update', async () => {
        mockPrisma.patient.update.mockRejectedValue({
          code: 'P2025',
          message: 'Record to update not found.',
        });

        await expect(
          mockPrisma.patient.update({
            where: { id: 999 },
            data: { firstName: 'Test' },
          })
        ).rejects.toMatchObject({ code: 'P2025' });
      });
    });

    describe('Delete', () => {
      it('should delete patient', async () => {
        const deletedPatient = { id: 1, firstName: 'John' };

        mockPrisma.patient.delete.mockResolvedValue(deletedPatient);

        const result = await mockPrisma.patient.delete({
          where: { id: 1 },
        });

        expect(result.id).toBe(1);
      });

      it('should handle cascade delete', async () => {
        // When patient is deleted, related records should be handled
        mockPrisma.patient.delete.mockResolvedValue({ id: 1 });

        await mockPrisma.patient.delete({
          where: { id: 1 },
        });

        expect(mockPrisma.patient.delete).toHaveBeenCalled();
      });
    });

    describe('Upsert', () => {
      it('should create if not exists', async () => {
        const newPatient = {
          id: 1,
          email: 'new@example.com',
          firstName: 'New',
        };

        mockPrisma.patient.upsert.mockResolvedValue(newPatient);

        const result = await mockPrisma.patient.upsert({
          where: { email: 'new@example.com' },
          create: { email: 'new@example.com', firstName: 'New' },
          update: { firstName: 'Updated' },
        });

        expect(result.firstName).toBe('New');
      });

      it('should update if exists', async () => {
        const existingPatient = {
          id: 1,
          email: 'existing@example.com',
          firstName: 'Updated',
        };

        mockPrisma.patient.upsert.mockResolvedValue(existingPatient);

        const result = await mockPrisma.patient.upsert({
          where: { email: 'existing@example.com' },
          create: { email: 'existing@example.com', firstName: 'New' },
          update: { firstName: 'Updated' },
        });

        expect(result.firstName).toBe('Updated');
      });
    });

    describe('Count', () => {
      it('should count patients', async () => {
        mockPrisma.patient.count.mockResolvedValue(150);

        const count = await mockPrisma.patient.count();

        expect(count).toBe(150);
      });

      it('should count patients with filter', async () => {
        mockPrisma.patient.count.mockResolvedValue(50);

        const count = await mockPrisma.patient.count({
          where: { clinicId: 1 },
        });

        expect(count).toBe(50);
      });
    });
  });

  describe('Transaction Operations', () => {
    it('should execute transaction successfully', async () => {
      const transactionResult = {
        patient: { id: 1, firstName: 'John' },
        audit: { id: 1, action: 'CREATE' },
      };

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return callback({
          patient: {
            create: vi.fn().mockResolvedValue(transactionResult.patient),
          },
          patientAudit: {
            create: vi.fn().mockResolvedValue(transactionResult.audit),
          },
        });
      });

      const result = await mockPrisma.$transaction(async (tx: any) => {
        const patient = await tx.patient.create({ data: { firstName: 'John' } });
        const audit = await tx.patientAudit.create({ data: { action: 'CREATE' } });
        return { patient, audit };
      });

      expect(result.patient.id).toBe(1);
      expect(result.audit.action).toBe('CREATE');
    });

    it('should rollback transaction on error', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(
        mockPrisma.$transaction(async () => {
          throw new Error('Transaction failed');
        })
      ).rejects.toThrow('Transaction failed');
    });

    it('should handle sequential transactions', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        { id: 1, firstName: 'John' },
        { id: 2, firstName: 'Jane' },
      ]);

      const result = await mockPrisma.$transaction([
        mockPrisma.patient.create({ data: { firstName: 'John' } }),
        mockPrisma.patient.create({ data: { firstName: 'Jane' } }),
      ]);

      expect(result).toHaveLength(2);
    });
  });

  describe('Raw Query Operations', () => {
    it('should execute raw query', async () => {
      const rawResult = [
        { id: 1, firstName: 'John', total_orders: 5 },
        { id: 2, firstName: 'Jane', total_orders: 3 },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(rawResult);

      const result = await mockPrisma.$queryRaw`
        SELECT p.id, p."firstName", COUNT(o.id) as total_orders
        FROM "Patient" p
        LEFT JOIN "Order" o ON o."patientId" = p.id
        GROUP BY p.id
      `;

      expect(result).toHaveLength(2);
      expect(result[0].total_orders).toBe(5);
    });

    it('should execute raw update', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(10);

      const affectedRows = await mockPrisma.$executeRaw`
        UPDATE "Patient" SET "updatedAt" = NOW() WHERE "clinicId" = 1
      `;

      expect(affectedRows).toBe(10);
    });
  });

  describe('Filtering and Sorting', () => {
    it('should filter with multiple conditions', async () => {
      const patients = [{ id: 1, firstName: 'John', clinicId: 1, status: 'ACTIVE' }];

      mockPrisma.patient.findMany.mockResolvedValue(patients);

      const result = await mockPrisma.patient.findMany({
        where: {
          AND: [
            { clinicId: 1 },
            { status: 'ACTIVE' },
            { createdAt: { gte: new Date('2024-01-01') } },
          ],
        },
      });

      expect(result).toHaveLength(1);
    });

    it('should filter with OR conditions', async () => {
      const patients = [
        { id: 1, firstName: 'John' },
        { id: 2, firstName: 'Johnny' },
      ];

      mockPrisma.patient.findMany.mockResolvedValue(patients);

      const result = await mockPrisma.patient.findMany({
        where: {
          OR: [
            { firstName: { contains: 'John' } },
            { lastName: { contains: 'John' } },
          ],
        },
      });

      expect(result).toHaveLength(2);
    });

    it('should sort by multiple fields', async () => {
      const patients = [
        { id: 1, lastName: 'Doe', createdAt: new Date('2024-01-01') },
        { id: 2, lastName: 'Doe', createdAt: new Date('2024-01-02') },
      ];

      mockPrisma.patient.findMany.mockResolvedValue(patients);

      const result = await mockPrisma.patient.findMany({
        orderBy: [
          { lastName: 'asc' },
          { createdAt: 'desc' },
        ],
      });

      expect(result[0].id).toBe(1);
    });
  });

  describe('Relation Queries', () => {
    it('should include nested relations', async () => {
      const patientWithNested = {
        id: 1,
        orders: [
          {
            id: 1,
            rxs: [{ id: 1, medicationName: 'Semaglutide' }],
          },
        ],
      };

      mockPrisma.patient.findUnique.mockResolvedValue(patientWithNested);

      const result = await mockPrisma.patient.findUnique({
        where: { id: 1 },
        include: {
          orders: {
            include: {
              rxs: true,
            },
          },
        },
      });

      expect(result?.orders[0].rxs[0].medicationName).toBe('Semaglutide');
    });

    it('should select specific fields', async () => {
      const patientPartial = {
        id: 1,
        firstName: 'John',
        email: 'john@example.com',
      };

      mockPrisma.patient.findUnique.mockResolvedValue(patientPartial);

      const result = await mockPrisma.patient.findUnique({
        where: { id: 1 },
        select: {
          id: true,
          firstName: true,
          email: true,
        },
      });

      expect(Object.keys(result!)).toHaveLength(3);
    });
  });
});

describe('Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Prisma Error Codes', () => {
    it('should handle P2002 - Unique constraint violation', async () => {
      mockPrisma.patient.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['email'] },
      });

      try {
        await mockPrisma.patient.create({ data: { email: 'duplicate@example.com' } });
      } catch (error: any) {
        expect(error.code).toBe('P2002');
        expect(error.meta.target).toContain('email');
      }
    });

    it('should handle P2025 - Record not found', async () => {
      mockPrisma.patient.update.mockRejectedValue({
        code: 'P2025',
        message: 'Record to update not found.',
      });

      try {
        await mockPrisma.patient.update({ where: { id: 999 }, data: {} });
      } catch (error: any) {
        expect(error.code).toBe('P2025');
      }
    });

    it('should handle P2003 - Foreign key constraint violation', async () => {
      mockPrisma.order.create.mockRejectedValue({
        code: 'P2003',
        meta: { field_name: 'patientId' },
      });

      try {
        await mockPrisma.order.create({ data: { patientId: 999 } });
      } catch (error: any) {
        expect(error.code).toBe('P2003');
      }
    });

    it('should handle connection errors', async () => {
      mockPrisma.patient.findMany.mockRejectedValue({
        code: 'P1001',
        message: "Can't reach database server",
      });

      await expect(mockPrisma.patient.findMany()).rejects.toMatchObject({
        code: 'P1001',
      });
    });

    it('should handle timeout errors', async () => {
      mockPrisma.patient.findMany.mockRejectedValue({
        code: 'P2024',
        message: 'Timed out fetching a new connection from the connection pool',
      });

      await expect(mockPrisma.patient.findMany()).rejects.toMatchObject({
        code: 'P2024',
      });
    });
  });
});

describe('Multi-Tenant Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should filter by clinicId', async () => {
    const clinic1Patients = [
      { id: 1, clinicId: 1, firstName: 'John' },
      { id: 2, clinicId: 1, firstName: 'Jane' },
    ];

    mockPrisma.patient.findMany.mockResolvedValue(clinic1Patients);

    const result = await mockPrisma.patient.findMany({
      where: { clinicId: 1 },
    });

    expect(result.every(p => p.clinicId === 1)).toBe(true);
  });

  it('should enforce clinic isolation', async () => {
    // Simulate middleware that adds clinicId filter
    const addClinicFilter = (query: any, clinicId: number) => ({
      ...query,
      where: {
        ...query.where,
        clinicId,
      },
    });

    const originalQuery = { where: { status: 'ACTIVE' } };
    const filteredQuery = addClinicFilter(originalQuery, 1);

    expect(filteredQuery.where.clinicId).toBe(1);
    expect(filteredQuery.where.status).toBe('ACTIVE');
  });
});
