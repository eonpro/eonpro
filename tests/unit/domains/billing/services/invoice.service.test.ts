import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInvoiceService } from '@/domains/billing/services/invoice.service';
import type {
  InvoiceFilterOptions,
  InvoicePaginationOptions,
  UserContext,
} from '@/domains/billing/types';
const mockFindMany = vi.hoisted(() => vi.fn());
const mockCount = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: {
    invoice: {
      findMany: mockFindMany,
      count: mockCount,
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  },
  basePrisma: {},
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPHI: vi.fn((val: string) =>
    val.startsWith('enc:') ? val.replace('enc:', '') : val
  ),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
  },
}));

describe('InvoiceService', () => {
  const service = createInvoiceService();
  const mockUserContext: UserContext = {
    id: 1,
    email: 'admin@clinic.com',
    role: 'admin',
    clinicId: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listInvoices', () => {
    it('returns paginated results with correct shape', async () => {
      const mockInvoices = [
        {
          id: 1,
          invoiceNumber: 'INV-001',
          status: 'paid',
          totalAmount: 100,
          patientId: 10,
          clinicId: 1,
          createdAt: new Date('2024-01-15'),
          paidAt: new Date('2024-01-16'),
          stripeInvoiceId: 'si_123',
          prescriptionProcessed: false,
          patient: {
            id: 10,
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      ];

      mockFindMany.mockResolvedValue(mockInvoices);
      mockCount.mockResolvedValue(1);

      const filter: InvoiceFilterOptions = {};
      const pagination: InvoicePaginationOptions = { limit: 10, offset: 0 };
      const result = await service.listInvoices(filter, pagination);

      expect(result).toMatchObject({
        total: 1,
        limit: 10,
        offset: 0,
        hasMore: false,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 1,
        invoiceNumber: 'INV-001',
        status: 'paid',
        totalAmount: 100,
        patientId: 10,
        patientName: 'John Doe',
        clinicId: 1,
        prescriptionProcessed: false,
      });
    });

    it('applies clinicId filter', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      const filter: InvoiceFilterOptions = { clinicId: 5 };
      await service.listInvoices(filter, {});

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clinicId: 5 }),
        })
      );
      expect(mockCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ clinicId: 5 }) })
      );
    });

    it('applies date range filters (startDate/endDate)', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const filter: InvoiceFilterOptions = { startDate, endDate };
      await service.listInvoices(filter, {});

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: startDate, lte: endDate },
          }),
        })
      );
    });

    it('decrypts patient PHI when building summaries', async () => {
      const mockInvoices = [
        {
          id: 2,
          invoiceNumber: 'INV-002',
          status: 'paid',
          totalAmount: 200,
          patientId: 20,
          clinicId: 1,
          createdAt: new Date('2024-01-15'),
          paidAt: new Date('2024-01-16'),
          stripeInvoiceId: null,
          prescriptionProcessed: false,
          patient: {
            id: 20,
            firstName: 'enc:Jane',
            lastName: 'enc:Smith',
          },
        },
      ];

      mockFindMany.mockResolvedValue(mockInvoices);
      mockCount.mockResolvedValue(1);

      const result = await service.listInvoices({}, {});

      expect(result.data[0].patientName).toBe('Jane Smith');
    });

    it('calculates hasMore correctly', async () => {
      mockFindMany.mockResolvedValue([
        { id: 1, invoiceNumber: 'INV-001', status: 'paid', totalAmount: 100, patientId: 10, clinicId: 1, createdAt: new Date(), paidAt: null, stripeInvoiceId: null, prescriptionProcessed: false, patient: { id: 10, firstName: 'John', lastName: 'Doe' } },
      ]);
      mockCount.mockResolvedValue(15);

      const filter: InvoiceFilterOptions = {};
      const pagination: InvoicePaginationOptions = { limit: 10, offset: 0 };
      const result = await service.listInvoices(filter, pagination);

      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(15);
      expect(result.data).toHaveLength(1);
      expect(result.offset + result.data.length).toBeLessThan(result.total);
    });
  });

  describe('getInvoiceById', () => {
    it('returns null when invoice not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await service.getInvoiceById(999, mockUserContext);

      expect(result).toBeNull();
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: 999 },
        include: { patient: true, items: true },
      });
    });

    it('returns invoice when found', async () => {
      const mockInvoice = {
        id: 1,
        invoiceNumber: 'INV-001',
        clinicId: 1,
        patient: { id: 10 },
        items: [],
      };
      mockFindUnique.mockResolvedValue(mockInvoice);

      const result = await service.getInvoiceById(1, mockUserContext);

      expect(result).toEqual(mockInvoice);
    });
  });

  describe('markPrescriptionProcessed', () => {
    it('updates the invoice', async () => {
      mockUpdate.mockResolvedValue({ id: 1, prescriptionProcessed: true });

      await service.markPrescriptionProcessed(1, 42);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          prescriptionProcessed: true,
          prescriptionProcessedBy: 42,
        }),
      });
      expect(mockUpdate.mock.calls[0][0].data.prescriptionProcessedAt).toBeInstanceOf(Date);
    });

    it('accepts null providerId', async () => {
      mockUpdate.mockResolvedValue({ id: 2, prescriptionProcessed: true });

      await service.markPrescriptionProcessed(2, null);

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 2 },
        data: expect.objectContaining({
          prescriptionProcessed: true,
          prescriptionProcessedBy: null,
        }),
      });
    });
  });
});
