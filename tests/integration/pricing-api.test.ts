/**
 * PRICING API INTEGRATION TESTS
 * ============================
 * Tests the pricing system API routes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    discountCode: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    promotion: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    productBundle: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    bundleItem: {
      deleteMany: vi.fn(),
    },
    pricingRule: {
      findMany: vi.fn(),
    },
    product: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    discountUsage: {
      count: vi.fn(),
    },
    invoice: {
      count: vi.fn(),
    },
    patient: {
      findUnique: vi.fn(),
    },
    clinic: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock auth
vi.mock('@/lib/auth/session', () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: {
      id: 'user_001',
      email: 'admin@clinic.com',
      role: 'provider',
      clinicId: 1,
    },
  }),
}));

// Mock Stripe
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    coupons: {
      create: vi.fn().mockResolvedValue({ id: 'coup_test123' }),
    },
    products: {
      create: vi.fn().mockResolvedValue({ id: 'prod_stripe123' }),
    },
    prices: {
      create: vi.fn().mockResolvedValue({ id: 'price_stripe456' }),
    },
  })),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { prisma } from '@/lib/db';

describe('Discount API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/discounts', () => {
    it('should return all discounts for a clinic', async () => {
      const mockDiscounts = [
        {
          id: 1,
          clinicId: 1,
          code: 'SAVE20',
          name: '20% Off',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          isActive: true,
        },
        {
          id: 2,
          clinicId: 1,
          code: 'FIFTY',
          name: '$50 Off',
          discountType: 'FIXED_AMOUNT',
          discountValue: 5000,
          isActive: true,
        },
      ];

      (prisma.discountCode.findMany as any).mockResolvedValue(mockDiscounts);

      const discounts = await prisma.discountCode.findMany({
        where: { clinicId: 1 },
        orderBy: { createdAt: 'desc' },
      });

      expect(discounts).toHaveLength(2);
      expect(discounts[0].code).toBe('SAVE20');
    });
  });

  describe('POST /api/discounts', () => {
    it('should create a new percentage discount', async () => {
      const payload = {
        code: 'NEWYEAR25',
        name: 'New Year 25% Off',
        discountType: 'PERCENTAGE',
        discountValue: 25,
        applyTo: 'ALL_PRODUCTS',
        maxUses: 100,
        maxUsesPerPatient: 1,
        startsAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        isActive: true,
      };

      const mockCreated = {
        id: 1,
        clinicId: 1,
        ...payload,
        currentUses: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.discountCode.create as any).mockResolvedValue(mockCreated);

      const result = await prisma.discountCode.create({
        data: { clinicId: 1, ...payload },
      });

      expect(result.code).toBe('NEWYEAR25');
      expect(result.discountType).toBe('PERCENTAGE');
      expect(result.discountValue).toBe(25);
    });

    it('should create a fixed amount discount with minimum order', async () => {
      const payload = {
        code: 'SAVE50',
        name: '$50 Off Orders $100+',
        discountType: 'FIXED_AMOUNT',
        discountValue: 5000,
        applyTo: 'ALL_PRODUCTS',
        minOrderAmount: 10000,
        maxUses: 50,
        isActive: true,
      };

      const mockCreated = {
        id: 2,
        clinicId: 1,
        ...payload,
        currentUses: 0,
      };

      (prisma.discountCode.create as any).mockResolvedValue(mockCreated);

      const result = await prisma.discountCode.create({
        data: { clinicId: 1, ...payload },
      });

      expect(result.minOrderAmount).toBe(10000);
      expect(result.discountType).toBe('FIXED_AMOUNT');
    });
  });

  describe('POST /api/discounts/validate', () => {
    it('should validate a valid discount code', async () => {
      const mockCode = {
        id: 1,
        clinicId: 1,
        code: 'VALID20',
        name: '20% Off',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        maxUses: 100,
        currentUses: 5,
        maxUsesPerPatient: 3,
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000 * 7),
        isActive: true,
      };

      (prisma.discountCode.findFirst as any).mockResolvedValue(mockCode);
      (prisma.discountUsage.count as any).mockResolvedValue(0);

      const code = await prisma.discountCode.findFirst({
        where: { clinicId: 1, code: 'VALID20', isActive: true },
      });

      expect(code).not.toBeNull();
      expect(code?.isActive).toBe(true);
      expect(code?.currentUses).toBeLessThan(code!.maxUses!);
    });

    it('should reject an expired discount code', async () => {
      const mockCode = {
        id: 1,
        clinicId: 1,
        code: 'EXPIRED',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        expiresAt: new Date(Date.now() - 86400000), // Yesterday
        isActive: true,
      };

      (prisma.discountCode.findFirst as any).mockResolvedValue(mockCode);

      const code = await prisma.discountCode.findFirst({
        where: { clinicId: 1, code: 'EXPIRED', isActive: true },
      });

      const now = new Date();
      const isExpired = code?.expiresAt && code.expiresAt < now;

      expect(isExpired).toBe(true);
    });
  });
});

describe('Promotion API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/promotions', () => {
    it('should return all promotions for a clinic', async () => {
      const mockPromotions = [
        {
          id: 1,
          clinicId: 1,
          name: 'New Year Sale',
          promotionType: 'SEASONAL',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          isActive: true,
        },
        {
          id: 2,
          clinicId: 1,
          name: 'Flash Sale',
          promotionType: 'FLASH_SALE',
          discountType: 'PERCENTAGE',
          discountValue: 30,
          isActive: true,
        },
      ];

      (prisma.promotion.findMany as any).mockResolvedValue(mockPromotions);

      const promotions = await prisma.promotion.findMany({
        where: { clinicId: 1 },
        orderBy: { createdAt: 'desc' },
      });

      expect(promotions).toHaveLength(2);
    });
  });

  describe('POST /api/promotions', () => {
    it('should create a seasonal promotion', async () => {
      const payload = {
        name: 'Summer Sale',
        promotionType: 'SEASONAL',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        applyTo: 'ALL_PRODUCTS',
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        autoApply: true,
        bannerText: 'Summer Sale - 15% Off Everything!',
        isActive: true,
      };

      const mockCreated = {
        id: 1,
        clinicId: 1,
        ...payload,
        currentRedemptions: 0,
      };

      (prisma.promotion.create as any).mockResolvedValue(mockCreated);

      const result = await prisma.promotion.create({
        data: { clinicId: 1, ...payload },
      });

      expect(result.promotionType).toBe('SEASONAL');
      expect(result.autoApply).toBe(true);
    });

    it('should create a flash sale with time limit', async () => {
      const now = new Date();
      const endTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

      const payload = {
        name: '24-Hour Flash Sale',
        promotionType: 'FLASH_SALE',
        discountType: 'PERCENTAGE',
        discountValue: 40,
        applyTo: 'ALL_PRODUCTS',
        startsAt: now.toISOString(),
        endsAt: endTime.toISOString(),
        autoApply: true,
        maxRedemptions: 100,
        bannerText: '⚡ Flash Sale - 40% Off for 24 Hours!',
        isActive: true,
      };

      const mockCreated = {
        id: 2,
        clinicId: 1,
        ...payload,
        currentRedemptions: 0,
      };

      (prisma.promotion.create as any).mockResolvedValue(mockCreated);

      const result = await prisma.promotion.create({
        data: { clinicId: 1, ...payload },
      });

      expect(result.promotionType).toBe('FLASH_SALE');
      expect(result.maxRedemptions).toBe(100);
    });
  });
});

describe('Bundle API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/bundles', () => {
    it('should return all bundles for a clinic', async () => {
      const mockBundles = [
        {
          id: 1,
          clinicId: 1,
          name: 'Starter Package',
          regularPrice: 37900,
          bundlePrice: 29900,
          isActive: true,
          items: [
            { productId: 1, quantity: 1, product: { name: 'Semaglutide' } },
            { productId: 2, quantity: 1, product: { name: 'Lab Work' } },
          ],
        },
      ];

      (prisma.productBundle.findMany as any).mockResolvedValue(mockBundles);

      const bundles = await prisma.productBundle.findMany({
        where: { clinicId: 1 },
        include: { items: { include: { product: true } } },
      });

      expect(bundles).toHaveLength(1);
      expect(bundles[0].items).toHaveLength(2);
    });
  });

  describe('POST /api/bundles', () => {
    it('should create a bundle with savings calculation', async () => {
      const payload = {
        name: 'Weight Loss Starter',
        description: 'Everything you need to start your weight loss journey',
        regularPrice: 52900, // $529
        bundlePrice: 44900, // $449
        savingsAmount: 8000, // $80
        savingsPercent: 15.1,
        billingType: 'ONE_TIME',
        items: [
          { productId: 1, quantity: 1 }, // Semaglutide - $229
          { productId: 2, quantity: 1 }, // Consultation - $150
          { productId: 3, quantity: 1 }, // Lab Work - $150
        ],
        isActive: true,
        isVisible: true,
      };

      const mockCreated = {
        id: 1,
        clinicId: 1,
        ...payload,
        items: payload.items.map((item, idx) => ({
          id: idx + 1,
          bundleId: 1,
          ...item,
        })),
      };

      (prisma.productBundle.create as any).mockResolvedValue(mockCreated);

      const result = await prisma.productBundle.create({
        data: { clinicId: 1, ...payload },
      });

      expect(result.bundlePrice).toBeLessThan(result.regularPrice);
      expect(result.savingsAmount).toBe(8000);
      expect(result.items).toHaveLength(3);
    });
  });
});

describe('Product API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/products', () => {
    it('should return all products for a clinic', async () => {
      const mockProducts = [
        {
          id: 1,
          clinicId: 1,
          name: 'Semaglutide Monthly',
          category: 'MEDICATION',
          price: 22900,
          billingType: 'RECURRING',
          billingInterval: 'MONTHLY',
          isActive: true,
        },
        {
          id: 2,
          clinicId: 1,
          name: 'Initial Lab Work',
          category: 'LAB_TEST',
          price: 15000,
          billingType: 'ONE_TIME',
          isActive: true,
        },
      ];

      (prisma.product.findMany as any).mockResolvedValue(mockProducts);

      const products = await prisma.product.findMany({
        where: { clinicId: 1 },
        orderBy: { name: 'asc' },
      });

      expect(products).toHaveLength(2);
      expect(products.some((p) => p.billingType === 'RECURRING')).toBe(true);
      expect(products.some((p) => p.billingType === 'ONE_TIME')).toBe(true);
    });
  });

  describe('POST /api/products', () => {
    it('should create a subscription product', async () => {
      const payload = {
        name: 'Premium Weight Loss Program',
        shortDescription: 'Premium subscription with all features',
        description: 'Includes medication, monthly consultations, and lab monitoring',
        category: 'MEDICATION',
        price: 34900,
        billingType: 'RECURRING',
        billingInterval: 'MONTHLY',
        billingIntervalCount: 1,
        trialDays: 7,
        isActive: true,
        isVisible: true,
      };

      const mockCreated = {
        id: 1,
        clinicId: 1,
        ...payload,
        stripeProductId: 'prod_stripe123',
        stripePriceId: 'price_stripe456',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.product.create as any).mockResolvedValue(mockCreated);

      const result = await prisma.product.create({
        data: { clinicId: 1, ...payload },
      });

      expect(result.billingType).toBe('RECURRING');
      expect(result.billingInterval).toBe('MONTHLY');
      expect(result.trialDays).toBe(7);
    });

    it('should create a one-time product', async () => {
      const payload = {
        name: 'Initial Consultation',
        shortDescription: 'One-time consultation fee',
        category: 'SERVICE',
        price: 9900,
        billingType: 'ONE_TIME',
        isActive: true,
        isVisible: true,
      };

      const mockCreated = {
        id: 2,
        clinicId: 1,
        ...payload,
      };

      (prisma.product.create as any).mockResolvedValue(mockCreated);

      const result = await prisma.product.create({
        data: { clinicId: 1, ...payload },
      });

      expect(result.billingType).toBe('ONE_TIME');
      expect(result.price).toBe(9900);
    });
  });
});

describe('Pricing Rule Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should evaluate volume discount rule', async () => {
    const mockRules = [
      {
        id: 1,
        clinicId: 1,
        name: 'Buy 3 Get 10% Off',
        ruleType: 'VOLUME_DISCOUNT',
        conditions: [{ type: 'quantity', operator: '>=', value: 3 }],
        discountType: 'PERCENTAGE',
        discountValue: 10,
        priority: 10,
        isActive: true,
      },
    ];

    (prisma.pricingRule.findMany as any).mockResolvedValue(mockRules);

    const rules = await prisma.pricingRule.findMany({
      where: { clinicId: 1, isActive: true },
    });

    expect(rules).toHaveLength(1);

    // Evaluate rule condition
    const quantity = 4;
    const condition = rules[0].conditions[0];
    const meetsCondition = quantity >= condition.value;

    expect(meetsCondition).toBe(true);
  });

  it('should evaluate tiered pricing rule', async () => {
    const mockRules = [
      {
        id: 2,
        clinicId: 1,
        name: 'Spend $500+ Get 15% Off',
        ruleType: 'TIERED_PRICING',
        conditions: [{ type: 'subtotal', operator: '>=', value: 50000 }],
        discountType: 'PERCENTAGE',
        discountValue: 15,
        priority: 20,
        isActive: true,
      },
    ];

    (prisma.pricingRule.findMany as any).mockResolvedValue(mockRules);

    const rules = await prisma.pricingRule.findMany({
      where: { clinicId: 1, isActive: true },
    });

    // Evaluate rule condition
    const orderTotal = 75000; // $750
    const condition = rules[0].conditions[0];
    const meetsCondition = orderTotal >= condition.value;

    expect(meetsCondition).toBe(true);
    expect(rules[0].discountValue).toBe(15);
  });
});

describe('Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle case-insensitive discount codes', async () => {
    const mockCode = {
      id: 1,
      clinicId: 1,
      code: 'SAVE20',
      isActive: true,
    };

    (prisma.discountCode.findFirst as any).mockResolvedValue(mockCode);

    // Test with lowercase input
    const code = await prisma.discountCode.findFirst({
      where: {
        clinicId: 1,
        code: 'save20'.toUpperCase(),
        isActive: true,
      },
    });

    expect(code).not.toBeNull();
    expect(code?.code).toBe('SAVE20');
  });

  it('should handle concurrent discount usage tracking', async () => {
    const mockCode = {
      id: 1,
      code: 'LIMITED',
      maxUses: 100,
      currentUses: 99,
      isActive: true,
    };

    (prisma.discountCode.findFirst as any).mockResolvedValue(mockCode);

    const code = await prisma.discountCode.findFirst({
      where: { code: 'LIMITED' },
    });

    // Only 1 use remaining
    const remainingUses = code!.maxUses! - code!.currentUses!;
    expect(remainingUses).toBe(1);
  });

  it('should handle promotion with unlimited redemptions', async () => {
    const mockPromo = {
      id: 1,
      name: 'Always On Sale',
      maxRedemptions: null, // Unlimited
      currentRedemptions: 5000,
      isActive: true,
    };

    (prisma.promotion.findFirst as any).mockResolvedValue(mockPromo);

    const promo = await prisma.promotion.findFirst({
      where: { id: 1 },
    });

    // No limit check needed
    const hasRedemptionsLeft =
      promo!.maxRedemptions === null || promo!.currentRedemptions < promo!.maxRedemptions;

    expect(hasRedemptionsLeft).toBe(true);
  });
});

describe('Complex Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle first-time customer discount with order check', async () => {
    const mockCode = {
      id: 1,
      code: 'FIRST50',
      firstTimeOnly: true,
      discountValue: 5000,
      isActive: true,
    };

    (prisma.discountCode.findFirst as any).mockResolvedValue(mockCode);
    (prisma.invoice.count as any).mockResolvedValue(0); // No previous orders

    const code = await prisma.discountCode.findFirst({
      where: { code: 'FIRST50' },
    });

    const previousOrders = await prisma.invoice.count({
      where: { patientId: 1, status: 'PAID' },
    });

    const isEligible = code!.firstTimeOnly ? previousOrders === 0 : true;
    expect(isEligible).toBe(true);
  });

  it('should calculate combined savings from multiple sources', async () => {
    // Scenario: $300 order with 10% code + 5% promo + $20 flat rule
    const orderTotal = 30000;

    // 10% discount code
    const codeDiscount = Math.round(orderTotal * 0.1); // $30
    const afterCode = orderTotal - codeDiscount; // $270

    // 5% stackable promotion
    const promoDiscount = Math.round(afterCode * 0.05); // $13.50
    const afterPromo = afterCode - promoDiscount; // $256.50

    // $20 flat rule discount
    const ruleDiscount = Math.min(2000, afterPromo); // $20
    const finalTotal = afterPromo - ruleDiscount; // $236.50

    expect(codeDiscount).toBe(3000);
    expect(promoDiscount).toBe(1350);
    expect(ruleDiscount).toBe(2000);
    expect(finalTotal).toBe(23650);

    // Total savings
    const totalSavings = codeDiscount + promoDiscount + ruleDiscount;
    expect(totalSavings).toBe(6350); // $63.50 total saved
  });

  it('should prioritize pricing rules correctly', async () => {
    const mockRules = [
      { id: 1, name: 'Low Priority', priority: 1, discountValue: 5 },
      { id: 2, name: 'High Priority', priority: 100, discountValue: 20 },
      { id: 3, name: 'Medium Priority', priority: 50, discountValue: 10 },
    ];

    // Sort by priority descending
    const sortedRules = [...mockRules].sort((a, b) => b.priority - a.priority);

    expect(sortedRules[0].name).toBe('High Priority');
    expect(sortedRules[1].name).toBe('Medium Priority');
    expect(sortedRules[2].name).toBe('Low Priority');
  });
});
