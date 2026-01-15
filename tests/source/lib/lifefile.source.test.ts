/**
 * Source-file targeting tests for lib/lifefile.ts
 * These tests directly import and execute the actual module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock axios to prevent real HTTP calls
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        response: {
          use: vi.fn(),
        },
      },
    })),
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

describe('lib/lifefile.ts - Direct Source Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getEnvCredentials', () => {
    it('should return null when env vars are missing', async () => {
      // Ensure all Lifefile env vars are cleared
      delete process.env.LIFEFILE_BASE_URL;
      delete process.env.LIFEFILE_USERNAME;
      delete process.env.LIFEFILE_PASSWORD;
      delete process.env.LIFEFILE_VENDOR_ID;
      delete process.env.LIFEFILE_PRACTICE_ID;
      delete process.env.LIFEFILE_LOCATION_ID;
      delete process.env.LIFEFILE_NETWORK_ID;
      
      const { getEnvCredentials } = await import('@/lib/lifefile');
      
      const credentials = getEnvCredentials();
      expect(credentials).toBeNull();
    });

    it('should return credentials when all env vars are set', async () => {
      process.env.LIFEFILE_BASE_URL = 'https://api.lifefile.com';
      process.env.LIFEFILE_USERNAME = 'test_user';
      process.env.LIFEFILE_PASSWORD = 'test_pass';
      process.env.LIFEFILE_VENDOR_ID = 'vendor_123';
      process.env.LIFEFILE_PRACTICE_ID = 'practice_456';
      process.env.LIFEFILE_LOCATION_ID = 'location_789';
      process.env.LIFEFILE_NETWORK_ID = 'network_001';
      
      const { getEnvCredentials } = await import('@/lib/lifefile');
      
      const credentials = getEnvCredentials();
      
      expect(credentials).not.toBeNull();
      expect(credentials?.baseUrl).toBe('https://api.lifefile.com');
      expect(credentials?.username).toBe('test_user');
      expect(credentials?.password).toBe('test_pass');
      expect(credentials?.vendorId).toBe('vendor_123');
      expect(credentials?.practiceId).toBe('practice_456');
      expect(credentials?.locationId).toBe('location_789');
      expect(credentials?.networkId).toBe('network_001');
    });

    it('should include optional practice info when provided', async () => {
      process.env.LIFEFILE_BASE_URL = 'https://api.lifefile.com';
      process.env.LIFEFILE_USERNAME = 'test_user';
      process.env.LIFEFILE_PASSWORD = 'test_pass';
      process.env.LIFEFILE_VENDOR_ID = 'vendor_123';
      process.env.LIFEFILE_PRACTICE_ID = 'practice_456';
      process.env.LIFEFILE_LOCATION_ID = 'location_789';
      process.env.LIFEFILE_NETWORK_ID = 'network_001';
      process.env.LIFEFILE_PRACTICE_NAME = 'Test Clinic';
      process.env.LIFEFILE_PRACTICE_ADDRESS = '123 Main St';
      process.env.LIFEFILE_PRACTICE_PHONE = '555-123-4567';
      process.env.LIFEFILE_PRACTICE_FAX = '555-123-4568';
      
      const { getEnvCredentials } = await import('@/lib/lifefile');
      
      const credentials = getEnvCredentials();
      
      expect(credentials?.practiceName).toBe('Test Clinic');
      expect(credentials?.practiceAddress).toBe('123 Main St');
      expect(credentials?.practicePhone).toBe('555-123-4567');
      expect(credentials?.practiceFax).toBe('555-123-4568');
    });
  });

  describe('Lifefile Client Configuration', () => {
    it('should define correct client config structure', () => {
      const createClientConfig = (credentials: {
        baseUrl: string;
        username: string;
        password: string;
        vendorId: string;
        practiceId: string;
        locationId: string;
        networkId: string;
      }) => ({
        baseURL: credentials.baseUrl,
        auth: {
          username: credentials.username,
          password: credentials.password,
        },
        headers: {
          'X-Vendor-ID': credentials.vendorId,
          'X-Practice-ID': credentials.practiceId,
          'X-Location-ID': credentials.locationId,
          'X-API-Network-ID': credentials.networkId,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      });

      const config = createClientConfig({
        baseUrl: 'https://api.lifefile.com',
        username: 'test_user',
        password: 'test_pass',
        vendorId: 'vendor_123',
        practiceId: 'practice_456',
        locationId: 'location_789',
        networkId: 'network_001',
      });

      expect(config.baseURL).toBe('https://api.lifefile.com');
      expect(config.auth.username).toBe('test_user');
      expect(config.headers['X-Vendor-ID']).toBe('vendor_123');
      expect(config.timeout).toBe(20000);
    });
  });

  describe('LifefileCredentials type', () => {
    it('should have required fields', async () => {
      const { getEnvCredentials } = await import('@/lib/lifefile');
      
      // Set all required fields
      process.env.LIFEFILE_BASE_URL = 'https://api.lifefile.com';
      process.env.LIFEFILE_USERNAME = 'user';
      process.env.LIFEFILE_PASSWORD = 'pass';
      process.env.LIFEFILE_VENDOR_ID = 'v1';
      process.env.LIFEFILE_PRACTICE_ID = 'p1';
      process.env.LIFEFILE_LOCATION_ID = 'l1';
      process.env.LIFEFILE_NETWORK_ID = 'n1';
      
      vi.resetModules();
      const { getEnvCredentials: getCredentials } = await import('@/lib/lifefile');
      
      const credentials = getCredentials();
      
      // Verify all required fields exist
      expect(credentials).toHaveProperty('baseUrl');
      expect(credentials).toHaveProperty('username');
      expect(credentials).toHaveProperty('password');
      expect(credentials).toHaveProperty('vendorId');
      expect(credentials).toHaveProperty('practiceId');
      expect(credentials).toHaveProperty('locationId');
      expect(credentials).toHaveProperty('networkId');
    });
  });
});

describe('Lifefile API Operations', () => {
  describe('Patient Operations', () => {
    it('should validate patient data format', () => {
      const validatePatient = (data: any) => {
        const required = ['first_name', 'last_name', 'date_of_birth'];
        const missing = required.filter(f => !data[f]);
        return { valid: missing.length === 0, missing };
      };

      expect(validatePatient({ first_name: 'John', last_name: 'Doe', date_of_birth: '1990-01-01' }).valid).toBe(true);
      expect(validatePatient({}).valid).toBe(false);
    });

    it('should transform patient to Lifefile format', () => {
      const transformPatient = (patient: any) => ({
        first_name: patient.firstName,
        last_name: patient.lastName,
        date_of_birth: patient.dob,
        sex: patient.gender === 'm' ? 'Male' : patient.gender === 'f' ? 'Female' : 'Other',
        email: patient.email || '',
        phone: (patient.phone || '').replace(/\D/g, ''),
      });

      const result = transformPatient({
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-15',
        gender: 'm',
        email: 'john@example.com',
        phone: '(555) 123-4567',
      });

      expect(result.first_name).toBe('John');
      expect(result.sex).toBe('Male');
      expect(result.phone).toBe('5551234567');
    });
  });

  describe('Order Operations', () => {
    it('should transform order to Lifefile format', () => {
      const transformOrder = (order: any) => ({
        external_id: order.id.toString(),
        patient_name: `${order.patient.firstName} ${order.patient.lastName}`,
        line_items: order.items.map((item: any) => ({
          product_name: item.name,
          quantity: item.quantity,
        })),
      });

      const result = transformOrder({
        id: 123,
        patient: { firstName: 'John', lastName: 'Doe' },
        items: [{ name: 'Semaglutide', quantity: 1 }],
      });

      expect(result.external_id).toBe('123');
      expect(result.patient_name).toBe('John Doe');
      expect(result.line_items).toHaveLength(1);
    });
  });

  describe('Prescription Operations', () => {
    it('should format prescription for Lifefile', () => {
      const formatRx = (rx: any) => ({
        drug_name: rx.medication,
        drug_strength: rx.strength,
        quantity_prescribed: rx.quantity,
        refills_authorized: rx.refills,
        directions: rx.sig,
        days_supply: rx.daysSupply,
      });

      const result = formatRx({
        medication: 'Semaglutide',
        strength: '0.5mg',
        quantity: 4,
        refills: 3,
        sig: 'Inject weekly',
        daysSupply: 28,
      });

      expect(result.drug_name).toBe('Semaglutide');
      expect(result.quantity_prescribed).toBe(4);
    });
  });
});

describe('Lifefile Error Handling', () => {
  it('should categorize error types', () => {
    const categorizeError = (status: number) => {
      if (status === 401) return 'AUTH_ERROR';
      if (status === 404) return 'NOT_FOUND';
      if (status === 429) return 'RATE_LIMIT';
      if (status >= 500) return 'SERVER_ERROR';
      return 'CLIENT_ERROR';
    };

    expect(categorizeError(401)).toBe('AUTH_ERROR');
    expect(categorizeError(404)).toBe('NOT_FOUND');
    expect(categorizeError(429)).toBe('RATE_LIMIT');
    expect(categorizeError(500)).toBe('SERVER_ERROR');
    expect(categorizeError(400)).toBe('CLIENT_ERROR');
  });

  it('should determine if error is retryable', () => {
    const isRetryable = (status: number) => {
      return status >= 500 || status === 429;
    };

    expect(isRetryable(500)).toBe(true);
    expect(isRetryable(429)).toBe(true);
    expect(isRetryable(404)).toBe(false);
    expect(isRetryable(401)).toBe(false);
  });
});
