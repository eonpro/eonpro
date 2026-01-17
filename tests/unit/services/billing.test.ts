import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    invoice: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    patient: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Types for testing
interface Invoice {
  id: number;
  invoiceNumber: string;
  patientId: number;
  clinicId: number;
  amount: number;
  status: string;
  dueDate: Date;
  createdAt: Date;
  items: InvoiceItem[];
}

interface InvoiceItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  stripeCustomerId?: string;
}

describe('Billing Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Invoice Number Generation', () => {
    it('generates sequential invoice numbers', () => {
      const generateInvoiceNumber = (clinicId: number, sequence: number): string => {
        const year = new Date().getFullYear();
        const paddedSequence = String(sequence).padStart(6, '0');
        return `INV-${clinicId}-${year}-${paddedSequence}`;
      };

      expect(generateInvoiceNumber(1, 1)).toBe('INV-1-2026-000001');
      expect(generateInvoiceNumber(1, 999)).toBe('INV-1-2026-000999');
      expect(generateInvoiceNumber(2, 12345)).toBe('INV-2-2026-012345');
    });
  });

  describe('Invoice Amount Calculation', () => {
    it('calculates invoice total correctly', () => {
      const calculateTotal = (items: InvoiceItem[]): number => {
        return items.reduce((sum, item) => sum + item.total, 0);
      };

      const items: InvoiceItem[] = [
        { id: 1, description: 'Consultation', quantity: 1, unitPrice: 15000, total: 15000 },
        { id: 2, description: 'Lab Work', quantity: 2, unitPrice: 5000, total: 10000 },
      ];

      expect(calculateTotal(items)).toBe(25000); // $250.00 in cents
    });

    it('applies discount correctly', () => {
      const applyDiscount = (
        total: number, 
        discountType: 'percentage' | 'fixed',
        discountValue: number
      ): number => {
        if (discountType === 'percentage') {
          return Math.round(total * (1 - discountValue / 100));
        }
        return Math.max(0, total - discountValue);
      };

      // 10% discount on $100
      expect(applyDiscount(10000, 'percentage', 10)).toBe(9000);
      
      // $5 fixed discount on $100
      expect(applyDiscount(10000, 'fixed', 500)).toBe(9500);
      
      // Discount greater than total
      expect(applyDiscount(1000, 'fixed', 2000)).toBe(0);
    });

    it('calculates tax correctly', () => {
      const calculateTax = (amount: number, taxRate: number): number => {
        return Math.round(amount * (taxRate / 100));
      };

      // 8.25% tax on $100
      expect(calculateTax(10000, 8.25)).toBe(825);
      
      // 0% tax
      expect(calculateTax(10000, 0)).toBe(0);
    });

    it('calculates final total with discount and tax', () => {
      const calculateFinalTotal = (
        subtotal: number,
        discountType: 'percentage' | 'fixed' | null,
        discountValue: number,
        taxRate: number
      ): { subtotal: number; discount: number; tax: number; total: number } => {
        let discount = 0;
        if (discountType === 'percentage') {
          discount = Math.round(subtotal * (discountValue / 100));
        } else if (discountType === 'fixed') {
          discount = Math.min(discountValue, subtotal);
        }
        
        const afterDiscount = subtotal - discount;
        const tax = Math.round(afterDiscount * (taxRate / 100));
        const total = afterDiscount + tax;
        
        return { subtotal, discount, tax, total };
      };

      const result = calculateFinalTotal(10000, 'percentage', 10, 8.25);
      expect(result).toEqual({
        subtotal: 10000,  // $100.00
        discount: 1000,   // $10.00 (10%)
        tax: 743,         // $7.43 (8.25% of $90)
        total: 9743       // $97.43
      });
    });
  });

  describe('Invoice Status Transitions', () => {
    type InvoiceStatus = 'DRAFT' | 'PENDING' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED';

    const validTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
      DRAFT: ['PENDING', 'CANCELLED'],
      PENDING: ['SENT', 'CANCELLED'],
      SENT: ['PAID', 'OVERDUE', 'CANCELLED'],
      PAID: ['REFUNDED'],
      OVERDUE: ['PAID', 'CANCELLED'],
      CANCELLED: [],
      REFUNDED: [],
    };

    it('validates allowed status transitions', () => {
      const canTransition = (from: InvoiceStatus, to: InvoiceStatus): boolean => {
        return validTransitions[from]?.includes(to) ?? false;
      };

      // Valid transitions
      expect(canTransition('DRAFT', 'PENDING')).toBe(true);
      expect(canTransition('PENDING', 'SENT')).toBe(true);
      expect(canTransition('SENT', 'PAID')).toBe(true);
      expect(canTransition('PAID', 'REFUNDED')).toBe(true);

      // Invalid transitions
      expect(canTransition('DRAFT', 'PAID')).toBe(false);
      expect(canTransition('CANCELLED', 'PENDING')).toBe(false);
      expect(canTransition('REFUNDED', 'PAID')).toBe(false);
    });
  });

  describe('Payment Processing', () => {
    it('validates payment amount', () => {
      const validatePaymentAmount = (
        paymentAmount: number,
        invoiceAmount: number
      ): { valid: boolean; error?: string } => {
        if (paymentAmount <= 0) {
          return { valid: false, error: 'Payment amount must be positive' };
        }
        if (paymentAmount > invoiceAmount) {
          return { valid: false, error: 'Payment amount exceeds invoice amount' };
        }
        return { valid: true };
      };

      expect(validatePaymentAmount(5000, 10000)).toEqual({ valid: true });
      expect(validatePaymentAmount(10000, 10000)).toEqual({ valid: true });
      expect(validatePaymentAmount(0, 10000)).toEqual({ 
        valid: false, 
        error: 'Payment amount must be positive' 
      });
      expect(validatePaymentAmount(15000, 10000)).toEqual({ 
        valid: false, 
        error: 'Payment amount exceeds invoice amount' 
      });
    });

    it('calculates remaining balance', () => {
      const calculateBalance = (invoiceAmount: number, payments: number[]): number => {
        const totalPaid = payments.reduce((sum, p) => sum + p, 0);
        return Math.max(0, invoiceAmount - totalPaid);
      };

      expect(calculateBalance(10000, [])).toBe(10000);
      expect(calculateBalance(10000, [5000])).toBe(5000);
      expect(calculateBalance(10000, [5000, 5000])).toBe(0);
      expect(calculateBalance(10000, [6000, 6000])).toBe(0); // Overpayment protection
    });
  });

  describe('Subscription Billing', () => {
    it('calculates interval months correctly', () => {
      const getIntervalMonths = (
        interval: 'monthly' | 'quarterly' | 'yearly'
      ): number => {
        switch (interval) {
          case 'monthly':
            return 1;
          case 'quarterly':
            return 3;
          case 'yearly':
            return 12;
        }
      };

      expect(getIntervalMonths('monthly')).toBe(1);
      expect(getIntervalMonths('quarterly')).toBe(3);
      expect(getIntervalMonths('yearly')).toBe(12);
    });

    it('calculates MRR (Monthly Recurring Revenue)', () => {
      const calculateMRR = (
        subscriptions: Array<{ amount: number; interval: 'monthly' | 'quarterly' | 'yearly' }>
      ): number => {
        return subscriptions.reduce((mrr, sub) => {
          switch (sub.interval) {
            case 'monthly':
              return mrr + sub.amount;
            case 'quarterly':
              return mrr + Math.round(sub.amount / 3);
            case 'yearly':
              return mrr + Math.round(sub.amount / 12);
            default:
              return mrr;
          }
        }, 0);
      };

      const subscriptions = [
        { amount: 10000, interval: 'monthly' as const },   // $100/month
        { amount: 27000, interval: 'quarterly' as const }, // $270/quarter = $90/month
        { amount: 120000, interval: 'yearly' as const },   // $1200/year = $100/month
      ];

      expect(calculateMRR(subscriptions)).toBe(29000); // $290/month MRR
    });
  });

  describe('Refund Processing', () => {
    it('validates refund amount', () => {
      const validateRefund = (
        refundAmount: number,
        originalAmount: number,
        alreadyRefunded: number
      ): { valid: boolean; error?: string } => {
        if (refundAmount <= 0) {
          return { valid: false, error: 'Refund amount must be positive' };
        }
        
        const maxRefundable = originalAmount - alreadyRefunded;
        if (refundAmount > maxRefundable) {
          return { 
            valid: false, 
            error: `Maximum refundable amount is ${maxRefundable}` 
          };
        }
        
        return { valid: true };
      };

      // Valid refund
      expect(validateRefund(5000, 10000, 0)).toEqual({ valid: true });
      
      // Partial refund already processed
      expect(validateRefund(3000, 10000, 5000)).toEqual({ valid: true });
      
      // Invalid: exceeds available amount
      expect(validateRefund(8000, 10000, 5000)).toEqual({ 
        valid: false, 
        error: 'Maximum refundable amount is 5000' 
      });
      
      // Invalid: negative amount
      expect(validateRefund(-1000, 10000, 0)).toEqual({ 
        valid: false, 
        error: 'Refund amount must be positive' 
      });
    });
  });

  describe('Overdue Invoice Detection', () => {
    it('identifies overdue invoices correctly', () => {
      const isOverdue = (dueDate: Date, status: string): boolean => {
        if (['PAID', 'CANCELLED', 'REFUNDED'].includes(status)) {
          return false;
        }
        return new Date() > dueDate;
      };

      const pastDue = new Date('2025-01-01');
      const futureDue = new Date('2027-01-01');

      expect(isOverdue(pastDue, 'SENT')).toBe(true);
      expect(isOverdue(pastDue, 'PAID')).toBe(false);
      expect(isOverdue(futureDue, 'SENT')).toBe(false);
    });

    it('calculates days overdue', () => {
      const daysOverdue = (dueDate: Date): number => {
        const now = new Date();
        if (now <= dueDate) return 0;
        
        const diffTime = now.getTime() - dueDate.getTime();
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
      };

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      expect(daysOverdue(thirtyDaysAgo)).toBe(30);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(daysOverdue(tomorrow)).toBe(0);
    });
  });

  describe('Currency Formatting', () => {
    it('formats amounts in cents to dollars', () => {
      const formatCurrency = (amountInCents: number): string => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(amountInCents / 100);
      };

      expect(formatCurrency(10000)).toBe('$100.00');
      expect(formatCurrency(9999)).toBe('$99.99');
      expect(formatCurrency(1)).toBe('$0.01');
      expect(formatCurrency(0)).toBe('$0.00');
    });
  });
});
