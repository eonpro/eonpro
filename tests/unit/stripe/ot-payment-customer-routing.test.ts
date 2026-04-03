/**
 * OT Payment Customer Routing Tests
 *
 * Verifies that OT clinic (ot.eonpro.io) patients are resolved on the
 * EONpro platform Stripe account, NOT the legacy EonMeds default.
 *
 * OT uses the platform Stripe (STRIPE_CONNECT_PLATFORM_SECRET_KEY) and has
 * stripePlatformAccount: true in the database. The StripeCustomerService
 * must use the platform Stripe client to get/create customers so the
 * customer ID matches the account where the PaymentIntent is created.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPrisma = vi.hoisted(() => {
  const p: Record<string, any> = {
    patient: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    clinic: {
      findUnique: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    paymentMethod: {
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    subscription: {
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(p)),
  };
  return p;
});

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPatientPHI: vi.fn((obj: Record<string, unknown>) => obj),
  DEFAULT_PHI_FIELDS: ['firstName', 'lastName', 'email', 'phone', 'dob'],
}));

// The error handler references Prisma error classes for instanceof checks
vi.mock('@prisma/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@prisma/client')>();
  return {
    ...actual,
    PrismaClient: class MockPrismaClient {},
  };
});

// Platform Stripe client — represents the EONpro master account
const mockPlatformStripe = vi.hoisted(() => ({
  customers: {
    retrieve: vi.fn(),
    create: vi.fn(),
    search: vi.fn(),
  },
  paymentIntents: {
    create: vi.fn(),
    retrieve: vi.fn(),
  },
  paymentMethods: {
    retrieve: vi.fn(),
  },
}));

// Legacy EonMeds Stripe client — the "wrong" account for OT
const mockEonmedsStripe = vi.hoisted(() => ({
  customers: {
    retrieve: vi.fn(),
    create: vi.fn(),
    search: vi.fn(),
  },
}));

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(() => mockEonmedsStripe),
  stripe: mockEonmedsStripe,
  STRIPE_CONFIG: { currency: 'usd', webhookEndpointSecret: 'whsec_test' },
}));

const mockGetStripeForClinic = vi.hoisted(() => vi.fn());
const mockGetDedicatedAccountPublishableKey = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe/connect', () => ({
  getStripeForClinic: mockGetStripeForClinic,
  getDedicatedAccountPublishableKey: mockGetDedicatedAccountPublishableKey,
  getPublishableKeyForContext: vi.fn(() => 'pk_test_platform'),
}));

vi.mock('@/lib/auth/middleware', () => ({
  withAuth: vi.fn((handler: Function) => handler),
  withClinicalAuth: vi.fn((handler: Function) => handler),
}));

vi.mock('@/services/affiliate/affiliateCommissionService', () => ({
  processPaymentForCommission: vi.fn().mockResolvedValue({ success: false, skipped: true }),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const OT_CLINIC_ID = 42;

const OT_PATIENT = {
  id: 101,
  clinicId: OT_CLINIC_ID,
  stripeCustomerId: 'cus_eonmeds_old', // exists on EonMeds, NOT on platform
  email: 'colton@example.com',
  firstName: 'Colton',
  lastName: 'Scheible',
  phone: '5551234567',
  address1: '123 Main St',
  city: 'Phoenix',
  state: 'AZ',
  zip: '85001',
  patientId: 'P-42-101',
  tags: [],
  paymentMethods: [],
};

const PLATFORM_CUSTOMER: Partial<Stripe.Customer> = {
  id: 'cus_platform_new',
  object: 'customer',
  email: 'colton@example.com',
};

// ---------------------------------------------------------------------------
// Tests: StripeCustomerService.getOrCreateCustomerForContext
// ---------------------------------------------------------------------------

describe('OT Payment Customer Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.patient.findUnique.mockResolvedValue(OT_PATIENT);

    // getStripeForClinic returns the PLATFORM Stripe for OT (stripePlatformAccount: true)
    mockGetStripeForClinic.mockResolvedValue({
      stripe: mockPlatformStripe,
      isPlatformAccount: true,
      isDedicatedAccount: false,
      stripeAccountId: undefined,
      clinicId: OT_CLINIC_ID,
    });
    mockGetDedicatedAccountPublishableKey.mockReturnValue(undefined);
  });

  describe('StripeCustomerService.getOrCreateCustomerForContext', () => {
    let StripeCustomerService: typeof import('@/services/stripe/customerService').StripeCustomerService;

    beforeEach(async () => {
      const mod = await import('@/services/stripe/customerService');
      StripeCustomerService = mod.StripeCustomerService;
    });

    it('should use the platform Stripe client, not the EonMeds default', async () => {
      // The stored cus_eonmeds_old does NOT exist on the platform account
      mockPlatformStripe.customers.retrieve.mockRejectedValue(
        new Error('No such customer: cus_eonmeds_old'),
      );

      // Email search finds no existing customer on platform
      mockPlatformStripe.customers.search.mockResolvedValue({ data: [] });

      // Platform Stripe creates a new customer
      mockPlatformStripe.customers.create.mockResolvedValue(PLATFORM_CUSTOMER);

      const customer = await StripeCustomerService.getOrCreateCustomerForContext(
        OT_PATIENT.id,
        mockPlatformStripe as unknown as Stripe,
      );

      expect(customer.id).toBe('cus_platform_new');

      // Must call the PLATFORM Stripe — not the EonMeds default
      expect(mockPlatformStripe.customers.retrieve).toHaveBeenCalledWith('cus_eonmeds_old');
      expect(mockPlatformStripe.customers.search).toHaveBeenCalled();
      expect(mockPlatformStripe.customers.create).toHaveBeenCalled();

      // EonMeds Stripe must NOT be touched
      expect(mockEonmedsStripe.customers.retrieve).not.toHaveBeenCalled();
      expect(mockEonmedsStripe.customers.create).not.toHaveBeenCalled();
    });

    it('should return existing customer when stored ID works on platform', async () => {
      const existingPlatformCustomer = {
        id: 'cus_eonmeds_old',
        object: 'customer',
        deleted: false,
      };
      mockPlatformStripe.customers.retrieve.mockResolvedValue(existingPlatformCustomer);

      const customer = await StripeCustomerService.getOrCreateCustomerForContext(
        OT_PATIENT.id,
        mockPlatformStripe as unknown as Stripe,
      );

      expect(customer.id).toBe('cus_eonmeds_old');
      // Should not search or create since retrieve succeeded
      expect(mockPlatformStripe.customers.search).not.toHaveBeenCalled();
      expect(mockPlatformStripe.customers.create).not.toHaveBeenCalled();
    });

    it('should find customer by email when stored ID fails on platform', async () => {
      mockPlatformStripe.customers.retrieve.mockRejectedValue(
        new Error('No such customer: cus_eonmeds_old'),
      );

      // Email search finds an existing customer on the platform
      const existingByEmail = { id: 'cus_platform_existing', object: 'customer' };
      mockPlatformStripe.customers.search.mockResolvedValue({ data: [existingByEmail] });

      const customer = await StripeCustomerService.getOrCreateCustomerForContext(
        OT_PATIENT.id,
        mockPlatformStripe as unknown as Stripe,
      );

      expect(customer.id).toBe('cus_platform_existing');
      expect(mockPlatformStripe.customers.create).not.toHaveBeenCalled();
    });

    it('should create new customer on platform when no match found', async () => {
      mockPlatformStripe.customers.retrieve.mockRejectedValue(
        new Error('No such customer: cus_eonmeds_old'),
      );
      mockPlatformStripe.customers.search.mockResolvedValue({ data: [] });
      mockPlatformStripe.customers.create.mockResolvedValue(PLATFORM_CUSTOMER);

      const customer = await StripeCustomerService.getOrCreateCustomerForContext(
        OT_PATIENT.id,
        mockPlatformStripe as unknown as Stripe,
      );

      expect(customer.id).toBe('cus_platform_new');

      // Verify it was created with correct patient details
      expect(mockPlatformStripe.customers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'colton@example.com',
          name: 'Colton Scheible',
          metadata: expect.objectContaining({
            patientId: '101',
          }),
        }),
      );
    });

    it('should NOT overwrite patient.stripeCustomerId (belongs to default account)', async () => {
      mockPlatformStripe.customers.retrieve.mockRejectedValue(
        new Error('No such customer: cus_eonmeds_old'),
      );
      mockPlatformStripe.customers.search.mockResolvedValue({ data: [] });
      mockPlatformStripe.customers.create.mockResolvedValue(PLATFORM_CUSTOMER);

      await StripeCustomerService.getOrCreateCustomerForContext(
        OT_PATIENT.id,
        mockPlatformStripe as unknown as Stripe,
      );

      // patient.update should NOT be called to overwrite stripeCustomerId
      expect(mockPrisma.patient.update).not.toHaveBeenCalled();
    });

    it('should handle patient with no stored stripeCustomerId', async () => {
      const patientNoCustomer = { ...OT_PATIENT, stripeCustomerId: null };
      mockPrisma.patient.findUnique.mockResolvedValue(patientNoCustomer);

      mockPlatformStripe.customers.search.mockResolvedValue({ data: [] });
      mockPlatformStripe.customers.create.mockResolvedValue(PLATFORM_CUSTOMER);

      const customer = await StripeCustomerService.getOrCreateCustomerForContext(
        OT_PATIENT.id,
        mockPlatformStripe as unknown as Stripe,
      );

      expect(customer.id).toBe('cus_platform_new');
      // Should skip retrieve (no stored ID) and go straight to search
      expect(mockPlatformStripe.customers.retrieve).not.toHaveBeenCalled();
      expect(mockPlatformStripe.customers.search).toHaveBeenCalled();
    });

    it('should pass connectOpts for connected accounts', async () => {
      const connectOpts = { stripeAccount: 'acct_wellmedr123' };

      mockPlatformStripe.customers.retrieve.mockRejectedValue(new Error('No such customer'));
      mockPlatformStripe.customers.search.mockResolvedValue({ data: [] });
      mockPlatformStripe.customers.create.mockResolvedValue(PLATFORM_CUSTOMER);

      await StripeCustomerService.getOrCreateCustomerForContext(
        OT_PATIENT.id,
        mockPlatformStripe as unknown as Stripe,
        connectOpts,
      );

      // All Stripe API calls should include the connectOpts
      expect(mockPlatformStripe.customers.retrieve).toHaveBeenCalledWith(
        'cus_eonmeds_old',
        connectOpts,
      );
      expect(mockPlatformStripe.customers.search).toHaveBeenCalledWith(
        expect.any(Object),
        connectOpts,
      );
      expect(mockPlatformStripe.customers.create).toHaveBeenCalledWith(
        expect.any(Object),
        connectOpts,
      );
    });
  });

  describe('Payment process route customer resolution', () => {
    it('should resolve customer on platform Stripe for OT clinic', async () => {
      // The stored customer ID does NOT exist on the platform
      mockPlatformStripe.customers.retrieve.mockRejectedValue(
        new Error('No such customer: cus_eonmeds_old'),
      );
      mockPlatformStripe.customers.search.mockResolvedValue({ data: [] });
      mockPlatformStripe.customers.create.mockResolvedValue(PLATFORM_CUSTOMER);

      // PaymentIntent creation on platform should succeed
      mockPlatformStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_test_platform',
        client_secret: 'pi_test_platform_secret',
        status: 'requires_confirmation',
      });

      mockPrisma.patient.findUnique.mockResolvedValue(OT_PATIENT);
      mockPrisma.payment.create.mockResolvedValue({ id: 1 });
      mockPrisma.clinic.findUnique.mockResolvedValue({ subdomain: 'ot' });

      const { NextRequest } = await import('next/server');
      const request = new NextRequest('http://localhost:3000/api/stripe/payments/process', {
        method: 'POST',
        body: JSON.stringify({
          patientId: OT_PATIENT.id,
          amount: 76900,
          description: 'BPC-157 + TB-500 – systemic healing – 3 Month',
          useStripeElements: true,
          saveCard: true,
        }),
      });

      const { handlePost } = await import(
        '@/app/api/stripe/payments/process/route'
      ).then((m) => {
        // withAuth is mocked to pass-through the handler
        return { handlePost: m.POST };
      });

      const mockUser = { id: 1, email: 'admin@ot.eonpro.io', role: 'admin', clinicId: OT_CLINIC_ID };
      const response = await handlePost(request, mockUser);
      const data = await response.json();

      // Should NOT get "An unexpected error occurred"
      expect(response.status).not.toBe(500);

      // Should succeed with requiresStripeConfirmation
      expect(data.requiresStripeConfirmation).toBe(true);
      expect(data.clientSecret).toBe('pi_test_platform_secret');

      // PaymentIntent must use the PLATFORM customer, not the EonMeds one
      expect(mockPlatformStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_platform_new', // platform customer, NOT cus_eonmeds_old
          amount: 76900,
          currency: 'usd',
        }),
      );

      // EonMeds Stripe must NOT be involved
      expect(mockEonmedsStripe.customers.retrieve).not.toHaveBeenCalled();
      expect(mockEonmedsStripe.customers.create).not.toHaveBeenCalled();
    });

    it('should pass the platform customer to the PaymentIntent for saved card path', async () => {
      // Platform customer found by email
      mockPlatformStripe.customers.retrieve.mockRejectedValue(
        new Error('No such customer: cus_eonmeds_old'),
      );
      mockPlatformStripe.customers.search.mockResolvedValue({
        data: [{ id: 'cus_platform_found', object: 'customer' }],
      });

      // Saved card PaymentIntent (confirm: true, off_session: true)
      mockPlatformStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_saved_card',
        status: 'succeeded',
        latest_charge: 'ch_test',
      });

      const patientWithPaymentMethod = {
        ...OT_PATIENT,
        paymentMethods: [
          {
            id: 5,
            patientId: OT_PATIENT.id,
            isActive: true,
            stripePaymentMethodId: 'pm_saved_visa',
            cardLast4: '4632',
            cardBrand: 'Visa',
          },
        ],
      };
      mockPrisma.patient.findUnique.mockResolvedValue(patientWithPaymentMethod);
      mockPrisma.paymentMethod.findFirst.mockResolvedValue({
        id: 5,
        patientId: OT_PATIENT.id,
        isActive: true,
        stripePaymentMethodId: 'pm_saved_visa',
        cardLast4: '4632',
        cardBrand: 'Visa',
      });

      mockPrisma.payment.create.mockResolvedValue({ id: 2 });
      mockPrisma.payment.update.mockResolvedValue({});
      mockPrisma.payment.count.mockResolvedValue(0);
      mockPrisma.paymentMethod.update.mockResolvedValue({});
      mockPrisma.clinic.findUnique.mockResolvedValue({ subdomain: 'ot' });

      const { NextRequest } = await import('next/server');
      const request = new NextRequest('http://localhost:3000/api/stripe/payments/process', {
        method: 'POST',
        body: JSON.stringify({
          patientId: OT_PATIENT.id,
          amount: 76900,
          description: 'BPC-157 + TB-500 – systemic healing – 3 Month',
          paymentMethodId: 5,
        }),
      });

      const { handlePost } = await import(
        '@/app/api/stripe/payments/process/route'
      ).then((m) => ({ handlePost: m.POST }));

      const mockUser = { id: 1, email: 'admin@ot.eonpro.io', role: 'admin', clinicId: OT_CLINIC_ID };
      const response = await handlePost(request, mockUser);
      const data = await response.json();

      expect(response.status).not.toBe(500);

      // PaymentIntent should use the platform customer (found by email), not the stored EonMeds one
      expect(mockPlatformStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_platform_found',
          payment_method: 'pm_saved_visa',
          confirm: true,
        }),
        expect.any(Object),
      );
    });
  });
});
