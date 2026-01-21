/**
 * PRICING ENGINE SERVICE
 * ======================
 * Central service for calculating prices with all applicable discounts,
 * promotions, and pricing rules.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface PricingLineItem {
  productId?: number;
  bundleId?: number;
  description: string;
  quantity: number;
  unitPrice: number; // Original price in cents
  category?: string;
}

export interface PricingContext {
  clinicId: number;
  patientId?: number;
  discountCode?: string;
  isFirstPurchase?: boolean;
  patientTags?: string[];
}

export interface AppliedDiscount {
  source: 'discount_code' | 'promotion' | 'pricing_rule' | 'bundle';
  name: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number;
  amountSaved: number;
  appliedToItems?: number[]; // Product IDs affected
}

export interface PricingResult {
  subtotal: number;           // Original total before discounts
  discountTotal: number;      // Total discount amount
  taxAmount: number;          // Tax if applicable
  total: number;              // Final amount
  appliedDiscounts: AppliedDiscount[];
  lineItems: Array<PricingLineItem & {
    finalPrice: number;
    discountedAmount: number;
  }>;
  warnings?: string[];
}

export class PricingEngine {
  /**
   * Calculate the final price for a set of line items
   */
  static async calculatePrice(
    lineItems: PricingLineItem[],
    context: PricingContext
  ): Promise<PricingResult> {
    const appliedDiscounts: AppliedDiscount[] = [];
    const warnings: string[] = [];
    
    // Calculate subtotal
    let subtotal = lineItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    
    // Track discounts per item
    const itemDiscounts = new Map<number, number>();
    
    // Initialize processed line items
    const processedItems = lineItems.map(item => ({
      ...item,
      finalPrice: item.unitPrice * item.quantity,
      discountedAmount: 0,
    }));

    // 1. Apply auto-apply promotions
    const promotions = await this.getActivePromotions(context.clinicId, lineItems);
    for (const promo of promotions) {
      if (promo.autoApply) {
        const discount = this.applyPromotion(promo, processedItems, subtotal);
        if (discount) {
          appliedDiscounts.push(discount);
        }
      }
    }

    // 2. Apply pricing rules
    const pricingRules = await this.getApplicablePricingRules(context);
    for (const rule of pricingRules) {
      const discount = this.applyPricingRule(rule, processedItems, context);
      if (discount) {
        appliedDiscounts.push(discount);
      }
    }

    // 3. Apply discount code (if provided)
    if (context.discountCode) {
      const codeDiscount = await this.applyDiscountCode(
        context.discountCode,
        context,
        processedItems,
        subtotal
      );
      if (codeDiscount) {
        appliedDiscounts.push(codeDiscount);
      } else {
        warnings.push('Discount code could not be applied');
      }
    }

    // Calculate totals
    const discountTotal = appliedDiscounts.reduce((sum, d) => sum + d.amountSaved, 0);
    const afterDiscount = Math.max(0, subtotal - discountTotal);
    
    // Calculate tax (if applicable - check clinic settings)
    const taxAmount = 0; // TODO: Implement tax calculation based on clinic settings
    
    const total = afterDiscount + taxAmount;

    return {
      subtotal,
      discountTotal,
      taxAmount,
      total,
      appliedDiscounts,
      lineItems: processedItems,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Get active promotions for the given products
   */
  private static async getActivePromotions(clinicId: number, lineItems: PricingLineItem[]) {
    const now = new Date();
    const productIds = lineItems.filter(i => i.productId).map(i => i.productId!);

    const promotions = await prisma.promotion.findMany({
      where: {
        clinicId,
        isActive: true,
        startsAt: { lte: now },
        OR: [
          { endsAt: null },
          { endsAt: { gte: now } },
        ],
      },
    });

    // Filter to promotions applicable to our products
    return promotions.filter((promo: typeof promotions[0]) => {
      if (promo.applyTo === 'ALL_PRODUCTS') return true;
      if (promo.applyTo === 'LIMITED_PRODUCTS' && promo.productIds) {
        const allowedIds = promo.productIds as number[];
        return productIds.some(id => allowedIds.includes(id));
      }
      return true;
    });
  }

  /**
   * Get applicable pricing rules
   */
  private static async getApplicablePricingRules(context: PricingContext) {
    const now = new Date();

    return await prisma.pricingRule.findMany({
      where: {
        clinicId: context.clinicId,
        isActive: true,
        OR: [
          { startsAt: null },
          { startsAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endsAt: null },
              { endsAt: { gte: now } },
            ],
          },
        ],
      },
      orderBy: { priority: 'desc' },
    });
  }

  /**
   * Apply a promotion to line items
   */
  private static applyPromotion(
    promo: any,
    items: Array<PricingLineItem & { finalPrice: number; discountedAmount: number }>,
    subtotal: number
  ): AppliedDiscount | null {
    // Check max redemptions
    if (promo.maxRedemptions && promo.currentRedemptions >= promo.maxRedemptions) {
      return null;
    }

    let amountSaved = 0;
    const affectedItems: number[] = [];

    // Get applicable items
    const applicableItems = items.filter(item => {
      if (!item.productId) return false;
      if (promo.applyTo === 'ALL_PRODUCTS') return true;
      if (promo.applyTo === 'LIMITED_PRODUCTS' && promo.productIds) {
        return (promo.productIds as number[]).includes(item.productId);
      }
      if (promo.applyTo === 'LIMITED_CATEGORIES' && promo.categoryIds && item.category) {
        return (promo.categoryIds as string[]).includes(item.category);
      }
      return true;
    });

    if (applicableItems.length === 0) return null;

    const applicableTotal = applicableItems.reduce((sum, item) => sum + item.finalPrice, 0);

    if (promo.discountType === 'PERCENTAGE') {
      amountSaved = Math.round(applicableTotal * (promo.discountValue / 100));
    } else if (promo.discountType === 'FIXED_AMOUNT') {
      amountSaved = Math.min(promo.discountValue, applicableTotal);
    }

    if (amountSaved === 0) return null;

    // Distribute savings across applicable items
    for (const item of applicableItems) {
      const itemShare = Math.round((item.finalPrice / applicableTotal) * amountSaved);
      item.discountedAmount += itemShare;
      item.finalPrice -= itemShare;
      if (item.productId) affectedItems.push(item.productId);
    }

    return {
      source: 'promotion',
      name: promo.name,
      type: promo.discountType,
      value: promo.discountValue,
      amountSaved,
      appliedToItems: affectedItems,
    };
  }

  /**
   * Apply a pricing rule
   */
  private static applyPricingRule(
    rule: any,
    items: Array<PricingLineItem & { finalPrice: number; discountedAmount: number }>,
    context: PricingContext
  ): AppliedDiscount | null {
    const conditions = rule.conditions as any[];
    
    // Check all conditions
    for (const condition of conditions) {
      if (!this.evaluateCondition(condition, items, context)) {
        return null;
      }
    }

    // Calculate discount
    let amountSaved = 0;
    const applicableTotal = items.reduce((sum, item) => sum + item.finalPrice, 0);

    if (rule.discountType === 'PERCENTAGE') {
      amountSaved = Math.round(applicableTotal * (rule.discountValue / 100));
    } else if (rule.discountType === 'FIXED_AMOUNT') {
      amountSaved = Math.min(rule.discountValue, applicableTotal);
    }

    if (amountSaved === 0) return null;

    // Apply to items
    for (const item of items) {
      const itemShare = Math.round((item.finalPrice / applicableTotal) * amountSaved);
      item.discountedAmount += itemShare;
      item.finalPrice -= itemShare;
    }

    return {
      source: 'pricing_rule',
      name: rule.name,
      type: rule.discountType,
      value: rule.discountValue,
      amountSaved,
    };
  }

  /**
   * Evaluate a pricing rule condition
   */
  private static evaluateCondition(
    condition: any,
    items: PricingLineItem[],
    context: PricingContext
  ): boolean {
    const { type, operator, value } = condition;

    switch (type) {
      case 'quantity':
        const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
        return this.compareValues(totalQuantity, operator, value);

      case 'subtotal':
        const subtotal = items.reduce((sum, i) => sum + (i.unitPrice * i.quantity), 0);
        return this.compareValues(subtotal, operator, value);

      case 'patientTag':
        if (!context.patientTags) return false;
        if (operator === 'contains') {
          return context.patientTags.includes(value);
        }
        return false;

      case 'firstPurchase':
        return context.isFirstPurchase === (value === true || value === 'true');

      default:
        return false;
    }
  }

  /**
   * Compare values with operator
   */
  private static compareValues(a: number, operator: string, b: number): boolean {
    switch (operator) {
      case '>=': return a >= b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '<': return a < b;
      case '==': return a === b;
      case '!=': return a !== b;
      default: return false;
    }
  }

  /**
   * Apply a discount code
   */
  private static async applyDiscountCode(
    code: string,
    context: PricingContext,
    items: Array<PricingLineItem & { finalPrice: number; discountedAmount: number }>,
    subtotal: number
  ): Promise<AppliedDiscount | null> {
    const discountCode = await prisma.discountCode.findFirst({
      where: {
        clinicId: context.clinicId,
        code: code.toUpperCase(),
        isActive: true,
      },
    });

    if (!discountCode) return null;

    // Validate (simplified - full validation in validate API)
    const now = new Date();
    if (discountCode.startsAt > now) return null;
    if (discountCode.expiresAt && discountCode.expiresAt < now) return null;
    if (discountCode.maxUses && discountCode.currentUses >= discountCode.maxUses) return null;
    if (discountCode.minOrderAmount && subtotal < discountCode.minOrderAmount) return null;

    // Calculate discount
    let amountSaved = 0;
    const affectedItems: number[] = [];

    // Get applicable items
    let applicableItems = items;
    if (discountCode.applyTo === 'LIMITED_PRODUCTS' && discountCode.productIds) {
      const allowedIds = discountCode.productIds as number[];
      applicableItems = items.filter(i => i.productId && allowedIds.includes(i.productId));
    }

    if (applicableItems.length === 0) return null;

    const applicableTotal = applicableItems.reduce((sum, i) => sum + i.finalPrice, 0);

    if (discountCode.discountType === 'PERCENTAGE') {
      amountSaved = Math.round(applicableTotal * (discountCode.discountValue / 100));
    } else if (discountCode.discountType === 'FIXED_AMOUNT') {
      amountSaved = Math.min(discountCode.discountValue, applicableTotal);
    }

    if (amountSaved === 0) return null;

    // Apply to items
    for (const item of applicableItems) {
      const itemShare = Math.round((item.finalPrice / applicableTotal) * amountSaved);
      item.discountedAmount += itemShare;
      item.finalPrice -= itemShare;
      if (item.productId) affectedItems.push(item.productId);
    }

    return {
      source: 'discount_code',
      name: `${discountCode.name} (${discountCode.code})`,
      type: discountCode.discountType as 'PERCENTAGE' | 'FIXED_AMOUNT',
      value: discountCode.discountValue,
      amountSaved,
      appliedToItems: affectedItems,
    };
  }

  /**
   * Record usage of a discount code
   */
  static async recordDiscountUsage(
    discountCodeId: number,
    patientId: number,
    invoiceId: number | null,
    amountSaved: number,
    orderTotal: number
  ): Promise<void> {
    await prisma.$transaction([
      prisma.discountUsage.create({
        data: {
          discountCodeId,
          patientId,
          invoiceId,
          amountSaved,
          orderTotal,
        },
      }),
      prisma.discountCode.update({
        where: { id: discountCodeId },
        data: { currentUses: { increment: 1 } },
      }),
    ]);

    logger.info('[PricingEngine] Recorded discount usage', { discountCodeId, patientId, amountSaved });
  }

  /**
   * Validate a discount code
   */
  static async validateDiscountCode(
    code: string,
    clinicId: number,
    patientId?: number,
    orderAmount?: number
  ): Promise<{
    valid: boolean;
    discountCode?: any;
    error?: string;
  }> {
    const discountCode = await prisma.discountCode.findFirst({
      where: {
        clinicId,
        code: code.toUpperCase(),
        isActive: true,
      },
    });

    if (!discountCode) {
      return { valid: false, error: 'Discount code not found or inactive' };
    }

    const now = new Date();

    // Check if not started yet
    if (discountCode.startsAt && discountCode.startsAt > now) {
      return { valid: false, error: 'Discount code not yet active' };
    }

    // Check expiration
    if (discountCode.expiresAt && discountCode.expiresAt < now) {
      return { valid: false, error: 'Discount code has expired' };
    }

    // Check max uses
    if (discountCode.maxUses && discountCode.currentUses >= discountCode.maxUses) {
      return { valid: false, error: 'Discount code has reached its usage limit' };
    }

    // Check patient-specific limits
    if (patientId && discountCode.maxUsesPerPatient) {
      const patientUsage = await prisma.discountUsage.count({
        where: {
          discountCodeId: discountCode.id,
          patientId,
        },
      });

      if (patientUsage >= discountCode.maxUsesPerPatient) {
        return { valid: false, error: 'You have already used this discount code' };
      }
    }

    // Check first-time only
    if (discountCode.firstTimeOnly && patientId) {
      const patient = await prisma.patient.findUnique({
        where: { id: patientId },
        select: { createdAt: true },
      });

      // Check if patient has any previous orders
      const orderCount = await prisma.invoice.count({
        where: {
          patientId,
          status: 'PAID',
        },
      });

      if (orderCount > 0) {
        return { valid: false, error: 'This discount code is for first-time customers only' };
      }
    }

    // Check minimum order amount
    if (discountCode.minOrderAmount && orderAmount !== undefined) {
      if (orderAmount < discountCode.minOrderAmount) {
        return {
          valid: false,
          error: `Minimum order of $${(discountCode.minOrderAmount / 100).toFixed(2)} required`,
        };
      }
    }

    return { valid: true, discountCode };
  }

  /**
   * Calculate discount amount
   */
  static calculateDiscount(
    amount: number,
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT',
    discountValue: number
  ): number {
    if (discountType === 'PERCENTAGE') {
      return Math.round(amount * (discountValue / 100));
    } else {
      return Math.min(discountValue, amount);
    }
  }

  /**
   * Get all active promotions for a clinic
   */
  static async getActivePromotionsForClinic(clinicId: number) {
    const now = new Date();

    return await prisma.promotion.findMany({
      where: {
        clinicId,
        isActive: true,
        startsAt: { lte: now },
        OR: [
          { endsAt: null },
          { endsAt: { gte: now } },
        ],
      },
      orderBy: { priority: 'desc' },
    });
  }

  /**
   * Get a bundle with its items
   */
  static async getBundle(bundleId: number, clinicId: number) {
    return await prisma.productBundle.findFirst({
      where: {
        id: bundleId,
        clinicId,
        isActive: true,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  /**
   * Get pricing rules for a clinic
   */
  static async getPricingRulesForClinic(clinicId: number) {
    const now = new Date();

    return await prisma.pricingRule.findMany({
      where: {
        clinicId,
        isActive: true,
        OR: [
          { startsAt: null },
          { startsAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endsAt: null },
              { endsAt: { gte: now } },
            ],
          },
        ],
      },
      orderBy: { priority: 'desc' },
    });
  }

  /**
   * Check if a discount is applicable to specific context
   */
  static isDiscountApplicable(
    discountCode: any,
    context: { productCategory?: string; productId?: number }
  ): boolean {
    if (discountCode.applyTo === 'ALL_PRODUCTS') {
      return true;
    }

    if (discountCode.applyTo === 'CATEGORY' && discountCode.productCategory) {
      return context.productCategory === discountCode.productCategory;
    }

    if (discountCode.applyTo === 'LIMITED_PRODUCTS' && discountCode.productIds) {
      const productIds = discountCode.productIds as number[];
      return context.productId !== undefined && productIds.includes(context.productId);
    }

    return true;
  }

  /**
   * Calculate affiliate commission
   */
  static calculateAffiliateCommission(params: {
    orderTotal: number;
    commissionRate: number;
    tier?: string;
    tierMultiplier?: number;
  }): { commission: number; tier?: string } {
    const multiplier = params.tierMultiplier || 1.0;
    const commission = Math.round(params.orderTotal * (params.commissionRate / 100) * multiplier);

    return {
      commission,
      tier: params.tier,
    };
  }

  /**
   * Calculate final price with all applicable discounts
   */
  static async calculateFinalPrice(params: {
    clinicId: number;
    subtotal: number;
    discountCode?: string;
    patientId?: number;
    applyPromotions?: boolean;
    quantity?: number;
  }): Promise<{
    subtotal: number;
    discountAmount: number;
    discountCodeDiscount: number;
    promotionDiscount: number;
    rulesDiscount: number;
    finalTotal: number;
    appliedDiscounts: Array<{ name: string; amount: number; type: string }>;
  }> {
    let discountCodeDiscount = 0;
    let promotionDiscount = 0;
    let rulesDiscount = 0;
    const appliedDiscounts: Array<{ name: string; amount: number; type: string }> = [];

    let runningTotal = params.subtotal;

    // 1. Apply discount code first
    if (params.discountCode) {
      const validation = await this.validateDiscountCode(
        params.discountCode,
        params.clinicId,
        params.patientId,
        params.subtotal
      );

      if (validation.valid && validation.discountCode) {
        discountCodeDiscount = this.calculateDiscount(
          runningTotal,
          validation.discountCode.discountType,
          validation.discountCode.discountValue
        );
        runningTotal -= discountCodeDiscount;
        appliedDiscounts.push({
          name: validation.discountCode.code,
          amount: discountCodeDiscount,
          type: 'discount_code',
        });
      }
    }

    // 2. Apply auto-apply promotions
    if (params.applyPromotions !== false) {
      const promotions = await this.getActivePromotionsForClinic(params.clinicId);

      for (const promo of promotions) {
        if (promo.autoApply && (promo.stackable || appliedDiscounts.length === 0)) {
          const promoDiscount = this.calculateDiscount(
            runningTotal,
            promo.discountType as 'PERCENTAGE' | 'FIXED_AMOUNT',
            promo.discountValue
          );
          promotionDiscount += promoDiscount;
          runningTotal -= promoDiscount;
          appliedDiscounts.push({
            name: promo.name,
            amount: promoDiscount,
            type: 'promotion',
          });
        }
      }
    }

    // 3. Apply pricing rules
    const rules = await this.getPricingRulesForClinic(params.clinicId);

    for (const rule of rules) {
      // Check quantity-based rules
      const conditions = rule.conditions as any[];
      let conditionsMet = true;

      for (const condition of conditions || []) {
        if (condition.type === 'quantity' && params.quantity) {
          conditionsMet = this.compareValues(
            params.quantity,
            condition.operator,
            condition.value
          );
        }
      }

      if (conditionsMet) {
        const ruleDiscount = this.calculateDiscount(
          runningTotal,
          rule.discountType as 'PERCENTAGE' | 'FIXED_AMOUNT',
          rule.discountValue
        );
        rulesDiscount += ruleDiscount;
        runningTotal -= ruleDiscount;
        appliedDiscounts.push({
          name: rule.name,
          amount: ruleDiscount,
          type: 'pricing_rule',
        });
      }
    }

    const totalDiscount = discountCodeDiscount + promotionDiscount + rulesDiscount;

    return {
      subtotal: params.subtotal,
      discountAmount: totalDiscount,
      discountCodeDiscount,
      promotionDiscount,
      rulesDiscount,
      finalTotal: Math.max(0, params.subtotal - totalDiscount),
      appliedDiscounts,
    };
  }
}
