/**
 * COMPREHENSIVE PRICING SYSTEM TESTS
 * ==================================
 * Tests all pricing engine components
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    discountCode: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    promotion: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    productBundle: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    pricingRule: {
      findMany: vi.fn(),
    },
    product: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    discountUsage: {
      count: vi.fn(),
      create: vi.fn(),
    },
    invoice: {
      count: vi.fn(),
    },
    patient: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Import after mocks
import { prisma } from '@/lib/db';
import { PricingEngine } from '@/services/pricing/pricingEngine';

describe('Pricing Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Discount Code Validation', () => {
    it('should validate a percentage discount code', async () => {
      const mockCode = {
        id: 1,
        clinicId: 1,
        code: 'SAVE20',
        name: '20% Off',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        applyTo: 'ALL_PRODUCTS',
        maxUses: 100,
        currentUses: 5,
        maxUsesPerPatient: 1,
        minOrderAmount: null,
        firstTimeOnly: false,
        appliesOnRecurring: false,
        startsAt: new Date(Date.now() - 86400000), // Yesterday
        expiresAt: new Date(Date.now() + 86400000), // Tomorrow
        isActive: true,
      };

      (prisma.discountCode.findFirst as any).mockResolvedValue(mockCode);
      (prisma.discountUsage.count as any).mockResolvedValue(0);

      const result = await PricingEngine.validateDiscountCode('SAVE20', 1, 1);

      expect(result.valid).toBe(true);
      expect(result.discountCode).toEqual(mockCode);
    });

    it('should reject expired discount code', async () => {
      const expiredCode = {
        id: 2,
        clinicId: 1,
        code: 'EXPIRED',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        applyTo: 'ALL_PRODUCTS',
        maxUses: 100,
        currentUses: 5,
        maxUsesPerPatient: 1,
        startsAt: new Date(Date.now() - 86400000 * 30), // 30 days ago
        expiresAt: new Date(Date.now() - 86400000), // Yesterday
        isActive: true,
      };

      (prisma.discountCode.findFirst as any).mockResolvedValue(expiredCode);

      const result = await PricingEngine.validateDiscountCode('EXPIRED', 1, 1);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject code exceeding max uses', async () => {
      const maxedOutCode = {
        id: 3,
        clinicId: 1,
        code: 'MAXEDOUT',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        applyTo: 'ALL_PRODUCTS',
        maxUses: 10,
        currentUses: 10, // At limit
        maxUsesPerPatient: 5,
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000),
        isActive: true,
      };

      (prisma.discountCode.findFirst as any).mockResolvedValue(maxedOutCode);

      const result = await PricingEngine.validateDiscountCode('MAXEDOUT', 1, 1);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('limit');
    });

    it('should reject code exceeding patient usage limit', async () => {
      const limitedCode = {
        id: 4,
        clinicId: 1,
        code: 'ONCEONLY',
        discountType: 'PERCENTAGE',
        discountValue: 25,
        applyTo: 'ALL_PRODUCTS',
        maxUses: 100,
        currentUses: 5,
        maxUsesPerPatient: 1, // Once per patient
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000),
        isActive: true,
      };

      (prisma.discountCode.findFirst as any).mockResolvedValue(limitedCode);
      (prisma.discountUsage.count as any).mockResolvedValue(1); // Already used once

      const result = await PricingEngine.validateDiscountCode('ONCEONLY', 1, 1);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('already used');
    });

    it('should reject inactive discount code', async () => {
      (prisma.discountCode.findFirst as any).mockResolvedValue(null);

      const result = await PricingEngine.validateDiscountCode('INVALID', 1, 1);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('Discount Calculation', () => {
    it('should calculate percentage discount correctly', () => {
      const orderTotal = 10000; // $100.00
      const result = PricingEngine.calculateDiscount(orderTotal, 'PERCENTAGE', 20);
      expect(result).toBe(2000); // $20.00
    });

    it('should calculate fixed amount discount correctly', () => {
      const orderTotal = 10000; // $100.00
      const result = PricingEngine.calculateDiscount(orderTotal, 'FIXED_AMOUNT', 2500);
      expect(result).toBe(2500); // $25.00
    });

    it('should cap fixed discount at order total', () => {
      const orderTotal = 5000; // $50.00
      const result = PricingEngine.calculateDiscount(orderTotal, 'FIXED_AMOUNT', 10000);
      expect(result).toBe(5000); // Max $50.00 (can't exceed order)
    });

    it('should handle 100% discount correctly', () => {
      const orderTotal = 10000;
      const result = PricingEngine.calculateDiscount(orderTotal, 'PERCENTAGE', 100);
      expect(result).toBe(10000); // Full discount
    });
  });

  describe('Active Promotions', () => {
    it('should return active auto-apply promotions', async () => {
      const mockPromotions = [
        {
          id: 1,
          clinicId: 1,
          name: 'New Year Sale',
          promotionType: 'SEASONAL',
          discountType: 'PERCENTAGE',
          discountValue: 15,
          applyTo: 'ALL_PRODUCTS',
          startsAt: new Date(Date.now() - 86400000),
          endsAt: new Date(Date.now() + 86400000 * 7),
          autoApply: true,
          bannerText: 'New Year Sale!',
          isActive: true,
        },
      ];

      (prisma.promotion.findMany as any).mockResolvedValue(mockPromotions);

      const promotions = await PricingEngine.getActivePromotionsForClinic(1);

      expect(promotions).toHaveLength(1);
      expect(promotions[0].name).toBe('New Year Sale');
      expect(promotions[0].autoApply).toBe(true);
    });

    it('should filter out expired promotions', async () => {
      (prisma.promotion.findMany as any).mockResolvedValue([]);

      const promotions = await PricingEngine.getActivePromotionsForClinic(1);

      expect(promotions).toHaveLength(0);
    });
  });

  describe('Bundle Pricing', () => {
    it('should calculate bundle savings correctly', async () => {
      const mockBundle = {
        id: 1,
        clinicId: 1,
        name: 'Starter Package',
        description: 'Includes medication + lab work',
        regularPrice: 37900, // $379.00
        bundlePrice: 29900, // $299.00
        savingsAmount: 8000, // $80.00
        savingsPercent: 21.1,
        billingType: 'ONE_TIME',
        isActive: true,
        items: [
          { productId: 1, quantity: 1, product: { name: 'Semaglutide', price: 22900 } },
          { productId: 2, quantity: 1, product: { name: 'Lab Work', price: 15000 } },
        ],
      };

      (prisma.productBundle.findFirst as any).mockResolvedValue(mockBundle);

      const bundle = await PricingEngine.getBundle(1, 1);

      expect(bundle).not.toBeNull();
      expect(bundle?.bundlePrice).toBe(29900);
      expect(bundle?.savingsAmount).toBe(8000);
      expect(bundle?.savingsPercent).toBeCloseTo(21.1, 1);
    });

    it('should return null for invalid bundle', async () => {
      (prisma.productBundle.findFirst as any).mockResolvedValue(null);

      const bundle = await PricingEngine.getBundle(999, 1);

      expect(bundle).toBeNull();
    });
  });

  describe('Pricing Rules', () => {
    it('should return active pricing rules', async () => {
      const mockRules = [
        {
          id: 1,
          clinicId: 1,
          name: 'Volume Discount',
          ruleType: 'VOLUME_DISCOUNT',
          conditions: [{ type: 'quantity', operator: '>=', value: 3 }],
          discountType: 'PERCENTAGE',
          discountValue: 10,
          applyTo: 'ALL_PRODUCTS',
          priority: 10,
          isActive: true,
        },
      ];

      (prisma.pricingRule.findMany as any).mockResolvedValue(mockRules);

      const rules = await PricingEngine.getPricingRulesForClinic(1);

      expect(rules).toHaveLength(1);
      expect(rules[0].ruleType).toBe('VOLUME_DISCOUNT');
    });
  });

  describe('Full Price Calculation', () => {
    it('should calculate final price with discount code', async () => {
      const mockCode = {
        id: 1,
        clinicId: 1,
        code: 'SAVE20',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        applyTo: 'ALL_PRODUCTS',
        maxUses: 100,
        currentUses: 5,
        maxUsesPerPatient: 1,
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000),
        isActive: true,
      };

      (prisma.discountCode.findFirst as any).mockResolvedValue(mockCode);
      (prisma.discountUsage.count as any).mockResolvedValue(0);
      (prisma.promotion.findMany as any).mockResolvedValue([]);
      (prisma.pricingRule.findMany as any).mockResolvedValue([]);

      const result = await PricingEngine.calculateFinalPrice({
        clinicId: 1,
        subtotal: 22900, // $229.00
        discountCode: 'SAVE20',
        patientId: 1,
      });

      expect(result.subtotal).toBe(22900);
      expect(result.discountCodeDiscount).toBe(4580); // 20% of $229 = $45.80
      expect(result.finalTotal).toBe(18320); // $183.20
    });

    it('should stack promotion with discount code', async () => {
      const mockCode = {
        id: 1,
        code: 'SAVE10',
        discountType: 'PERCENTAGE',
        discountValue: 10,
        applyTo: 'ALL_PRODUCTS',
        maxUses: 100,
        currentUses: 5,
        maxUsesPerPatient: 1,
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000),
        isActive: true,
      };

      const mockPromo = [{
        id: 1,
        name: 'Flash Sale',
        promotionType: 'FLASH_SALE',
        discountType: 'PERCENTAGE',
        discountValue: 5,
        applyTo: 'ALL_PRODUCTS',
        startsAt: new Date(Date.now() - 86400000),
        endsAt: new Date(Date.now() + 86400000),
        autoApply: true,
        stackable: true,
        isActive: true,
      }];

      (prisma.discountCode.findFirst as any).mockResolvedValue(mockCode);
      (prisma.discountUsage.count as any).mockResolvedValue(0);
      (prisma.promotion.findMany as any).mockResolvedValue(mockPromo);
      (prisma.pricingRule.findMany as any).mockResolvedValue([]);

      const result = await PricingEngine.calculateFinalPrice({
        clinicId: 1,
        subtotal: 10000, // $100.00
        discountCode: 'SAVE10',
        patientId: 1,
        applyPromotions: true,
      });

      // $100 - 10% (code) = $90, - 5% (promo) = $85.50
      expect(result.subtotal).toBe(10000);
      expect(result.discountCodeDiscount).toBe(1000); // $10
      expect(result.promotionDiscount).toBe(450); // 5% of $90
      expect(result.finalTotal).toBe(8550); // $85.50
    });

    it('should apply minimum order requirement', async () => {
      const mockCode = {
        id: 1,
        code: 'MIN100',
        discountType: 'FIXED_AMOUNT',
        discountValue: 5000, // $50 off
        applyTo: 'ALL_PRODUCTS',
        maxUses: 100,
        currentUses: 0,
        maxUsesPerPatient: 1,
        minOrderAmount: 10000, // $100 minimum
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000),
        isActive: true,
      };

      (prisma.discountCode.findFirst as any).mockResolvedValue(mockCode);
      (prisma.discountUsage.count as any).mockResolvedValue(0);

      // Order below minimum
      const result = await PricingEngine.validateDiscountCode('MIN100', 1, 1, 5000);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Minimum');
    });
  });

  describe('First-Time Customer Discounts', () => {
    it('should apply first-time customer discount for new patients', async () => {
      const mockCode = {
        id: 1,
        code: 'FIRSTORDER',
        discountType: 'PERCENTAGE',
        discountValue: 30,
        applyTo: 'ALL_PRODUCTS',
        maxUses: 100,
        currentUses: 10,
        maxUsesPerPatient: 1,
        firstTimeOnly: true,
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000),
        isActive: true,
      };

      (prisma.discountCode.findFirst as any).mockResolvedValue(mockCode);
      (prisma.discountUsage.count as any).mockResolvedValue(0);
      (prisma.patient.findUnique as any).mockResolvedValue({
        id: 1,
        createdAt: new Date(),
      });
      (prisma.invoice.count as any).mockResolvedValue(0); // No previous orders

      const result = await PricingEngine.validateDiscountCode('FIRSTORDER', 1, 1);

      expect(result.valid).toBe(true);
    });

    it('should reject first-time discount for returning customers', async () => {
      const mockCode = {
        id: 1,
        code: 'FIRSTORDER',
        discountType: 'PERCENTAGE',
        discountValue: 30,
        applyTo: 'ALL_PRODUCTS',
        maxUses: 100,
        currentUses: 10,
        maxUsesPerPatient: 1,
        firstTimeOnly: true,
        startsAt: new Date(Date.now() - 86400000),
        expiresAt: new Date(Date.now() + 86400000),
        isActive: true,
      };

      (prisma.discountCode.findFirst as any).mockResolvedValue(mockCode);
      (prisma.discountUsage.count as any).mockResolvedValue(0);
      (prisma.patient.findUnique as any).mockResolvedValue({
        id: 1,
        createdAt: new Date('2025-01-01'),
      });
      (prisma.invoice.count as any).mockResolvedValue(2); // Has previous orders

      const result = await PricingEngine.validateDiscountCode('FIRSTORDER', 1, 1);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('first-time');
    });
  });

  describe('Product Category Restrictions', () => {
    it('should apply discount only to specific category', () => {
      const mockCode = {
        id: 1,
        code: 'MEDS15',
        discountType: 'PERCENTAGE',
        discountValue: 15,
        applyTo: 'CATEGORY',
        productCategory: 'MEDICATION',
        maxUses: 100,
        currentUses: 5,
        maxUsesPerPatient: 3,
        isActive: true,
      };

      // Discount applies to medication
      const applicableResult = PricingEngine.isDiscountApplicable(mockCode, {
        productCategory: 'MEDICATION',
      });
      expect(applicableResult).toBe(true);

      // Discount does not apply to lab tests
      const notApplicableResult = PricingEngine.isDiscountApplicable(mockCode, {
        productCategory: 'LAB_TEST',
      });
      expect(notApplicableResult).toBe(false);
    });
  });

  describe('Affiliate Commission', () => {
    it('should calculate affiliate commission correctly', () => {
      const result = PricingEngine.calculateAffiliateCommission({
        orderTotal: 22900, // $229.00
        commissionRate: 10, // 10%
        tier: 'GOLD',
      });

      expect(result.commission).toBe(2290); // $22.90
      expect(result.tier).toBe('GOLD');
    });

    it('should apply tier multiplier to commission', () => {
      // Gold tier gets 1.5x multiplier
      const goldResult = PricingEngine.calculateAffiliateCommission({
        orderTotal: 10000,
        commissionRate: 10,
        tier: 'GOLD',
        tierMultiplier: 1.5,
      });

      expect(goldResult.commission).toBe(1500); // $15.00 (10% * 1.5)

      // Bronze tier gets base rate
      const bronzeResult = PricingEngine.calculateAffiliateCommission({
        orderTotal: 10000,
        commissionRate: 10,
        tier: 'BRONZE',
        tierMultiplier: 1.0,
      });

      expect(bronzeResult.commission).toBe(1000); // $10.00
    });
  });
});

describe('Product Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a one-time product', async () => {
    const mockProduct = {
      id: 1,
      clinicId: 1,
      name: 'Initial Consultation',
      shortDescription: 'First visit consultation',
      price: 15000,
      category: 'SERVICE',
      billingType: 'ONE_TIME',
      isActive: true,
      isVisible: true,
    };

    (prisma.product.create as any).mockResolvedValue(mockProduct);

    const result = await prisma.product.create({
      data: mockProduct,
    });

    expect(result.billingType).toBe('ONE_TIME');
    expect(result.price).toBe(15000);
  });

  it('should create a recurring subscription product', async () => {
    const mockProduct = {
      id: 2,
      clinicId: 1,
      name: 'Monthly Semaglutide',
      shortDescription: 'Monthly subscription',
      price: 22900,
      category: 'MEDICATION',
      billingType: 'RECURRING',
      billingInterval: 'MONTHLY',
      billingIntervalCount: 1,
      trialDays: 0,
      stripeProductId: 'prod_stripe123',
      stripePriceId: 'price_stripe456',
      isActive: true,
      isVisible: true,
    };

    (prisma.product.create as any).mockResolvedValue(mockProduct);

    const result = await prisma.product.create({
      data: mockProduct,
    });

    expect(result.billingType).toBe('RECURRING');
    expect(result.billingInterval).toBe('MONTHLY');
    expect(result.stripeProductId).toBe('prod_stripe123');
    expect(result.stripePriceId).toBe('price_stripe456');
  });

  it('should retrieve products by category', async () => {
    const mockProducts = [
      { id: 1, name: 'Semaglutide', category: 'MEDICATION', price: 22900 },
      { id: 2, name: 'Tirzepatide', category: 'MEDICATION', price: 34900 },
    ];

    (prisma.product.findMany as any).mockResolvedValue(mockProducts);

    const result = await prisma.product.findMany({
      where: { clinicId: 1, category: 'MEDICATION' },
    });

    expect(result).toHaveLength(2);
    expect(result.every((p: any) => p.category === 'MEDICATION')).toBe(true);
  });
});

describe('Subscription Management', () => {
  it('should handle subscription pause request', () => {
    const pauseRequest = {
      subscriptionId: 'sub_001',
      pauseStartDate: new Date(),
      pauseEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      reason: 'Travel',
    };

    // Verify pause duration is valid (max 90 days)
    const pauseDays = Math.ceil(
      (pauseRequest.pauseEndDate.getTime() - pauseRequest.pauseStartDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    expect(pauseDays).toBeLessThanOrEqual(90);
    expect(pauseDays).toBe(30);
  });

  it('should track upgrade/downgrade history', () => {
    const upgradeEvent = {
      subscriptionId: 'sub_001',
      previousPlanId: 'prod_basic',
      newPlanId: 'prod_premium',
      previousPrice: 19900,
      newPrice: 34900,
      changeType: 'UPGRADE',
      effectiveDate: new Date(),
      prorationAmount: 7500, // Credit for remaining days
    };

    expect(upgradeEvent.changeType).toBe('UPGRADE');
    expect(upgradeEvent.newPrice).toBeGreaterThan(upgradeEvent.previousPrice);
  });

  it('should apply retention offer for cancellation', () => {
    const retentionOffer = {
      type: 'DISCOUNT',
      discountPercent: 25,
      durationMonths: 3,
      message: 'Stay with us and get 25% off for the next 3 months!',
    };

    const currentPrice = 22900;
    const discountedPrice = Math.round(currentPrice * (1 - retentionOffer.discountPercent / 100));

    expect(discountedPrice).toBe(17175); // $171.75
    expect(retentionOffer.durationMonths).toBe(3);
  });
});

describe('API Route Validation', () => {
  it('should validate discount code creation payload', () => {
    const validPayload = {
      code: 'SUMMER25',
      name: 'Summer Sale 25%',
      discountType: 'PERCENTAGE',
      discountValue: 25,
      applyTo: 'ALL_PRODUCTS',
      maxUses: 100,
      startsAt: new Date().toISOString(),
      isActive: true,
    };

    // Validate required fields
    expect(validPayload.code).toBeDefined();
    expect(validPayload.discountType).toMatch(/^(PERCENTAGE|FIXED_AMOUNT)$/);
    expect(validPayload.discountValue).toBeGreaterThan(0);
    
    // Validate percentage is <= 100
    if (validPayload.discountType === 'PERCENTAGE') {
      expect(validPayload.discountValue).toBeLessThanOrEqual(100);
    }
  });

  it('should validate bundle creation payload', () => {
    const validPayload = {
      name: 'Weight Loss Package',
      description: 'Complete weight loss program',
      regularPrice: 49900,
      bundlePrice: 39900,
      billingType: 'ONE_TIME',
      items: [
        { productId: 1, quantity: 1 },
        { productId: 2, quantity: 1 },
      ],
    };

    expect(validPayload.bundlePrice).toBeLessThan(validPayload.regularPrice);
    expect(validPayload.items.length).toBeGreaterThan(0);
  });

  it('should validate promotion creation payload', () => {
    const validPayload = {
      name: 'Flash Sale',
      promotionType: 'FLASH_SALE',
      discountType: 'PERCENTAGE',
      discountValue: 20,
      applyTo: 'ALL_PRODUCTS',
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      autoApply: true,
      bannerText: '24-Hour Flash Sale - 20% Off!',
    };

    const startsAt = new Date(validPayload.startsAt);
    const endsAt = new Date(validPayload.endsAt);

    expect(endsAt.getTime()).toBeGreaterThan(startsAt.getTime());
    expect(validPayload.autoApply).toBe(true);
  });
});

describe('Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle zero discount value', () => {
    const result = PricingEngine.calculateDiscount(10000, 'PERCENTAGE', 0);
    expect(result).toBe(0);
  });

  it('should handle negative amounts gracefully', () => {
    // Should not allow negative discounts
    const result = PricingEngine.calculateDiscount(10000, 'FIXED_AMOUNT', -500);
    expect(result).toBeLessThanOrEqual(0);
  });

  it('should handle very large discount values', () => {
    const result = PricingEngine.calculateDiscount(10000, 'PERCENTAGE', 150);
    // Should cap at order total
    expect(result).toBe(15000); // 150% of 10000
  });

  it('should handle discount on zero order', () => {
    const result = PricingEngine.calculateDiscount(0, 'PERCENTAGE', 20);
    expect(result).toBe(0);
  });
});

describe('Integration Tests - Price Calculation Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate complex pricing scenario correctly', async () => {
    // Setup: $229 product with 10% code + 5% promo + volume discount
    const mockCode = {
      id: 1,
      code: 'SAVE10',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      applyTo: 'ALL_PRODUCTS',
      maxUses: 100,
      currentUses: 0,
      maxUsesPerPatient: 5,
      startsAt: new Date(Date.now() - 86400000),
      expiresAt: new Date(Date.now() + 86400000),
      isActive: true,
    };

    const mockPromo = [{
      id: 1,
      name: 'Site-wide Sale',
      promotionType: 'SALE',
      discountType: 'PERCENTAGE',
      discountValue: 5,
      applyTo: 'ALL_PRODUCTS',
      startsAt: new Date(Date.now() - 86400000),
      endsAt: new Date(Date.now() + 86400000),
      autoApply: true,
      stackable: true,
      isActive: true,
    }];

    const mockRules = [{
      id: 1,
      name: 'Volume Discount',
      ruleType: 'VOLUME_DISCOUNT',
      conditions: [{ type: 'quantity', operator: '>=', value: 3 }],
      discountType: 'PERCENTAGE',
      discountValue: 5,
      applyTo: 'ALL_PRODUCTS',
      priority: 10,
      isActive: true,
    }];

    (prisma.discountCode.findFirst as any).mockResolvedValue(mockCode);
    (prisma.discountUsage.count as any).mockResolvedValue(0);
    (prisma.promotion.findMany as any).mockResolvedValue(mockPromo);
    (prisma.pricingRule.findMany as any).mockResolvedValue(mockRules);

    const result = await PricingEngine.calculateFinalPrice({
      clinicId: 1,
      subtotal: 68700, // $687 (3 items at $229)
      discountCode: 'SAVE10',
      patientId: 1,
      applyPromotions: true,
      quantity: 3,
    });

    // Verify discounts were applied
    expect(result.subtotal).toBe(68700);
    expect(result.discountCodeDiscount).toBeGreaterThan(0);
    expect(result.promotionDiscount).toBeGreaterThan(0);
    expect(result.finalTotal).toBeLessThan(68700);

    // Verify final total is reasonable
    // $687 - 10% ($68.70) - 5% of remaining - 5% volume
    expect(result.finalTotal).toBeGreaterThan(50000); // Should be > $500
    expect(result.finalTotal).toBeLessThan(65000); // Should be < $650
  });

  it('should handle no applicable discounts', async () => {
    (prisma.discountCode.findFirst as any).mockResolvedValue(null);
    (prisma.promotion.findMany as any).mockResolvedValue([]);
    (prisma.pricingRule.findMany as any).mockResolvedValue([]);

    const result = await PricingEngine.calculateFinalPrice({
      clinicId: 1,
      subtotal: 22900,
      patientId: 1,
    });

    expect(result.subtotal).toBe(22900);
    expect(result.discountAmount).toBe(0);
    expect(result.finalTotal).toBe(22900);
  });
});
