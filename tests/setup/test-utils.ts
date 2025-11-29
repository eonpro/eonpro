/**
 * Test utilities and helpers for comprehensive testing
 */

import { vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import jwt from 'jsonwebtoken';

// Mock Prisma client for testing
export const prismaMock: any = {
  patient: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  provider: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  order: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  sOAPNote: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  invoice: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  subscription: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  patientAudit: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  $transaction: vi.fn((callback) => callback(prismaMock)),
  $disconnect: vi.fn(),
};

// Test data generators
export const generators: any = {
  patient: (overrides = {}) => ({
    id: faker.number.int({ min: 1, max: 10000 }),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    phone: faker.phone.number({ style: 'human' }),
    dob: faker.date.past({ years: 50 }).toISOString().split('T')[0],
    gender: faker.helpers.arrayElement(['M', 'F', 'Other']),
    address1: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zip: faker.location.zipCode('#####'),
    patientId: `PAT${faker.string.numeric(6)}`,
    createdAt: faker.date.recent(),
    ...overrides,
  }),

  provider: (overrides = {}) => ({
    id: faker.number.int({ min: 1, max: 100 }),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    email: faker.internet.email(),
    npi: faker.string.numeric(10),
    licenseState: faker.location.state({ abbreviated: true }),
    licenseNumber: faker.string.alphanumeric(10),
    createdAt: faker.date.recent(),
    ...overrides,
  }),

  order: (overrides = {}) => ({
    id: faker.number.int({ min: 1, max: 10000 }),
    messageId: faker.string.uuid(),
    referenceId: faker.string.uuid(),
    patientId: faker.number.int({ min: 1, max: 10000 }),
    providerId: faker.number.int({ min: 1, max: 100 }),
    shippingMethod: faker.number.int({ min: 1, max: 3 }),
    status: faker.helpers.arrayElement(['pending', 'processing', 'shipped', 'delivered']),
    createdAt: faker.date.recent(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }),

  prescription: (overrides = {}) => ({
    medicationKey: faker.string.alphanumeric(10),
    medName: faker.helpers.arrayElement(['Metformin', 'Semaglutide', 'Tirzepatide']),
    strength: faker.helpers.arrayElement(['500mg', '1mg', '2.5mg']),
    form: faker.helpers.arrayElement(['tablet', 'injection', 'capsule']),
    quantity: faker.number.int({ min: 30, max: 90 }).toString(),
    refills: faker.number.int({ min: 0, max: 5 }).toString(),
    sig: 'Take as directed',
    ...overrides,
  }),

  soapNote: (overrides = {}) => ({
    id: faker.number.int({ min: 1, max: 10000 }),
    patientId: faker.number.int({ min: 1, max: 10000 }),
    subjective: faker.lorem.paragraph(),
    objective: faker.lorem.paragraph(),
    assessment: faker.lorem.paragraph(),
    plan: faker.lorem.paragraph(),
    status: faker.helpers.arrayElement(['DRAFT', 'PENDING_REVIEW', 'APPROVED']),
    createdAt: faker.date.recent(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }),

  invoice: (overrides = {}) => ({
    id: faker.number.int({ min: 1, max: 10000 }),
    stripeInvoiceId: `inv_${faker.string.alphanumeric(24)}`,
    patientId: faker.number.int({ min: 1, max: 10000 }),
    amountDue: faker.number.int({ min: 5000, max: 50000 }),
    amountPaid: 0,
    currency: 'usd',
    status: faker.helpers.arrayElement(['DRAFT', 'OPEN', 'PAID']),
    createdAt: faker.date.recent(),
    updatedAt: faker.date.recent(),
    ...overrides,
  }),
};

// JWT token generator for testing
export function generateTestToken(payload: any, secret = 'test-secret') {
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

// Mock request/response objects
export function mockRequest(overrides = {}) {
  return {
    headers: {},
    body: {},
    query: {},
    params: {},
    cookies: {},
    method: 'GET',
    url: '/',
    ...overrides,
  };
}

export function mockResponse(): any {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  };
  return res;
}

// API test helpers
export class APITestHelper {
  private baseURL: string;
  private headers: Record<string, string>;

  constructor(baseURL = 'http://localhost:3000') {
    this.baseURL = baseURL;
    this.headers = {
      'Content-Type': 'application/json',
    };
  }

  setAuthToken(token: string) {
    this.headers['Authorization'] = `Bearer ${token}`;
  }

  async get(path: string, query?: Record<string, any>) {
    const url = new URL(path, this.baseURL);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    return fetch(url.toString(), {
      method: 'GET',
      headers: this.headers,
    });
  }

  async post(path: string, body: any) {
    return fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });
  }

  async put(path: string, body: any) {
    return fetch(`${this.baseURL}${path}`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(body),
    });
  }

  async delete(path: string) {
    return fetch(`${this.baseURL}${path}`, {
      method: 'DELETE',
      headers: this.headers,
    });
  }
}

// Database test helpers
export class DatabaseTestHelper {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async seedPatients(count = 10) {
    const patients = [];
    for (let i = 0; i < count; i++) {
      patients.push(generators.patient());
    }
    return this.prisma.patient.createMany({ data: patients });
  }

  async seedProviders(count = 5) {
    const providers = [];
    for (let i = 0; i < count; i++) {
      providers.push(generators.provider());
    }
    return this.prisma.provider.createMany({ data: providers });
  }

  async cleanDatabase() {
    // Clean in reverse dependency order
    await this.prisma.orderEvent.deleteMany();
    await this.prisma.rx.deleteMany();
    await this.prisma.order.deleteMany();
    await this.prisma.sOAPNote.deleteMany();
    await this.prisma.patientDocument.deleteMany();
    await this.prisma.payment.deleteMany();
    await this.prisma.invoice.deleteMany();
    await this.prisma.subscription.deleteMany();
    await this.prisma.patient.deleteMany();
    await this.prisma.provider.deleteMany();
  }
}

// React component test helpers
export function renderWithProviders(
  component: React.ReactElement,
  options = {}
) {
  // Add any context providers needed for testing
  return component;
}

// Mock external services
export const mockServices = {
  stripe: {
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_test123' }),
      retrieve: vi.fn().mockResolvedValue({ id: 'cus_test123', email: 'test@example.com' }),
    },
    subscriptions: {
      create: vi.fn().mockResolvedValue({ id: 'sub_test123', status: 'active' }),
      retrieve: vi.fn().mockResolvedValue({ id: 'sub_test123', status: 'active' }),
      update: vi.fn().mockResolvedValue({ id: 'sub_test123', status: 'canceled' }),
    },
    invoices: {
      create: vi.fn().mockResolvedValue({ id: 'inv_test123' }),
      pay: vi.fn().mockResolvedValue({ id: 'inv_test123', paid: true }),
    },
  },

  twilio: {
    messages: {
      create: vi.fn().mockResolvedValue({
        sid: 'SM123',
        status: 'queued',
        to: '+1234567890',
        body: 'Test message',
      }),
    },
  },

  openai: {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{
            message: {
              content: 'Generated SOAP note content',
            },
          }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 200,
          },
        }),
      },
    },
  },

  aws: {
    s3: {
      putObject: vi.fn().mockResolvedValue({ ETag: '"123"' }),
      getObject: vi.fn().mockResolvedValue({ Body: Buffer.from('test') }),
      deleteObject: vi.fn().mockResolvedValue({}),
    },
    ses: {
      sendEmail: vi.fn().mockResolvedValue({ MessageId: 'test-message-id' }),
    },
  },
};

// Assertion helpers
export const customMatchers = {
  toBeValidEmail(received: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);
    return {
      pass,
      message: () => `expected ${received} to be a valid email address`,
    };
  },

  toBeValidPhone(received: string) {
    const phoneRegex = /^\+?1?\d{10}$/;
    const cleaned = received.replace(/\D/g, '');
    const pass = phoneRegex.test(cleaned);
    return {
      pass,
      message: () => `expected ${received} to be a valid phone number`,
    };
  },

  toBeValidNPI(received: string) {
    const pass = /^\d{10}$/.test(received);
    return {
      pass,
      message: () => `expected ${received} to be a valid 10-digit NPI`,
    };
  },
};

// Performance testing helpers
export async function measurePerformance(
  name: string,
  fn: () => Promise<any>,
  threshold = 1000
) {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  
  if (duration > threshold) {
    console.warn(`Performance warning: ${name} took ${duration}ms (threshold: ${threshold}ms)`);
  }
  
  return {
    result,
    duration,
    passed: duration <= threshold,
  };
}

// Test environment setup
export function setupTestEnvironment() {
  // Mock environment variables
  process.env.DATABASE_URL = 'file:./test.db';
  process.env.JWT_SECRET = 'test-secret';
  process.env.ENCRYPTION_KEY = 'test-encryption-key-32-characters';
  
  // Mock console methods to reduce noise
  global.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}
