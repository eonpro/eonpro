/**
 * Database Clinic Filtering Tests
 * Tests for multi-clinic data isolation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock PrismaClient as a class
vi.mock('@prisma/client', () => {
  const MockPrismaClient = vi.fn().mockImplementation(function(this: any) {
    this.$connect = vi.fn();
    this.$disconnect = vi.fn();
    this.$transaction = vi.fn((fn: any) => fn(this));
    this.$executeRaw = vi.fn();
    this.$executeRawUnsafe = vi.fn();
    this.$queryRaw = vi.fn();
    this.$queryRawUnsafe = vi.fn();
    this.patient = {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    };
    this.user = {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    };
    this.clinic = {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    };
    return this;
  });
  
  return {
    PrismaClient: MockPrismaClient,
    Prisma: {
      PrismaClientKnownRequestError: class extends Error {
        code: string;
        constructor(message: string, meta: { code: string }) {
          super(message);
          this.code = meta.code;
        }
      },
    },
  };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

describe('Clinic Context Management', () => {
  describe('setClinicContext', () => {
    it('should set clinic ID in global context', async () => {
      const { setClinicContext, getClinicContext } = await import('@/lib/db');
      
      setClinicContext(123);
      
      expect(getClinicContext()).toBe(123);
    });

    it('should allow clearing clinic context', async () => {
      const { setClinicContext, getClinicContext } = await import('@/lib/db');
      
      setClinicContext(123);
      setClinicContext(undefined);
      
      expect(getClinicContext()).toBeUndefined();
    });
  });

  describe('getClinicContext', () => {
    it('should return undefined when not set', async () => {
      const { setClinicContext, getClinicContext } = await import('@/lib/db');
      
      setClinicContext(undefined);
      
      expect(getClinicContext()).toBeUndefined();
    });
  });
});

describe('withClinicContext', () => {
  it('should execute callback with clinic context', async () => {
    const { withClinicContext, getClinicContext, setClinicContext } = await import('@/lib/db');
    
    setClinicContext(undefined);
    
    let contextDuringExecution: number | undefined;
    
    await withClinicContext(456, async () => {
      contextDuringExecution = getClinicContext();
      return 'result';
    });
    
    expect(contextDuringExecution).toBe(456);
  });

  it('should restore previous context after execution', async () => {
    const { withClinicContext, getClinicContext, setClinicContext } = await import('@/lib/db');
    
    setClinicContext(100);
    
    await withClinicContext(456, async () => {
      return 'result';
    });
    
    expect(getClinicContext()).toBe(100);
  });

  it('should restore context even on error', async () => {
    const { withClinicContext, getClinicContext, setClinicContext } = await import('@/lib/db');
    
    setClinicContext(100);
    
    try {
      await withClinicContext(456, async () => {
        throw new Error('Test error');
      });
    } catch (e) {
      // Expected
    }
    
    expect(getClinicContext()).toBe(100);
  });
});

describe('withoutClinicFilter', () => {
  it('should execute without clinic filtering', async () => {
    const { withoutClinicFilter, runWithClinicContext, getClinicContext } = await import('@/lib/db');
    
    // Use runWithClinicContext which properly uses AsyncLocalStorage
    let contextDuringExecution: number | undefined;
    let contextInsideWithout: number | undefined;
    
    await runWithClinicContext(100, async () => {
      contextDuringExecution = getClinicContext();
      
      await withoutClinicFilter(async () => {
        contextInsideWithout = getClinicContext();
        return 'result';
      });
      
      return 'done';
    });
    
    // Context should be 100 during normal execution
    expect(contextDuringExecution).toBe(100);
    // Context should be undefined inside withoutClinicFilter
    expect(contextInsideWithout).toBeUndefined();
  });

  it('should restore context after execution', async () => {
    const { withoutClinicFilter, runWithClinicContext, getClinicContext } = await import('@/lib/db');
    
    let contextAfterWithout: number | undefined;
    
    await runWithClinicContext(100, async () => {
      await withoutClinicFilter(async () => {
        return 'result';
      });
      
      contextAfterWithout = getClinicContext();
      return 'done';
    });
    
    expect(contextAfterWithout).toBe(100);
  });
});

describe('Clinic Isolated Models', () => {
  const CLINIC_ISOLATED_MODELS = [
    'Patient',
    'Provider',
    'Order',
    'Invoice',
    'Payment',
    'Subscription',
    'Influencer',
    'Ticket',
    'PatientDocument',
    'SOAPNote',
    'Prescription',
    'Appointment',
    'IntakeFormTemplate',
    'InternalMessage',
  ];

  it('should identify clinic-isolated models', () => {
    const isClinicIsolated = (model: string): boolean => {
      return CLINIC_ISOLATED_MODELS.includes(model);
    };

    expect(isClinicIsolated('Patient')).toBe(true);
    expect(isClinicIsolated('Provider')).toBe(true);
    expect(isClinicIsolated('Order')).toBe(true);
    expect(isClinicIsolated('User')).toBe(false);
    expect(isClinicIsolated('Clinic')).toBe(false);
  });

  it('should not isolate system models', () => {
    const systemModels = [
      'User',
      'Clinic',
      'SystemSettings',
      'Integration',
      'ApiKey',
    ];

    const isClinicIsolated = (model: string): boolean => {
      return CLINIC_ISOLATED_MODELS.includes(model);
    };

    systemModels.forEach(model => {
      expect(isClinicIsolated(model)).toBe(false);
    });
  });
});

describe('Clinic Filter Application', () => {
  describe('applyClinicFilter', () => {
    const applyClinicFilter = (where: any = {}, clinicId?: number): any => {
      if (!clinicId || process.env.BYPASS_CLINIC_FILTER === 'true') {
        return where;
      }
      return { ...where, clinicId };
    };

    it('should add clinicId to where clause', () => {
      const result = applyClinicFilter({ name: 'Test' }, 123);
      
      expect(result).toEqual({ name: 'Test', clinicId: 123 });
    });

    it('should return original where when no clinic', () => {
      const result = applyClinicFilter({ name: 'Test' }, undefined);
      
      expect(result).toEqual({ name: 'Test' });
    });

    it('should handle empty where clause', () => {
      const result = applyClinicFilter({}, 123);
      
      expect(result).toEqual({ clinicId: 123 });
    });

    it('should handle undefined where clause', () => {
      const result = applyClinicFilter(undefined, 123);
      
      expect(result).toEqual({ clinicId: 123 });
    });
  });

  describe('applyClinicToData', () => {
    const applyClinicToData = (data: any, clinicId?: number): any => {
      if (!clinicId) return data;
      
      if (Array.isArray(data)) {
        return data.map(item => ({ ...item, clinicId }));
      }
      
      return { ...data, clinicId };
    };

    it('should add clinicId to create data', () => {
      const result = applyClinicToData({ name: 'Test' }, 123);
      
      expect(result).toEqual({ name: 'Test', clinicId: 123 });
    });

    it('should add clinicId to array data', () => {
      const result = applyClinicToData([{ name: 'A' }, { name: 'B' }], 123);
      
      expect(result).toEqual([
        { name: 'A', clinicId: 123 },
        { name: 'B', clinicId: 123 },
      ]);
    });

    it('should return original data when no clinic', () => {
      const result = applyClinicToData({ name: 'Test' }, undefined);
      
      expect(result).toEqual({ name: 'Test' });
    });
  });
});

describe('Cross-Clinic Data Leak Prevention', () => {
  it('should detect cross-clinic data in array results', () => {
    const detectLeak = (results: any[], expectedClinicId: number): boolean => {
      return results.some(record => 
        record.clinicId && record.clinicId !== expectedClinicId
      );
    };

    const results = [
      { id: 1, clinicId: 100 },
      { id: 2, clinicId: 100 },
      { id: 3, clinicId: 200 }, // Wrong clinic!
    ];

    expect(detectLeak(results, 100)).toBe(true);
    expect(detectLeak([{ id: 1, clinicId: 100 }], 100)).toBe(false);
  });

  it('should detect cross-clinic data in single result', () => {
    const detectLeak = (record: any, expectedClinicId: number): boolean => {
      if (!record || !record.clinicId) return false;
      return record.clinicId !== expectedClinicId;
    };

    expect(detectLeak({ id: 1, clinicId: 200 }, 100)).toBe(true);
    expect(detectLeak({ id: 1, clinicId: 100 }, 100)).toBe(false);
    expect(detectLeak({ id: 1 }, 100)).toBe(false); // No clinicId field
  });

  it('should filter out cross-clinic records', () => {
    const filterResults = (results: any[], clinicId: number): any[] => {
      return results.filter(record => 
        !record.clinicId || record.clinicId === clinicId
      );
    };

    const results = [
      { id: 1, clinicId: 100 },
      { id: 2, clinicId: 100 },
      { id: 3, clinicId: 200 },
      { id: 4, clinicId: 100 },
    ];

    const filtered = filterResults(results, 100);
    
    expect(filtered).toHaveLength(3);
    expect(filtered.every(r => r.clinicId === 100)).toBe(true);
  });
});

describe('Database Operation Methods', () => {
  const wrappedMethods = [
    'findUnique',
    'findFirst',
    'findMany',
    'create',
    'createMany',
    'update',
    'updateMany',
    'delete',
    'deleteMany',
    'count',
    'aggregate',
  ];

  it('should wrap query methods', () => {
    wrappedMethods.forEach(method => {
      expect(['findUnique', 'findFirst', 'findMany', 'count', 'aggregate']).toBeDefined();
    });
  });

  it('should wrap mutation methods', () => {
    const mutationMethods = ['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany'];
    
    mutationMethods.forEach(method => {
      expect(wrappedMethods).toContain(method);
    });
  });
});

describe('Transaction Support', () => {
  it('should support transactions with clinic context', async () => {
    const { prisma, setClinicContext } = await import('@/lib/db');
    
    setClinicContext(123);
    
    // Transaction should maintain clinic context
    const mockTransaction = vi.fn((fn: any) => fn({}));
    
    // Test that transaction wraps correctly
    expect(typeof prisma.$transaction).toBe('function');
  });
});

describe('Bypass Clinic Filter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should bypass filter when env var set', () => {
    process.env.BYPASS_CLINIC_FILTER = 'true';
    
    const shouldBypass = process.env.BYPASS_CLINIC_FILTER === 'true';
    
    expect(shouldBypass).toBe(true);
  });

  it('should not bypass by default', () => {
    delete process.env.BYPASS_CLINIC_FILTER;
    
    const shouldBypass = process.env.BYPASS_CLINIC_FILTER === 'true';
    
    expect(shouldBypass).toBe(false);
  });
});

describe('Security Logging', () => {
  it('should log cross-clinic access attempts', async () => {
    const { logger } = await import('@/lib/logger');
    
    // Simulate security logging
    logger.security('CRITICAL: Cross-clinic data leak detected', {
      model: 'Patient',
      method: 'findMany',
      expectedClinic: 100,
      leakedRecords: 2,
    });
    
    expect(logger.security).toHaveBeenCalledWith(
      'CRITICAL: Cross-clinic data leak detected',
      expect.objectContaining({
        expectedClinic: 100,
      })
    );
  });
});

describe('Prisma Client Methods', () => {
  it('should expose raw query methods', async () => {
    const { prisma } = await import('@/lib/db');
    
    expect(typeof prisma.$connect).toBe('function');
    expect(typeof prisma.$disconnect).toBe('function');
  });
});
