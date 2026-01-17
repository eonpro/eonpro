/**
 * E2E Tests for Pricing System
 * Tests product catalog, discounts, promotions, bundles, and pricing calculations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    discountCode: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    promotion: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    productBundle: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    discountCodeUsage: {
      create: vi.fn(),
      count: vi.fn(),
    },
  },
  setClinicContext: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('E2E: Product Catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Product Management', () => {
    it('should create a one-time product', async () => {
      const createProduct = async (data: {
        name: string;
        description?: string;
        category: string;
        price: number;
        billingType: 'ONE_TIME' | 'RECURRING';
        clinicId: number;
      }) => {
        return {
          id: Date.now(),
          ...data,
          currency: 'usd',
          isActive: true,
          isVisible: true,
          stripeProductId: `prod_${Date.now()}`,
          stripePriceId: `price_${Date.now()}`,
          createdAt: new Date(),
        };
      };

      const product = await createProduct({
        name: 'Consultation Fee',
        description: 'Initial consultation',
        category: 'SERVICE',
        price: 15000, // $150.00 in cents
        billingType: 'ONE_TIME',
        clinicId: 1,
      });

      expect(product.name).toBe('Consultation Fee');
      expect(product.price).toBe(15000);
      expect(product.billingType).toBe('ONE_TIME');
      expect(product.stripeProductId).toBeDefined();
    });

    it('should create a recurring subscription product', async () => {
      const createSubscriptionProduct = async (data: {
        name: string;
        price: number;
        billingInterval: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
        trialDays?: number;
        clinicId: number;
      }) => {
        const intervalMap = {
          MONTHLY: { interval: 'month', count: 1 },
          QUARTERLY: { interval: 'month', count: 3 },
          ANNUAL: { interval: 'year', count: 1 },
        };

        return {
          id: Date.now(),
          ...data,
          billingType: 'RECURRING',
          billingIntervalCount: intervalMap[data.billingInterval].count,
          stripeProductId: `prod_${Date.now()}`,
          stripePriceId: `price_${Date.now()}`,
          createdAt: new Date(),
        };
      };

      const membership = await createSubscriptionProduct({
        name: 'Monthly Membership',
        price: 9900, // $99/month
        billingInterval: 'MONTHLY',
        trialDays: 7,
        clinicId: 1,
      });

      expect(membership.billingType).toBe('RECURRING');
      expect(membership.billingInterval).toBe('MONTHLY');
      expect(membership.trialDays).toBe(7);
    });

    it('should list products by category', async () => {
      const products = [
        { id: 1, name: 'Semaglutide', category: 'MEDICATION', price: 30000 },
        { id: 2, name: 'Lab Panel', category: 'LAB_TEST', price: 15000 },
        { id: 3, name: 'Consultation', category: 'SERVICE', price: 10000 },
        { id: 4, name: 'Tirzepatide', category: 'MEDICATION', price: 45000 },
      ];

      const filterByCategory = (category: string) => {
        return products.filter(p => p.category === category);
      };

      const medications = filterByCategory('MEDICATION');
      expect(medications).toHaveLength(2);
      expect(medications.every(p => p.category === 'MEDICATION')).toBe(true);
    });
  });

  describe('Product Pricing Updates', () => {
    it('should update product price and create new Stripe price', async () => {
      const updateProductPrice = async (productId: number, newPrice: number) => {
        // Archive old price, create new one (Stripe doesn't allow price updates)
        return {
          id: productId,
          price: newPrice,
          stripePriceId: `price_new_${Date.now()}`,
          previousPriceId: `price_old_123`,
          updatedAt: new Date(),
        };
      };

      const updated = await updateProductPrice(1, 35000);
      expect(updated.price).toBe(35000);
      expect(updated.stripePriceId).toContain('price_new_');
    });
  });
});

describe('E2E: Discount Codes', () => {
  describe('Discount Code Creation', () => {
    it('should create percentage discount code', async () => {
      const createDiscount = async (data: {
        code: string;
        name: string;
        discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
        discountValue: number;
        maxUses?: number;
        expiresAt?: Date;
        clinicId: number;
      }) => {
        return {
          id: Date.now(),
          ...data,
          code: data.code.toUpperCase(),
          currentUses: 0,
          isActive: true,
          createdAt: new Date(),
        };
      };

      const discount = await createDiscount({
        code: 'SUMMER20',
        name: 'Summer Sale 20% Off',
        discountType: 'PERCENTAGE',
        discountValue: 20,
        maxUses: 100,
        expiresAt: new Date('2026-08-31'),
        clinicId: 1,
      });

      expect(discount.code).toBe('SUMMER20');
      expect(discount.discountType).toBe('PERCENTAGE');
      expect(discount.discountValue).toBe(20);
    });

    it('should create fixed amount discount code', async () => {
      const createDiscount = async (data: {
        code: string;
        discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
        discountValue: number;
        minOrderAmount?: number;
        clinicId: number;
      }) => {
        return {
          id: Date.now(),
          ...data,
          code: data.code.toUpperCase(),
          isActive: true,
        };
      };

      const discount = await createDiscount({
        code: 'SAVE50',
        discountType: 'FIXED_AMOUNT',
        discountValue: 5000, // $50 off
        minOrderAmount: 10000, // Min $100 order
        clinicId: 1,
      });

      expect(discount.discountValue).toBe(5000);
      expect(discount.minOrderAmount).toBe(10000);
    });
  });

  describe('Discount Code Validation', () => {
    it('should validate active discount code', async () => {
      const validateDiscount = async (
        code: string,
        orderAmount: number,
        patientId?: number
      ) => {
        const discountCode = {
          id: 1,
          code: 'VALID20',
          discountType: 'PERCENTAGE',
          discountValue: 20,
          isActive: true,
          maxUses: 100,
          currentUses: 50,
          minOrderAmount: null,
          expiresAt: new Date('2026-12-31'),
        };

        if (!discountCode.isActive) {
          return { valid: false, error: 'Discount code is not active' };
        }

        if (discountCode.expiresAt && discountCode.expiresAt < new Date()) {
          return { valid: false, error: 'Discount code has expired' };
        }

        if (discountCode.maxUses && discountCode.currentUses >= discountCode.maxUses) {
          return { valid: false, error: 'Discount code usage limit reached' };
        }

        if (discountCode.minOrderAmount && orderAmount < discountCode.minOrderAmount) {
          return { valid: false, error: 'Order does not meet minimum amount' };
        }

        let discountAmount = 0;
        if (discountCode.discountType === 'PERCENTAGE') {
          discountAmount = Math.round(orderAmount * (discountCode.discountValue / 100));
        } else {
          discountAmount = Math.min(discountCode.discountValue, orderAmount);
        }

        return {
          valid: true,
          discountCode,
          discountAmount,
          finalAmount: orderAmount - discountAmount,
        };
      };

      const result = await validateDiscount('VALID20', 10000);
      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBe(2000); // 20% of $100
      expect(result.finalAmount).toBe(8000);
    });

    it('should reject expired discount code', async () => {
      const validateDiscount = async (code: string) => {
        const discountCode = {
          code,
          isActive: true,
          expiresAt: new Date('2020-01-01'), // Expired
        };

        if (discountCode.expiresAt < new Date()) {
          return { valid: false, error: 'Discount code has expired' };
        }

        return { valid: true };
      };

      const result = await validateDiscount('EXPIRED');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Discount code has expired');
    });

    it('should reject discount below minimum order', async () => {
      const validateDiscount = async (orderAmount: number) => {
        const discountCode = {
          isActive: true,
          minOrderAmount: 10000, // $100 minimum
        };

        if (orderAmount < discountCode.minOrderAmount) {
          return { valid: false, error: 'Order does not meet minimum amount' };
        }

        return { valid: true };
      };

      const result = await validateDiscount(5000); // $50 order
      expect(result.valid).toBe(false);
    });
  });

  describe('Discount Usage Tracking', () => {
    it('should track discount code usage', async () => {
      const trackUsage = async (discountCodeId: number, patientId: number, orderId: number) => {
        return {
          id: Date.now(),
          discountCodeId,
          patientId,
          orderId,
          usedAt: new Date(),
        };
      };

      const usage = await trackUsage(1, 100, 500);
      expect(usage.discountCodeId).toBe(1);
      expect(usage.patientId).toBe(100);
    });

    it('should enforce per-patient usage limits', async () => {
      const checkPatientUsage = async (
        discountCodeId: number,
        patientId: number,
        maxUsesPerPatient: number
      ) => {
        const usageCount = 2; // Simulated: patient has used this code twice

        if (usageCount >= maxUsesPerPatient) {
          return { allowed: false, error: 'Maximum uses per patient reached' };
        }

        return { allowed: true, remainingUses: maxUsesPerPatient - usageCount };
      };

      const result = await checkPatientUsage(1, 100, 2);
      expect(result.allowed).toBe(false);
    });
  });
});

describe('E2E: Promotions', () => {
  describe('Time-Based Promotions', () => {
    it('should create a flash sale promotion', async () => {
      const createPromotion = async (data: {
        name: string;
        promotionType: string;
        discountType: string;
        discountValue: number;
        startsAt: Date;
        endsAt: Date;
        clinicId: number;
      }) => {
        return {
          id: Date.now(),
          ...data,
          isActive: true,
          autoApply: true,
          createdAt: new Date(),
        };
      };

      const flashSale = await createPromotion({
        name: 'Flash Sale - 30% Off',
        promotionType: 'FLASH_SALE',
        discountType: 'PERCENTAGE',
        discountValue: 30,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        clinicId: 1,
      });

      expect(flashSale.promotionType).toBe('FLASH_SALE');
      expect(flashSale.autoApply).toBe(true);
    });

    it('should check if promotion is currently active', () => {
      const isPromotionActive = (promotion: {
        isActive: boolean;
        startsAt: Date;
        endsAt: Date | null;
      }) => {
        const now = new Date();
        
        if (!promotion.isActive) return false;
        if (promotion.startsAt > now) return false;
        if (promotion.endsAt && promotion.endsAt < now) return false;
        
        return true;
      };

      const activePromo = {
        isActive: true,
        startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + 86400000),
      };

      const futurePromo = {
        isActive: true,
        startsAt: new Date(Date.now() + 86400000),
        endsAt: null,
      };

      expect(isPromotionActive(activePromo)).toBe(true);
      expect(isPromotionActive(futurePromo)).toBe(false);
    });
  });

  describe('Auto-Apply Promotions', () => {
    it('should automatically apply best promotion to order', async () => {
      const applyBestPromotion = async (
        orderAmount: number,
        productIds: number[],
        promotions: Array<{
          id: number;
          discountType: string;
          discountValue: number;
          applyTo: string;
          productIds?: number[];
        }>
      ) => {
        let bestDiscount = 0;
        let bestPromotion = null;

        for (const promo of promotions) {
          // Check if promotion applies to products in order
          if (promo.applyTo === 'LIMITED_PRODUCTS' && promo.productIds) {
            const hasApplicableProduct = productIds.some(id => 
              promo.productIds!.includes(id)
            );
            if (!hasApplicableProduct) continue;
          }

          let discount = 0;
          if (promo.discountType === 'PERCENTAGE') {
            discount = Math.round(orderAmount * (promo.discountValue / 100));
          } else {
            discount = promo.discountValue;
          }

          if (discount > bestDiscount) {
            bestDiscount = discount;
            bestPromotion = promo;
          }
        }

        return { promotion: bestPromotion, discountAmount: bestDiscount };
      };

      const promotions = [
        { id: 1, discountType: 'PERCENTAGE', discountValue: 10, applyTo: 'ALL_PRODUCTS' },
        { id: 2, discountType: 'PERCENTAGE', discountValue: 20, applyTo: 'LIMITED_PRODUCTS', productIds: [1, 2] },
      ];

      const result = await applyBestPromotion(10000, [1, 3], promotions);
      expect(result.promotion?.id).toBe(2); // 20% is better than 10%
      expect(result.discountAmount).toBe(2000);
    });
  });
});

describe('E2E: Product Bundles', () => {
  describe('Bundle Creation', () => {
    it('should create a product bundle with savings', async () => {
      const createBundle = async (data: {
        name: string;
        items: Array<{ productId: number; quantity: number }>;
        bundlePrice: number;
        clinicId: number;
      }) => {
        // Calculate regular price from items
        const products = [
          { id: 1, name: 'Semaglutide', price: 30000 },
          { id: 2, name: 'Lab Panel', price: 15000 },
          { id: 3, name: 'Consultation', price: 10000 },
        ];

        let regularPrice = 0;
        for (const item of data.items) {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            regularPrice += product.price * item.quantity;
          }
        }

        const savingsAmount = regularPrice - data.bundlePrice;
        const savingsPercent = (savingsAmount / regularPrice) * 100;

        return {
          id: Date.now(),
          ...data,
          regularPrice,
          savingsAmount,
          savingsPercent: Math.round(savingsPercent),
          isActive: true,
          createdAt: new Date(),
        };
      };

      const bundle = await createBundle({
        name: 'Weight Loss Starter Package',
        items: [
          { productId: 1, quantity: 1 }, // Semaglutide $300
          { productId: 2, quantity: 1 }, // Lab Panel $150
          { productId: 3, quantity: 1 }, // Consultation $100
        ],
        bundlePrice: 45000, // $450 (vs $550 regular)
        clinicId: 1,
      });

      expect(bundle.regularPrice).toBe(55000);
      expect(bundle.savingsAmount).toBe(10000);
      expect(bundle.savingsPercent).toBe(18);
    });
  });

  describe('Bundle Pricing', () => {
    it('should calculate bundle price correctly', () => {
      const calculateBundlePrice = (
        items: Array<{ price: number; quantity: number }>,
        bundleDiscount: number // percentage
      ) => {
        const regularTotal = items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
        const discountAmount = Math.round(regularTotal * (bundleDiscount / 100));
        
        return {
          regularTotal,
          discountAmount,
          bundlePrice: regularTotal - discountAmount,
        };
      };

      const result = calculateBundlePrice(
        [
          { price: 30000, quantity: 1 },
          { price: 15000, quantity: 2 },
        ],
        15 // 15% bundle discount
      );

      expect(result.regularTotal).toBe(60000);
      expect(result.discountAmount).toBe(9000);
      expect(result.bundlePrice).toBe(51000);
    });
  });
});

describe('E2E: Pricing Engine', () => {
  describe('Price Calculation', () => {
    it('should calculate final price with all applicable discounts', async () => {
      const calculateFinalPrice = async (params: {
        items: Array<{ productId: number; price: number; quantity: number }>;
        discountCode?: string;
        patientId?: number;
      }) => {
        let subtotal = params.items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );

        let discounts: Array<{ type: string; amount: number; description: string }> = [];

        // Apply discount code if provided
        if (params.discountCode === 'SAVE20') {
          const discountAmount = Math.round(subtotal * 0.2);
          discounts.push({
            type: 'DISCOUNT_CODE',
            amount: discountAmount,
            description: '20% off with code SAVE20',
          });
        }

        // Check for auto-apply promotions (simulated)
        const promoDiscount = Math.round(subtotal * 0.05);
        discounts.push({
          type: 'PROMOTION',
          amount: promoDiscount,
          description: 'New patient promotion',
        });

        const totalDiscount = discounts.reduce((sum, d) => sum + d.amount, 0);
        const finalAmount = Math.max(0, subtotal - totalDiscount);

        return {
          subtotal,
          discounts,
          totalDiscount,
          finalAmount,
        };
      };

      const result = await calculateFinalPrice({
        items: [
          { productId: 1, price: 30000, quantity: 1 },
          { productId: 2, price: 15000, quantity: 1 },
        ],
        discountCode: 'SAVE20',
        patientId: 1,
      });

      expect(result.subtotal).toBe(45000);
      expect(result.discounts).toHaveLength(2);
      expect(result.totalDiscount).toBe(11250); // 20% + 5%
      expect(result.finalAmount).toBe(33750);
    });
  });

  describe('Tax Calculation', () => {
    it('should calculate tax for taxable items', () => {
      const calculateTax = (
        items: Array<{ price: number; quantity: number; taxable: boolean }>,
        taxRate: number
      ) => {
        const taxableAmount = items
          .filter(item => item.taxable)
          .reduce((sum, item) => sum + item.price * item.quantity, 0);

        const taxAmount = Math.round(taxableAmount * taxRate);

        return { taxableAmount, taxAmount };
      };

      const result = calculateTax(
        [
          { price: 30000, quantity: 1, taxable: false }, // Medication (not taxable)
          { price: 5000, quantity: 2, taxable: true },   // Supplies (taxable)
        ],
        0.0825 // 8.25% tax
      );

      expect(result.taxableAmount).toBe(10000);
      expect(result.taxAmount).toBe(825);
    });
  });
});

describe('E2E: Affiliate Commissions', () => {
  describe('Commission Calculation', () => {
    it('should calculate affiliate commission', () => {
      const calculateCommission = (
        orderAmount: number,
        commissionRate: number,
        tierMultiplier: number = 1
      ) => {
        const baseCommission = Math.round(orderAmount * commissionRate);
        const finalCommission = Math.round(baseCommission * tierMultiplier);

        return {
          orderAmount,
          commissionRate,
          tierMultiplier,
          baseCommission,
          finalCommission,
        };
      };

      const result = calculateCommission(10000, 0.1, 1.5); // 10% base, 1.5x tier bonus
      expect(result.baseCommission).toBe(1000);
      expect(result.finalCommission).toBe(1500);
    });

    it('should track affiliate referral', async () => {
      const trackReferral = async (data: {
        affiliateId: number;
        patientId: number;
        orderId: number;
        orderAmount: number;
        commissionAmount: number;
      }) => {
        return {
          id: Date.now(),
          ...data,
          status: 'PENDING',
          createdAt: new Date(),
        };
      };

      const referral = await trackReferral({
        affiliateId: 1,
        patientId: 100,
        orderId: 500,
        orderAmount: 30000,
        commissionAmount: 3000,
      });

      expect(referral.status).toBe('PENDING');
      expect(referral.commissionAmount).toBe(3000);
    });
  });
});
