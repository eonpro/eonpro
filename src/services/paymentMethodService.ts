import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  encrypt,
  decrypt,
  getLast4,
  detectCardBrand,
  validateCardNumber,
  generateCardFingerprint,
} from '@/lib/encryption';
import type { PaymentMethod } from '@prisma/client';

export interface CardDetails {
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cvv?: string;
  cardholderName: string;
  billingZip: string;
}

export interface SavedCard {
  id: number;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  cardholderName: string;
  isDefault: boolean;
  createdAt: Date;
}

export class PaymentMethodService {
  /**
   * @deprecated Raw card storage is a PCI DSS violation. Use Stripe Elements +
   * SetupIntent flow instead (POST /api/payment-methods/setup-intent →
   * POST /api/payment-methods/save-stripe). This method is kept only to avoid
   * breaking existing callers during migration and will throw at runtime.
   */
  static async addPaymentMethod(
    _patientId: number,
    _cardDetails: CardDetails,
    _setAsDefault: boolean = false
  ): Promise<PaymentMethod> {
    throw new Error(
      'Raw card storage is disabled (PCI DSS). Use the Stripe Elements SetupIntent flow.'
    );
  }

  /**
   * Get all active payment methods for a patient (without decrypting)
   */
  static async getPaymentMethods(patientId: number): Promise<SavedCard[]> {
    const methods = await prisma.paymentMethod.findMany({
      where: {
        patientId,
        isActive: true,
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return methods.map((method: any) => ({
      id: method.id,
      last4: method.cardLast4,
      brand: method.cardBrand || 'Unknown',
      expiryMonth: method.expiryMonth,
      expiryYear: method.expiryYear,
      cardholderName: method.cardholderName,
      isDefault: method.isDefault,
      createdAt: method.createdAt,
    }));
  }

  /**
   * @deprecated Decrypting stored card data is a PCI DSS violation. Card data
   * should only be handled by Stripe. This method has been removed.
   */
  static async getDecryptedCard(
    _paymentMethodId: number,
    _patientId: number
  ): Promise<CardDetails | null> {
    throw new Error(
      'Card decryption is disabled (PCI DSS). Use Stripe PaymentMethod tokens instead.'
    );
  }

  /**
   * Set a payment method as default
   */
  static async setDefaultPaymentMethod(paymentMethodId: number, patientId: number): Promise<void> {
    // Verify ownership
    const method: any = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        patientId,
        isActive: true,
      },
    });

    if (!method) {
      throw new Error('Payment method not found');
    }

    // Unset other defaults
    await prisma.paymentMethod.updateMany({
      where: {
        patientId,
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });

    // Set new default
    await prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: { isDefault: true },
    });
  }

  /**
   * Remove a payment method (soft delete)
   */
  static async removePaymentMethod(paymentMethodId: number, patientId: number): Promise<void> {
    const method: any = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        patientId,
      },
    });

    if (!method) {
      throw new Error('Payment method not found');
    }

    // Soft delete
    await prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: { isActive: false },
    });

    // If this was the default, set another as default
    if (method.isDefault) {
      const nextDefault: any = await prisma.paymentMethod.findFirst({
        where: {
          patientId,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (nextDefault) {
        await prisma.paymentMethod.update({
          where: { id: nextDefault.id },
          data: { isDefault: true },
        });
      }
    }
  }

  /**
   * Update payment method expiry
   */
  static async updateExpiry(
    paymentMethodId: number,
    patientId: number,
    expiryMonth: number,
    expiryYear: number
  ): Promise<void> {
    const method: any = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        patientId,
        isActive: true,
      },
    });

    if (!method) {
      throw new Error('Payment method not found');
    }

    // Validate new expiry
    const now = new Date();
    const expiryDate = new Date(expiryYear, expiryMonth - 1);
    if (expiryDate < now) {
      throw new Error('Card has expired');
    }

    await prisma.paymentMethod.update({
      where: { id: paymentMethodId },
      data: {
        expiryMonth,
        expiryYear,
      },
    });
  }

  /**
   * Check if a payment method is expired
   */
  static isExpired(expiryMonth: number, expiryYear: number): boolean {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    return expiryYear < currentYear || (expiryYear === currentYear && expiryMonth < currentMonth);
  }

  /**
   * Format card for display
   */
  static formatCardDisplay(card: SavedCard): string {
    const expiry = `${String(card.expiryMonth).padStart(2, '0')}/${String(card.expiryYear).slice(-2)}`;
    return `${card.brand} •••• ${card.last4} (${expiry})`;
  }
}
